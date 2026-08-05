import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { composeApplication } from '../../src/infrastructure/composition-root.ts';
import type { Application } from '../../src/infrastructure/composition-root.ts';
import { loadConfig } from '../../src/infrastructure/config/load-config.ts';
import type {
  InteractionEvent,
  InteractionStream,
  InteractionStreamOpener,
} from '../../src/infrastructure/gemini/interaction-stream.ts';
import { deleteConversation, TEST_DATABASE_URL } from '../support/test-database.ts';

/**
 * A stopped turn, over real HTTP against a stubbed provider.
 *
 * The client aborts the request, which is what tapping Stop does (ADR-016).
 * Everything else is real: Fastify, the SSE route, the use case, the domain
 * service, Postgres.
 *
 * The stub pauses between chunks for the same reason streaming-timing does: a
 * provider that hands over everything in one microtask drain cannot be
 * interrupted partway, so a suite built on one would assert nothing about
 * cancellation while looking green.
 */
const CHUNK_GAP_MS = 150;
const TEXT_CHUNKS = ['That message has ', 'two signs ', 'of a scam.'];

class SlowStubStreamOpener implements InteractionStreamOpener {
  aborted = false;
  /** True once the provider ran out of events of its own accord. */
  drained = false;
  opened = 0;

  async open(): Promise<InteractionStream> {
    this.opened += 1;
    const markDrained = (): void => {
      this.drained = true;
    };
    async function* replay(): AsyncGenerator<InteractionEvent> {
      for (const text of TEXT_CHUNKS) {
        await new Promise((resolve) => setTimeout(resolve, CHUNK_GAP_MS));
        yield {
          event_type: 'step.delta',
          index: 0,
          delta: { type: 'text', text },
        } as unknown as InteractionEvent;
      }
      await new Promise((resolve) => setTimeout(resolve, CHUNK_GAP_MS));
      yield {
        event_type: 'interaction.completed',
        interaction: {
          id: 'int_stop',
          model: 'gemini-3.5-flash',
          status: 'completed',
          usage: {
            total_input_tokens: 10,
            total_output_tokens: 5,
            total_thought_tokens: 3,
          },
        },
      } as unknown as InteractionEvent;
      markDrained();
    }
    const iterator = replay();
    return {
      events: () => iterator,
      abort: async () => {
        this.aborted = true;
        await iterator.return(undefined);
      },
    };
  }
}

interface StoredMessage {
  readonly author: string;
  readonly state: string | null;
  readonly parts: readonly { readonly text: string }[];
  readonly provenance: { readonly modelId: string } | null;
  readonly usage: {
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly thoughtTokens: number;
  } | null;
}

const streamOpener = new SlowStubStreamOpener();
const logLines: string[] = [];

let application: Application;
let baseUrl: string;
const createdConversations: string[] = [];

function nextConversationId(): string {
  const id = `stop-conv-${process.pid}-${createdConversations.length + 1}`;
  createdConversations.push(id);
  return id;
}

/**
 * Asks, reads until the first answer text lands, then drops the connection.
 *
 * Returns the SSE event names that reached the client before it left.
 */
async function askAndStop(conversationId: string): Promise<string[]> {
  const controller = new AbortController();
  const response = await fetch(
    `${baseUrl}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Is this a scam?' }),
      signal: controller.signal,
    },
  );

  const body = response.body;
  if (body === null) {
    throw new Error('the response had no body');
  }

  const names: string[] = [];
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for await (const piece of body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(piece, { stream: true });
      const lines = buffer.split('\n');
      // The last piece may be half a line. Keep it for the next read rather
      // than losing the event name it is part of.
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          names.push(line.slice('event: '.length));
        }
      }
      if (names.includes('message.delta')) {
        controller.abort();
        break;
      }
    }
  } catch {
    // Aborting the read is the point of this test, not a failure of it.
  }
  return names;
}

/**
 * Waits for the stopped row to land.
 *
 * The write happens after the client has gone, so there is no response to wait
 * on. Polling is the honest way to observe it; a fixed sleep would pass on a
 * fast machine and flake on a slow one.
 */
async function awaitAssistantMessage(
  conversationId: string,
): Promise<StoredMessage> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await application.database.pool.query<StoredMessage>(
      "SELECT author, state, parts, provenance, usage FROM messages WHERE conversation_id = $1 AND author = 'assistant'",
      [conversationId],
    );
    const row = rows.rows[0];
    if (row !== undefined) {
      return row;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`no assistant message was written for ${conversationId}`);
}

beforeAll(async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    GEMINI_API_KEY: 'stubbed-in-stop-e2e',
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
  streamOpener.aborted = false;
  streamOpener.drained = false;
  logLines.length = 0;
  for (const id of createdConversations.splice(0)) {
    await deleteConversation(application.database, id);
  }
});

afterAll(async () => {
  await application?.close();
});

describe('a turn the client stops partway', () => {
  it('ends without message.done, so nothing claims the answer completed', async () => {
    const names = await askAndStop(nextConversationId());
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(names).toContain('message.delta');
    expect(names).not.toContain('message.done');
    expect(names).not.toContain('error');
  });

  it('writes one assistant row, stopped, carrying the partial answer', async () => {
    const conversationId = nextConversationId();

    await askAndStop(conversationId);
    const stored = await awaitAssistantMessage(conversationId);

    expect(stored.state).toBe('stopped');
    const text = stored.parts.map((part) => part.text).join('');
    expect(text.length).toBeGreaterThan(0);
    // The whole answer would mean the turn was never actually interrupted.
    expect(text).not.toBe(TEXT_CHUNKS.join(''));
    expect(TEXT_CHUNKS.join('').startsWith(text)).toBe(true);
  });

  it('attributes the stopped answer and records the usage it was told about', async () => {
    const conversationId = nextConversationId();

    await askAndStop(conversationId);
    const stored = await awaitAssistantMessage(conversationId);

    expect(stored.provenance?.modelId).toBe('gemini-3.5-flash');
    // Zero, because the provider reports usage on interaction.completed and
    // this turn never reached it. Not an estimate of what it cost.
    expect(stored.usage).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      thoughtTokens: 0,
    });
  });

  it('aborts the provider stream rather than leaving it running', async () => {
    const conversationId = nextConversationId();

    await askAndStop(conversationId);
    await awaitAssistantMessage(conversationId);

    // The money question, and it needs both halves. Aborted alone would also be
    // true of a stream that ran to the end and then tidied up, which is exactly
    // the failure this is here to catch: a provider left iterating keeps
    // billing for tokens nobody will ever read.
    expect(streamOpener.aborted).toBe(true);
    expect(streamOpener.drained).toBe(false);
  });

  it('logs the turn as stopped, not as an error', async () => {
    const conversationId = nextConversationId();

    await askAndStop(conversationId);
    await awaitAssistantMessage(conversationId);
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(logLines).toHaveLength(1);
    const line = JSON.parse(logLines[0] ?? '{}');
    expect(line.terminalState).toBe('stopped');
    // A user who stopped an answer did not hit a fault, and the log should not
    // say they did.
    expect(line.errorClass).toBeNull();
  });

  it('keeps the user message, and asking again works normally', async () => {
    const first = nextConversationId();
    await askAndStop(first);
    await awaitAssistantMessage(first);

    const second = nextConversationId();
    const names = await askAndStop(second);

    expect(names[0]).toBe('stage');
    expect(streamOpener.opened).toBeGreaterThan(1);
    const rows = await application.database.pool.query(
      "SELECT author FROM messages WHERE conversation_id = $1 AND author = 'user'",
      [first],
    );
    expect(rows.rowCount).toBe(1);
  });
});
