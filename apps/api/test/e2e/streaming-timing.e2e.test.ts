import { afterAll, beforeAll, afterEach, describe, expect, it } from 'vitest';

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
 * The gap this suite exists to close.
 *
 * The original e2e stub replayed fixtures from a plain async generator with no
 * delay, so every chunk was available in one microtask drain. A pipeline that
 * buffered everything and flushed at close still produced the correct event
 * *sequence*, and the sequence was all that was asserted. The suite was green
 * while the question it should have been asking — do these arrive separated in
 * time? — could not even be posed.
 *
 * So this stub pauses between chunks, and these tests assert separation rather
 * than order.
 */
const CHUNK_GAP_MS = 120;
const TEXT_CHUNKS = ['That message ', 'has two signs ', 'of a scam.'];

class SlowStubStreamOpener implements InteractionStreamOpener {
  async open(): Promise<InteractionStream> {
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
          id: 'int_slow',
          model: 'gemini-3.5-flash',
          status: 'completed',
          usage: {
            total_input_tokens: 10,
            total_output_tokens: 5,
            total_thought_tokens: 3,
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

interface TimedFrame {
  readonly type: string;
  readonly at: number;
  readonly reads: number;
}

let application: Application;
let baseUrl: string;
const createdConversations: string[] = [];

function nextConversationId(): string {
  const id = `timing-conv-${process.pid}-${createdConversations.length + 1}`;
  createdConversations.push(id);
  return id;
}

/**
 * Reads the SSE response, recording when each frame arrived and how many
 * separate socket reads had happened by then. One read for everything is the
 * signature of a buffered pipeline.
 */
async function readTimedFrames(conversationId: string): Promise<TimedFrame[]> {
  const started = Date.now();
  const response = await fetch(
    `${baseUrl}/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Is this a scam?' }),
    },
  );

  const body = response.body;
  if (body === null) {
    throw new Error('the response had no body');
  }

  const frames: TimedFrame[] = [];
  const decoder = new TextDecoder();
  let buffer = '';
  let reads = 0;

  for await (const piece of body as unknown as AsyncIterable<Uint8Array>) {
    reads += 1;
    buffer += decoder.decode(piece, { stream: true });
    let separator = buffer.indexOf('\n\n');
    while (separator !== -1) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      const nameLine = frame.split('\n').find((l) => l.startsWith('event: '));
      if (nameLine !== undefined) {
        frames.push({
          type: nameLine.slice('event: '.length),
          at: Date.now() - started,
          reads,
        });
      }
      separator = buffer.indexOf('\n\n');
    }
  }
  return frames;
}

beforeAll(async () => {
  const config = loadConfig({
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    GEMINI_API_KEY: 'stubbed-in-timing-e2e',
  });
  application = composeApplication(config, {
    streamOpener: new SlowStubStreamOpener(),
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
  for (const id of createdConversations.splice(0)) {
    await deleteConversation(application.database, id);
  }
});

afterAll(async () => {
  await application?.close();
});

describe('answer text reaches the wire as it is produced', () => {
  it('delivers deltas separated in time, not in one flush', async () => {
    const frames = await readTimedFrames(nextConversationId());
    const deltas = frames.filter((f) => f.type === 'message.delta');

    expect(deltas.length).toBe(TEXT_CHUNKS.length);

    const first = deltas[0];
    const last = deltas.at(-1);
    if (first === undefined || last === undefined) {
      throw new Error('expected deltas');
    }

    // The stub paused CHUNK_GAP_MS between chunks. If the pipeline buffered,
    // every delta would carry the same arrival time.
    const spread = last.at - first.at;
    expect(spread).toBeGreaterThanOrEqual(CHUNK_GAP_MS);
  });

  it('delivers each delta in its own socket read', async () => {
    const frames = await readTimedFrames(nextConversationId());
    const deltas = frames.filter((f) => f.type === 'message.delta');

    // Distinct read counts prove the bytes crossed the socket separately
    // rather than being coalesced into one write at close.
    const reads = new Set(deltas.map((d) => d.reads));
    expect(reads.size).toBe(deltas.length);
  });

  it('starts delivering answer text well before the stream closes', async () => {
    const frames = await readTimedFrames(nextConversationId());
    const firstDelta = frames.find((f) => f.type === 'message.delta');
    const done = frames.find((f) => f.type === 'message.done');

    if (firstDelta === undefined || done === undefined) {
      throw new Error('expected a delta and a done frame');
    }
    expect(firstDelta.at).toBeLessThan(done.at);
    expect(done.at - firstDelta.at).toBeGreaterThanOrEqual(CHUNK_GAP_MS);
  });

  it('changes to the responding stage before the first delta, not after', async () => {
    const frames = await readTimedFrames(nextConversationId());
    const stages = frames.filter((f) => f.type === 'stage');
    const firstDelta = frames.findIndex((f) => f.type === 'message.delta');

    expect(stages).toHaveLength(2);
    expect(frames.indexOf(stages[1] as TimedFrame)).toBeLessThan(firstDelta);
  });
});
