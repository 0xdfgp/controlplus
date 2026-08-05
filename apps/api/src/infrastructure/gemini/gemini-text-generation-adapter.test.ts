import { describe, expect, it } from 'vitest';

import {
  ERROR_EVENTS,
  FAILED_STATUS_EVENTS,
  HAPPY_PATH_EVENTS,
  NO_MODEL_EVENTS,
  NO_THOUGHT_TOKENS_EVENTS,
  NO_USAGE_EVENTS,
  SUBSTITUTED_MODEL_EVENTS,
  THINKING_EVENTS,
} from '../../../test/__fixtures__/gemini-interaction-events.ts';
import { describeTextGenerationPortContract } from '../../../test/contracts/text-generation-port.contract.ts';
import { ProviderUnavailable } from '../../domain/errors/provider-unavailable.ts';
import { ProductPolicy } from '../../domain/policy/product-policy.ts';
import type { GenerationChunk } from '../../domain/ports/text-generation-port.ts';
import { ModelId } from '../../domain/value-objects/model-id.ts';
import { GeminiTextGenerationAdapter } from './gemini-text-generation-adapter.ts';
import type {
  InteractionEvent,
  InteractionStream,
  InteractionStreamOpener,
  InteractionStreamRequest,
} from './interaction-stream.ts';

const DEFAULT_MODEL = ModelId.fromString('gemini-3.5-flash');

/** Replays recorded events and records whether the adapter released the stream. */
class RecordedStreamOpener implements InteractionStreamOpener {
  aborted = false;
  readonly requests: InteractionStreamRequest[] = [];

  constructor(
    private readonly events: readonly InteractionEvent[],
    private readonly failToOpen: Error | null = null,
  ) {}

  async open(request: InteractionStreamRequest): Promise<InteractionStream> {
    if (this.failToOpen !== null) {
      throw this.failToOpen;
    }
    this.requests.push(request);
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
        this.aborted = true;
        await iterator.return(undefined);
      },
    };
  }
}

function adapterFor(events: readonly InteractionEvent[]) {
  const opener = new RecordedStreamOpener(events);
  return {
    opener,
    adapter: new GeminiTextGenerationAdapter(opener, DEFAULT_MODEL),
  };
}

async function collect(events: readonly InteractionEvent[]) {
  const { adapter } = adapterFor(events);
  const chunks: GenerationChunk[] = [];
  for await (const chunk of adapter.generate({
    policy: ProductPolicy.current(),
    question: 'Is this a scam?',
  })) {
    chunks.push(chunk);
  }
  return chunks;
}

// The shared contract, run against the Gemini adapter over recorded fixtures.
let sharedOpener = new RecordedStreamOpener(HAPPY_PATH_EVENTS);

describeTextGenerationPortContract('GeminiTextGenerationAdapter', {
  happyPath: () => {
    sharedOpener = new RecordedStreamOpener(HAPPY_PATH_EVENTS);
    return new GeminiTextGenerationAdapter(sharedOpener, DEFAULT_MODEL);
  },
  noThoughtTokens: () =>
    new GeminiTextGenerationAdapter(
      new RecordedStreamOpener(NO_THOUGHT_TOKENS_EVENTS),
      DEFAULT_MODEL,
    ),
  withNonAnswerDeltas: () =>
    new GeminiTextGenerationAdapter(
      new RecordedStreamOpener(THINKING_EVENTS),
      DEFAULT_MODEL,
    ),
  providerError: () => {
    sharedOpener = new RecordedStreamOpener(ERROR_EVENTS);
    return new GeminiTextGenerationAdapter(sharedOpener, DEFAULT_MODEL);
  },
  failedStatus: () =>
    new GeminiTextGenerationAdapter(
      new RecordedStreamOpener(FAILED_STATUS_EVENTS),
      DEFAULT_MODEL,
    ),
  noUsage: () =>
    new GeminiTextGenerationAdapter(
      new RecordedStreamOpener(NO_USAGE_EVENTS),
      DEFAULT_MODEL,
    ),
  wasAborted: () => sharedOpener.aborted,
  reset: () => {
    sharedOpener.aborted = false;
  },
});

describe('GeminiTextGenerationAdapter, Gemini specifics', () => {
  it('sends the product policy as the system instruction, not as user input', async () => {
    const { opener, adapter } = adapterFor(HAPPY_PATH_EVENTS);

    for await (const _ of adapter.generate({
      policy: ProductPolicy.current(),
      question: 'Is this a scam?',
    })) {
      void _;
    }

    expect(opener.requests).toHaveLength(1);
    expect(opener.requests[0]?.systemInstruction).toContain(
      'Never write "simply" or "just".',
    );
    expect(opener.requests[0]?.input).toBe('Is this a scam?');
    expect(opener.requests[0]?.model).toBe('gemini-3.5-flash');
  });

  it('falls back to the configured model when the provider omits it', async () => {
    const chunks = await collect(NO_MODEL_EVENTS);
    const completion = chunks.at(-1);
    if (completion?.kind !== 'completion') {
      throw new Error('expected a completion chunk');
    }

    expect(completion.modelId.value).toBe('gemini-3.5-flash');
  });

  it('records the model the provider actually used when it substitutes one', async () => {
    const chunks = await collect(SUBSTITUTED_MODEL_EVENTS);
    const completion = chunks.at(-1);
    if (completion?.kind !== 'completion') {
      throw new Error('expected a completion chunk');
    }

    expect(completion.modelId.value).toBe('gemini-2.5-flash');
  });

  it('translates a failure to open the stream into ProviderUnavailable', async () => {
    const opener = new RecordedStreamOpener([], new Error('ENOTFOUND'));
    const adapter = new GeminiTextGenerationAdapter(opener, DEFAULT_MODEL);

    await expect(
      (async () => {
        for await (const _ of adapter.generate({
          policy: ProductPolicy.current(),
          question: 'q',
        })) {
          void _;
        }
      })(),
    ).rejects.toBeInstanceOf(ProviderUnavailable);
  });

  it('keeps the provider error as the cause without exposing it upstream', async () => {
    const { adapter } = adapterFor(ERROR_EVENTS);

    try {
      for await (const _ of adapter.generate({
        policy: ProductPolicy.current(),
        question: 'q',
      })) {
        void _;
      }
      throw new Error('expected ProviderUnavailable');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderUnavailable);
      expect((error as ProviderUnavailable).message).not.toContain('overloaded');
      expect((error as ProviderUnavailable).cause).toBeDefined();
    }
  });
});
