import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest';

import type { SseEvent } from '@control-plus/contracts';

import { composeApplication } from '../../src/infrastructure/composition-root.ts';
import type { Application } from '../../src/infrastructure/composition-root.ts';
import { loadConfig } from '../../src/infrastructure/config/load-config.ts';
import type {
  InteractionEvent,
  InteractionStream,
  InteractionStreamOpener,
} from '../../src/infrastructure/gemini/interaction-stream.ts';
import {
  ERROR_EVENTS,
  HAPPY_PATH_EVENTS,
} from '../__fixtures__/gemini-interaction-events.ts';
import { deleteConversation, TEST_DATABASE_URL } from '../support/test-database.ts';

/** The provider is stubbed. Everything else — HTTP, Postgres — is real. */
class StubStreamOpener implements InteractionStreamOpener {
  constructor(private events: readonly InteractionEvent[]) {}

  use(events: readonly InteractionEvent[]): void {
    this.events = events;
  }

  async open(): Promise<InteractionStream> {
    const events = this.events;
    async function* replay(): AsyncGenerator<InteractionEvent> {
      for (const event of events) {
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

const streamOpener = new StubStreamOpener(HAPPY_PATH_EVENTS);
const logLines: string[] = [];

let application: Application;
let baseUrl: string;
const createdConversations: string[] = [];

function nextConversationId(): string {
  const id = `e2e-conv-${process.pid}-${createdConversations.length + 1}`;
  createdConversations.push(id);
  return id;
}

/** Reads a real SSE response off the wire, one event at a time. */
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
      const dataLine = frame
        .split('\n')
        .find((line) => line.startsWith('data: '));
      if (dataLine !== undefined) {
        events.push(JSON.parse(dataLine.slice('data: '.length)) as SseEvent);
      }
      separator = buffer.indexOf('\n\n');
    }
  }
  return events;
}

async function ask(conversationId: string, question: string) {
  const response = await fetch(
    `${baseUrl}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    },
  );
  return { response, events: await readSse(response) };
}

beforeAll(async () => {
  // No PORT here: boot validation rejects 0, and rightly so. The test binds an
  // ephemeral port through `listen` instead.
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    GEMINI_API_KEY: 'stubbed-in-e2e',
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
  streamOpener.use(HAPPY_PATH_EVENTS);
  logLines.length = 0;
  for (const id of createdConversations.splice(0)) {
    await deleteConversation(application.database, id);
  }
});

afterAll(async () => {
  await application?.close();
});

describe('POST /conversations/:id/messages, happy path', () => {
  it('responds as an unbuffered event stream', async () => {
    const { response } = await ask(nextConversationId(), 'Is this a scam?');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('x-accel-buffering')).toBe('no');
    expect(response.headers.get('content-encoding')).toBe('identity');
  });

  it('emits stage(thinking) before any answer text exists', async () => {
    const { events } = await ask(nextConversationId(), 'Is this a scam?');

    expect(events[0]).toEqual({ type: 'stage', stage: 'thinking' });
    const firstDelta = events.findIndex((e) => e.type === 'message.delta');
    const responding = events.findIndex(
      (e) => e.type === 'stage' && e.stage === 'responding',
    );
    expect(responding).toBeGreaterThan(0);
    expect(responding).toBeLessThan(firstDelta);
  });

  it('emits the full event sequence in order', async () => {
    const { events } = await ask(nextConversationId(), 'Is this a scam?');

    expect(events.map((e) => e.type)).toEqual([
      'stage',
      'stage',
      'message.delta',
      'message.delta',
      'message.delta',
      'message.done',
    ]);
  });

  it('streams the answer text in pieces that reassemble', async () => {
    const { events } = await ask(nextConversationId(), 'Is this a scam?');

    const text = events
      .filter((e) => e.type === 'message.delta')
      .map((e) => e.text)
      .join('');

    expect(text).toBe(
      'That message has two signs of a scam: it asks you to click a link right away, and it tries to make you feel rushed.',
    );
  });

  it('closes with message.done carrying state, provenance and usage', async () => {
    const { events } = await ask(nextConversationId(), 'Is this a scam?');

    const done = events.at(-1);
    if (done?.type !== 'message.done') {
      throw new Error('expected message.done last');
    }
    expect(done.state).toBe('completed');
    expect(done.provenance).toEqual({
      origin: 'ai-generated',
      modelId: 'gemini-3.5-flash',
      provider: 'google',
    });
    expect(done.usage).toEqual({
      inputTokens: 118,
      outputTokens: 27,
      thoughtTokens: 254,
    });
  });

  it('emits no transcript events: transcription happens on the device', async () => {
    const { events } = await ask(nextConversationId(), 'Is this a scam?');

    expect(events.map((e) => e.type)).not.toContain('transcript');
  });

  it('writes exactly one structured log line, with the email masked', async () => {
    await ask(nextConversationId(), 'Is mail from bob@example.com a scam?');

    expect(logLines).toHaveLength(1);
    const line = JSON.parse(logLines[0] ?? '{}');
    expect(line.conversationId).toBeTruthy();
    expect(line.requestId).toBeTruthy();
    expect(typeof line.latencyMs).toBe('number');
    expect(line.inputTokens).toBe(118);
    expect(line.outputTokens).toBe(27);
    // Without this the logged spend is the input/output pair alone, which on
    // the live numbers understated the real total by roughly ten times.
    expect(line.thoughtTokens).toBe(254);
    expect(line.errorClass).toBeNull();
    expect(line.question).toBe('Is mail from [email] a scam?');
    expect(line.question).not.toContain('bob@example.com');
  });
});

describe('POST /conversations/:id/messages, failure path', () => {
  it('emits an error event naming ProviderUnavailable and no provider text', async () => {
    streamOpener.use(ERROR_EVENTS);

    const { events } = await ask(nextConversationId(), 'Is this a scam?');

    expect(events.map((e) => e.type)).toEqual(['stage', 'error']);
    const error = events.at(-1);
    if (error?.type !== 'error') {
      throw new Error('expected an error event');
    }
    expect(error.error).toBe('ProviderUnavailable');
    expect(JSON.stringify(error)).not.toContain('overloaded');
  });

  it('writes no assistant message row', async () => {
    streamOpener.use(ERROR_EVENTS);
    const conversationId = nextConversationId();

    await ask(conversationId, 'Is this a scam?');

    const rows = await application.database.pool.query(
      "SELECT author FROM messages WHERE conversation_id = $1 AND author = 'assistant'",
      [conversationId],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('logs the turn with the error class', async () => {
    streamOpener.use(ERROR_EVENTS);

    await ask(nextConversationId(), 'Is this a scam?');

    expect(logLines).toHaveLength(1);
    expect(JSON.parse(logLines[0] ?? '{}').errorClass).toBe('ProviderUnavailable');
  });

  it('rejects a request with no question', async () => {
    const response = await fetch(
      `${baseUrl}/conversations/${nextConversationId()}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(400);
  });
});

describe('persistence after a completed turn', () => {
  it('stores the question and the attributed answer', async () => {
    const conversationId = nextConversationId();

    await ask(conversationId, 'Is this a scam?');

    const rows = await application.database.pool.query<{
      author: string;
      provenance: { modelId: string; provider: string } | null;
      usage: {
        inputTokens: number;
        outputTokens: number;
        thoughtTokens: number;
      } | null;
    }>(
      'SELECT author, provenance, usage FROM messages WHERE conversation_id = $1 ORDER BY created_at',
      [conversationId],
    );

    expect(rows.rows.map((r) => r.author)).toEqual(['user', 'assistant']);
    expect(rows.rows[0]?.provenance).toBeNull();
    expect(rows.rows[1]?.provenance).toEqual({
      origin: 'ai-generated',
      modelId: 'gemini-3.5-flash',
      provider: 'google',
    });
    expect(rows.rows[1]?.usage).toEqual({
      inputTokens: 118,
      outputTokens: 27,
      thoughtTokens: 254,
    });
  });
});
