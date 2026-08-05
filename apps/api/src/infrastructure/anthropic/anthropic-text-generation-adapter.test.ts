import { describe, expect, it } from 'vitest';

import {
  EVENTS_BEFORE_ERROR,
  HAPPY_PATH_EVENTS,
  NO_MODEL_EVENTS,
  NO_THOUGHT_TOKENS_EVENTS,
  NO_USAGE_EVENTS,
  REFUSAL_EVENTS,
  SUBSTITUTED_MODEL_EVENTS,
  THINKING_EVENTS,
} from '../../../test/__fixtures__/anthropic-message-events.ts';
import {
  CONTRACT_IMAGE,
  describeTextGenerationPortContract,
} from '../../../test/contracts/text-generation-port.contract.ts';
import { ProviderUnavailable } from '../../domain/errors/provider-unavailable.ts';
import { ProductPolicy } from '../../domain/policy/product-policy.ts';
import type { GenerationChunk } from '../../domain/ports/text-generation-port.ts';
import { ModelId } from '../../domain/value-objects/model-id.ts';
import { AnthropicTextGenerationAdapter } from './anthropic-text-generation-adapter.ts';
import type {
  AnthropicEvent,
  MessageImageBlock,
  MessageStream,
  MessageStreamOpener,
  MessageStreamRequest,
  MessageTextBlock,
} from './message-stream.ts';

const DEFAULT_MODEL = ModelId.fromString('claude-sonnet-4-5');

/**
 * A typed SDK exception, as the real client raises it.
 *
 * The SDK converts a mid-stream `error` frame into a thrown APIError before the
 * adapter ever sees it, so a stub that yielded an error event would be testing
 * a path that does not exist.
 */
class StubApiError extends Error {
  readonly status = 529;
  readonly type = 'overloaded_error';

  constructor() {
    super('Overloaded');
    this.name = 'APIError';
  }
}

/** Replays recorded events and records whether the adapter released the stream. */
class RecordedStreamOpener implements MessageStreamOpener {
  aborted = false;
  readonly requests: MessageStreamRequest[] = [];

  constructor(
    private readonly events: readonly AnthropicEvent[],
    private readonly failToOpen: Error | null = null,
    private readonly failMidStream: Error | null = null,
  ) {}

