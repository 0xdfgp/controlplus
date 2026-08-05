import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest';

import type { ImagePayload, SseEvent } from '@control-plus/contracts';

import { composeApplication } from '../../src/infrastructure/composition-root.ts';
import type { Application } from '../../src/infrastructure/composition-root.ts';
import { loadConfig } from '../../src/infrastructure/config/load-config.ts';
import type {
  AnthropicEvent,
  MessageStream,
  MessageStreamOpener,
  MessageStreamRequest,
} from '../../src/infrastructure/anthropic/message-stream.ts';
import { HAPPY_PATH_EVENTS } from '../__fixtures__/anthropic-message-events.ts';
import { deleteConversation, TEST_DATABASE_URL } from '../support/test-database.ts';

/**
 * One image turn over real HTTP, with the provider stubbed.
 *
 * Everything else is real: Fastify, the SSE framing, Postgres and the mappers.
 * What this proves and the adapter tests cannot is that the base64 survives the
 * whole pipe intact and that nothing writes it to disk on the way through.
 */

/** A tiny real JPEG: the two-byte SOI marker and an EOI, base64 encoded. */
const PHOTO: ImagePayload = {
  data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64'),
  mediaType: 'image/jpeg',
  width: 1568,
  height: 1176,
};

class StubStreamOpener implements MessageStreamOpener {
  readonly requests: MessageStreamRequest[] = [];

  async open(request: MessageStreamRequest): Promise<MessageStream> {
    this.requests.push(request);
    async function* replay(): AsyncGenerator<AnthropicEvent> {
      for (const event of HAPPY_PATH_EVENTS) {
        yield event;
      }
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

const streamOpener = new StubStreamOpener();
const logLines: string[] = [];

let application: Application;
let baseUrl: string;
const createdConversations: string[] = [];

function nextConversationId(): string {
  const id = `e2e-img-${process.pid}-${createdConversations.length + 1}`;
  createdConversations.push(id);
  return id;
}

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

async function ask(
  conversationId: string,
  body: { question: string; image?: unknown },
) {
  const response = await fetch(
    `${baseUrl}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) {
    return { response, events: [] as SseEvent[] };
  }
  return { response, events: await readSse(response) };
}

beforeAll(async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    ANTHROPIC_API_KEY: 'sk-ant-stubbed-in-e2e',
  });
  application = composeApplication(config, {
    streamOpener,
    logSink: (line) => logLines.push(line),
  });
  await application.server.listen({ port: 0, host: '127.0.0.1' });
  const address = application.server.server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('the server did not bind a port');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  logLines.length = 0;
  streamOpener.requests.length = 0;
  for (const id of createdConversations.splice(0)) {
    await deleteConversation(application.database, id);
  }
});

afterAll(async () => {
  await application?.close();
});

describe('POST /conversations/:id/messages, with a photo', () => {
  it('answers the same way a text turn does', async () => {
    const { response, events } = await ask(nextConversationId(), {
      question: 'What does this message on my screen mean?',
      image: PHOTO,
    });

    expect(response.status).toBe(200);
    expect(events.map((e) => e.type)).toEqual([
      'stage',
      'stage',
      'message.delta',
      'message.delta',
      'message.delta',
      'message.done',
    ]);
  });

  it('hands the photo to the provider as an image block, bytes intact', async () => {
    await ask(nextConversationId(), {
      question: 'What does this message on my screen mean?',
      image: PHOTO,
    });

    const content = streamOpener.requests[0]?.messages.at(-1)?.content;
    expect(content).toEqual([
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: PHOTO.data },
      },
      { type: 'text', text: 'What does this message on my screen mean?' },
    ]);
  });

  it('stores an ImagePart and no image bytes (AC3)', async () => {
    const conversationId = nextConversationId();

    await ask(conversationId, {
      question: 'What does this message on my screen mean?',
      image: PHOTO,
    });

    const rows = await application.database.pool.query<{
      author: string;
      parts: { kind: string; hash?: string }[];
    }>(
      'SELECT author, parts FROM messages WHERE conversation_id = $1 ORDER BY seq',
      [conversationId],
    );

    const user = rows.rows[0];
    expect(user?.author).toBe('user');
    expect(user?.parts[0]).toEqual({
      kind: 'image',
      mediaType: 'image/jpeg',
      width: 1568,
      height: 1176,
      // SHA-256 of the four bytes above, computed at the HTTP boundary.
      hash: '32461d5bd1773012acef0ba15636752949bd7c2ce50f9172159d9f56cf0dd9af',
    });
    expect(user?.parts[1]).toEqual({
      kind: 'text',
      text: 'What does this message on my screen mean?',
    });

    // The whole row, every column: nothing anywhere carries the base64.
    const raw = await application.database.pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1',
      [conversationId],
    );
    expect(JSON.stringify(raw.rows)).not.toContain(PHOTO.data);
  });

  it('logs that the turn carried a photo, with no bytes in the line', async () => {
    await ask(nextConversationId(), {
      question: 'What does this message on my screen mean?',
      image: PHOTO,
    });

    expect(logLines).toHaveLength(1);
    const line = JSON.parse(logLines[0] ?? '{}');
    expect(line.image).toEqual({
      mediaType: 'image/jpeg',
      width: 1568,
      height: 1176,
    });
    expect(logLines[0]).not.toContain(PHOTO.data);
  });

  it('logs image as null on a turn that had no photo', async () => {
    await ask(nextConversationId(), { question: 'Is this a scam?' });

    // The field is present at null rather than absent, so an operator reads
    // every turn out of the same shape.
    expect(JSON.parse(logLines[0] ?? '{}').image).toBeNull();
  });

  it('rejects a body whose image is not a shape we accept', async () => {
    const { response } = await ask(nextConversationId(), {
      question: 'What is this?',
      image: { data: 'abc', mediaType: 'application/pdf', width: 10, height: 10 },
    });

    expect(response.status).toBe(400);
  });

  it('rejects a photo whose base64 cannot be decoded', async () => {
    const { response } = await ask(nextConversationId(), {
      question: 'What is this?',
      image: { ...PHOTO, data: '!!!!' },
    });

    // A 400 with a body, not an error event on a stream that then closes: the
    // request never became a turn.
    expect(response.status).toBe(400);
  });
});

describe('a follow up after a photo turn (AC6)', () => {
  it('sends no image bytes with the next question', async () => {
    const conversationId = nextConversationId();

    await ask(conversationId, {
      question: 'What does this message on my screen mean?',
      image: PHOTO,
    });
    await ask(conversationId, { question: 'What should I do about it?' });

    const followUp = streamOpener.requests[1];
    expect(JSON.stringify(followUp)).not.toContain(PHOTO.data);
    // The photo turn is still in the window, as text saying a photo was there.
    expect(followUp?.messages[0]?.content).toContain(
      'The photo is no longer available to you',
    );
    expect(typeof followUp?.messages[0]?.content).toBe('string');
  });
});
