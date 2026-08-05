import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { SseEvent } from '@control-plus/contracts';

import { composeApplication } from '../../src/infrastructure/composition-root.ts';
import type { Application } from '../../src/infrastructure/composition-root.ts';
import { loadConfig } from '../../src/infrastructure/config/load-config.ts';
import type {
  InteractionEvent,
  InteractionStream,
  InteractionStreamOpener,
  InteractionStreamRequest,
} from '../../src/infrastructure/gemini/interaction-stream.ts';
import { deleteConversation, TEST_DATABASE_URL } from '../support/test-database.ts';

/**
 * Two turns of one conversation over real HTTP, provider stubbed.
 *
 * The assertion that matters is on what the second turn asked the provider for:
 * the first exchange has to be in it, in order, or a follow up is answering a
 * question with no idea what it follows.
 */
const ANSWERS = [
  'Yes. Do not click the link in that message.',
  'On your phone, open Settings and then tap Safety.',
];

class RecordingStubOpener implements InteractionStreamOpener {
  readonly requests: InteractionStreamRequest[] = [];

  async open(request: InteractionStreamRequest): Promise<InteractionStream> {
    const answer = ANSWERS[this.requests.length] ?? 'A later answer.';
    this.requests.push(request);

    async function* replay(): AsyncGenerator<InteractionEvent> {
      yield {
        event_type: 'step.delta',
        index: 0,
        delta: { type: 'text', text: answer },
      } as unknown as InteractionEvent;
      yield {
        event_type: 'interaction.completed',
        interaction: {
          id: 'int_follow_up',
          model: 'gemini-3.5-flash',
          status: 'completed',
          usage: {
            total_input_tokens: 40,
            total_output_tokens: 12,
            total_thought_tokens: 0,
          },
        },
      } as unknown as InteractionEvent;
    }

    const iterator = replay();
    return {
      events: () => iterator,
      abort: async () => {
        await iterator.return(undefined);
      },
    };
  }
}

const streamOpener = new RecordingStubOpener();

let application: Application;
let baseUrl: string;
const createdConversations: string[] = [];

function nextConversationId(): string {
  const id = `follow-up-conv-${process.pid}-${createdConversations.length + 1}`;
  createdConversations.push(id);
  return id;
}

/** Reads a real SSE response off the wire until the server closes it. */
async function readSse(response: Response): Promise<SseEvent[]> {
  const body = response.body;
  if (body === null) {
    throw new Error('the response had no body');
  }

  const events: SseEvent[] = [];
  let buffer = '';
  const decoder = new TextDecoder();

  for await (const piece of body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(piece, { stream: true });
    let separator = buffer.indexOf('\n\n');
    while (separator !== -1) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
      if (dataLine !== undefined) {
        events.push(JSON.parse(dataLine.slice('data: '.length)) as SseEvent);
      }
      separator = buffer.indexOf('\n\n');
    }
  }
  return events;
}

async function ask(conversationId: string, question: string): Promise<SseEvent[]> {
  const response = await fetch(
    `${baseUrl}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    },
  );
  return readSse(response);
}

beforeAll(async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    GEMINI_API_KEY: 'stubbed-in-follow-up-e2e',
  });
  application = composeApplication(config, {
    streamOpener,
    logSink: () => {},
  });
  await application.server.listen({ port: 0, host: '127.0.0.1' });
  const address = application.server.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the server did not bind a port');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  streamOpener.requests.length = 0;
  for (const id of createdConversations.splice(0)) {
    await deleteConversation(application.database, id);
  }
});

afterAll(async () => {
  await application?.close();
});

describe('a follow up in the same conversation', () => {
  it('carries the first exchange into the second request, in order', async () => {
    const conversationId = nextConversationId();

    await ask(conversationId, 'Is this text about my bank a scam?');
    await ask(conversationId, 'And how do I do that on my phone?');

    expect(streamOpener.requests).toHaveLength(2);
    expect(streamOpener.requests[1]?.input).toEqual([
      { role: 'user', content: 'Is this text about my bank a scam?' },
      { role: 'model', content: ANSWERS[0] },
      { role: 'user', content: 'And how do I do that on my phone?' },
    ]);
  });

  it('sends the first question with nothing in front of it', async () => {
    const conversationId = nextConversationId();

    await ask(conversationId, 'Is this text about my bank a scam?');

    expect(streamOpener.requests[0]?.input).toEqual([
      { role: 'user', content: 'Is this text about my bank a scam?' },
    ]);
  });

  it('keeps conversations apart', async () => {
    const first = nextConversationId();
    const second = nextConversationId();

    await ask(first, 'Is this text about my bank a scam?');
    await ask(second, 'What is a passcode?');

    // A second conversation starting mid-history would be a stranger's answer
    // arriving in someone else's screen.
    expect(streamOpener.requests[1]?.input).toEqual([
      { role: 'user', content: 'What is a passcode?' },
    ]);
  });

  it('answers the follow up over the stream as its own turn', async () => {
    const conversationId = nextConversationId();

    await ask(conversationId, 'Is this text about my bank a scam?');
    const events = await ask(conversationId, 'And how do I do that on my phone?');

    const text = events
      .filter((e) => e.type === 'message.delta')
      .map((e) => e.text)
      .join('');
    expect(text).toBe(ANSWERS[1]);
    expect(events.at(-1)?.type).toBe('message.done');
  });

  it('stores both turns of the conversation in order', async () => {
    const conversationId = nextConversationId();

    await ask(conversationId, 'Is this text about my bank a scam?');
    await ask(conversationId, 'And how do I do that on my phone?');

    const rows = await application.database.pool.query<{
      author: string;
      parts: readonly { readonly text: string }[];
    }>(
      'SELECT author, parts FROM messages WHERE conversation_id = $1 ORDER BY seq',
      [conversationId],
    );

    expect(rows.rows.map((r) => r.author)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(rows.rows[0]?.parts.map((p) => p.text).join('')).toBe(
      'Is this text about my bank a scam?',
    );
  });
});