  async open(request: MessageStreamRequest): Promise<MessageStream> {
    if (this.failToOpen !== null) {
      throw this.failToOpen;
    }
    this.requests.push(request);
    const events = this.events;
    const failMidStream = this.failMidStream;

    async function* replay(): AsyncGenerator<AnthropicEvent> {
      for (const event of events) {
        yield event;
      }
      if (failMidStream !== null) {
        throw failMidStream;
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

function adapterFor(events: readonly AnthropicEvent[]) {
  const opener = new RecordedStreamOpener(events);
  return {
    opener,
    adapter: new AnthropicTextGenerationAdapter(opener, DEFAULT_MODEL),
  };
}

async function collect(events: readonly AnthropicEvent[]) {
  const { adapter } = adapterFor(events);
  const chunks: GenerationChunk[] = [];
  for await (const chunk of adapter.generate({
    policy: ProductPolicy.current(),
    history: [],
    question: 'Is this a scam?',
  })) {
    chunks.push(chunk);
  }
  return chunks;
}

/**
 * The blocks of the last turn the adapter sent, when it sent blocks.
 *
 * A turn with no photo is a plain string, which is what every turn before S4
 * sent and what these helpers return null for.
 */
function lastTurnBlocks(
  opener: RecordedStreamOpener,
): readonly (MessageImageBlock | MessageTextBlock)[] | null {
  const content = opener.requests.at(-1)?.messages.at(-1)?.content;
  return typeof content === 'string' || content === undefined ? null : content;
}

function imageBlockOf(opener: RecordedStreamOpener): MessageImageBlock | null {
  const block = lastTurnBlocks(opener)?.find((b) => b.type === 'image');
  return block === undefined ? null : block;
}

// The shared contract, run against the Anthropic adapter over its own fixtures.
let sharedOpener = new RecordedStreamOpener(HAPPY_PATH_EVENTS);
let imageOpener = new RecordedStreamOpener(HAPPY_PATH_EVENTS);

describeTextGenerationPortContract('AnthropicTextGenerationAdapter', {
  happyPath: () => {
    sharedOpener = new RecordedStreamOpener(HAPPY_PATH_EVENTS);
    return new AnthropicTextGenerationAdapter(sharedOpener, DEFAULT_MODEL);
  },
  // Anthropic bills reasoning inside output_tokens and reports no separate
  // count (ADR-032). Zero is what the provider said, not an estimate.
  expectedThoughtTokens: 0,
  noThoughtTokens: () =>
    new AnthropicTextGenerationAdapter(
      new RecordedStreamOpener(NO_THOUGHT_TOKENS_EVENTS),
      DEFAULT_MODEL,
    ),
  withNonAnswerDeltas: () =>
    new AnthropicTextGenerationAdapter(
      new RecordedStreamOpener(THINKING_EVENTS),
      DEFAULT_MODEL,
    ),
  providerError: () => {
    sharedOpener = new RecordedStreamOpener(
      EVENTS_BEFORE_ERROR,
      null,
      new StubApiError(),
    );
    return new AnthropicTextGenerationAdapter(sharedOpener, DEFAULT_MODEL);
  },
  failedStatus: () =>
    new AnthropicTextGenerationAdapter(
      new RecordedStreamOpener(REFUSAL_EVENTS),
      DEFAULT_MODEL,
    ),
  noUsage: () =>
    new AnthropicTextGenerationAdapter(
      new RecordedStreamOpener(NO_USAGE_EVENTS),
      DEFAULT_MODEL,
    ),
  wasAborted: () => sharedOpener.aborted,
  reset: () => {
    sharedOpener.aborted = false;
  },
  // Anthropic accepts images (ADR-032), so it declares the image scenario.
  // Gemini does not, and S10 is where that changes.
  imageTurn: () => {
    imageOpener = new RecordedStreamOpener(HAPPY_PATH_EVENTS);
    return new AnthropicTextGenerationAdapter(imageOpener, DEFAULT_MODEL);
  },
  sentImage: () => {
    const block = imageBlockOf(imageOpener);
    return block === null
      ? null
      : { mediaType: block.source.media_type, data: block.source.data };
  },
  sentQuestionWithImage: () => {
    const text = lastTurnBlocks(imageOpener)?.find((b) => b.type === 'text');
    return text === undefined ? null : text.text;
  },
});

describe('AnthropicTextGenerationAdapter, Anthropic specifics', () => {
  it('sends the product policy as the system prompt, not as a user turn', async () => {
    const { opener, adapter } = adapterFor(HAPPY_PATH_EVENTS);

    for await (const _ of adapter.generate({
      policy: ProductPolicy.current(),
      history: [],
      question: 'Is this a scam?',
    })) {
      void _;
    }

    expect(opener.requests).toHaveLength(1);
    expect(opener.requests[0]?.system).toContain('Never write "simply" or "just".');
    // The policy must not be reachable from the conversation, or a long enough
    // exchange pushes the safety rules out of the window.
    expect(opener.requests[0]?.messages).toEqual([
      { role: 'user', content: 'Is this a scam?' },
    ]);
    expect(opener.requests[0]?.model).toBe('claude-sonnet-4-5');
  });

  it('sends the history before the question, assistant turns as the assistant role', async () => {
    const { opener, adapter } = adapterFor(HAPPY_PATH_EVENTS);

    for await (const _ of adapter.generate({
      policy: ProductPolicy.current(),
      history: [
        { author: 'user', text: 'Is this text about my bank a scam?' },
        { author: 'assistant', text: 'Yes. Do not click the link.' },
      ],
      question: 'And how do I do that on my phone?',
    })) {
      void _;
    }

    // Order is the whole point: a follow up read before the exchange it follows
    // is a different conversation.
    expect(opener.requests[0]?.messages).toEqual([
      { role: 'user', content: 'Is this text about my bank a scam?' },
      { role: 'assistant', content: 'Yes. Do not click the link.' },
      { role: 'user', content: 'And how do I do that on my phone?' },
    ]);
  });

  it('leaves the history exactly as the domain assembled it', async () => {
    const { opener, adapter } = adapterFor(HAPPY_PATH_EVENTS);
    const marked =
      'Half an answer.\n\n[This answer was stopped by the person before it was finished.]';

    for await (const _ of adapter.generate({
      policy: ProductPolicy.current(),
      history: [{ author: 'assistant', text: marked }],
      question: 'Please carry on.',
    })) {
      void _;
    }

    // The adapter translates roles and nothing else. What a stopped answer is
    // called is product policy and was decided in the domain; an adapter that
    // rewrote this would be one holding a business rule.
    expect(opener.requests[0]?.messages[0]?.content).toBe(marked);
  });

  it('records zero reasoning tokens rather than inventing a count', async () => {
    const chunks = await collect(HAPPY_PATH_EVENTS);
    const completion = chunks.at(-1);
    if (completion?.kind !== 'completion') {
      throw new Error('expected a completion chunk');
    }

    // AC2. Anthropic bills reasoning inside output_tokens with no separate
    // field. Reporting anything else here would put a number in the cost
    // figure that no provider ever sent.
    expect(completion.usage.thoughtTokens.value).toBe(0);
    expect(completion.usage.inputTokens.value).toBe(118);
    expect(completion.usage.outputTokens.value).toBe(27);
  });

  it('takes the output count from message_delta, not from message_start', async () => {
    const chunks = await collect(HAPPY_PATH_EVENTS);
    const completion = chunks.at(-1);
    if (completion?.kind !== 'completion') {
      throw new Error('expected a completion chunk');
    }

    // message_start reports 1 output token, being what existed when the stream
    // opened. Reading it there would understate every answer in the product.
    expect(completion.usage.outputTokens.value).toBe(27);
  });

  it('falls back to the configured model when the provider omits it', async () => {
    const chunks = await collect(NO_MODEL_EVENTS);
    const completion = chunks.at(-1);
    if (completion?.kind !== 'completion') {
      throw new Error('expected a completion chunk');
    }

    expect(completion.modelId.value).toBe('claude-sonnet-4-5');
  });

  it('records the model the provider actually used when it substitutes one', async () => {
    const chunks = await collect(SUBSTITUTED_MODEL_EVENTS);
    const completion = chunks.at(-1);
    if (completion?.kind !== 'completion') {
      throw new Error('expected a completion chunk');
    }

    expect(completion.modelId.value).toBe('claude-sonnet-4-5-20250929');
  });

  it('treats a refusal as unavailable rather than as an empty answer', async () => {
    // A refusal produces no text. Handing the user a blank answer would be
    // worse than telling them something went wrong.
    await expect(collect(REFUSAL_EVENTS)).rejects.toBeInstanceOf(
      ProviderUnavailable,
    );
  });

  it('translates a failure to open the stream into ProviderUnavailable', async () => {
    const opener = new RecordedStreamOpener([], new Error('ENOTFOUND'));
    const adapter = new AnthropicTextGenerationAdapter(opener, DEFAULT_MODEL);

    await expect(
      (async () => {
        for await (const _ of adapter.generate({
          policy: ProductPolicy.current(),
          history: [],
          question: 'q',
        })) {
          void _;
        }
      })(),
    ).rejects.toBeInstanceOf(ProviderUnavailable);
  });

  it('sends the photo before the question, as one user turn', async () => {
    const { opener, adapter } = adapterFor(HAPPY_PATH_EVENTS);

    for await (const _ of adapter.generate({
      policy: ProductPolicy.current(),
      history: [],
      question: 'What does this message on my screen mean?',
      image: {
        data: CONTRACT_IMAGE.data,
        mediaType: 'image/jpeg',
        width: 1568,
        height: 1176,
      },
    })) {
      void _;
    }

    // Image first: Anthropic's guidance is that a question read after the
    // picture it is about produces better answers than the reverse, and it is
    // the order the person composed it in.
    expect(opener.requests[0]?.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: CONTRACT_IMAGE.data,
            },
          },
          { type: 'text', text: 'What does this message on my screen mean?' },
        ],
      },
    ]);
  });

  it('leaves a text-only turn exactly as it was before photos existed', async () => {
    const { opener, adapter } = adapterFor(HAPPY_PATH_EVENTS);

    for await (const _ of adapter.generate({
      policy: ProductPolicy.current(),
      history: [],
      question: 'Is this a scam?',
    })) {
      void _;
    }

    // A plain string, not a one-element block array. Both are valid to the API;
    // this is the one every turn sent before S4, and adding photos should have
    // changed nothing about the requests that do not have one.
    expect(opener.requests[0]?.messages).toEqual([
      { role: 'user', content: 'Is this a scam?' },
    ]);
  });

  it('sends earlier turns as text, with no image block anywhere in them', async () => {
    const { opener, adapter } = adapterFor(HAPPY_PATH_EVENTS);

    for await (const _ of adapter.generate({
      policy: ProductPolicy.current(),
      history: [
        {
          author: 'user',
          text: '[The person sent a photo with this question. The photo is no longer available to you.]\n\nWhat is this?',
        },
        { author: 'assistant', text: 'It is a fake warning.' },
      ],
      question: 'What should I do about it?',
      image: undefined,
    })) {
      void _;
    }

    // AC6 from this side: history has no bytes to resend, so the follow up
    // costs what a text follow up costs.
    const history = opener.requests[0]?.messages.slice(0, 2) ?? [];
    for (const turn of history) {
      expect(typeof turn.content).toBe('string');
    }
    expect(JSON.stringify(opener.requests[0])).not.toContain('base64');
  });

  it('keeps the typed SDK exception as the cause without exposing it upstream', async () => {
    const opener = new RecordedStreamOpener(
      EVENTS_BEFORE_ERROR,
      null,
      new StubApiError(),
    );
    const adapter = new AnthropicTextGenerationAdapter(opener, DEFAULT_MODEL);

    try {
      for await (const _ of adapter.generate({
        policy: ProductPolicy.current(),
        history: [],
        question: 'q',
      })) {
        void _;
      }
      throw new Error('expected ProviderUnavailable');
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderUnavailable);
      // The user is told the assistant is unavailable, never "overloaded_error".
      expect((error as ProviderUnavailable).message).not.toContain('Overloaded');
      expect((error as ProviderUnavailable).cause).toBeInstanceOf(StubApiError);
    }
  });
});
