import Anthropic from '@anthropic-ai/sdk';
import type { MessageStreamEvent } from '@anthropic-ai/sdk/resources/messages';

export type AnthropicEvent = MessageStreamEvent;

/**
 * Opens one streamed message.
 *
 * Everything that knows the SDK exists lives here. The adapter that translates
 * provider events into domain chunks takes one of these, so the translation is
 * testable against recorded fixtures without a network or an API key.
 *
 * Mirrors the Gemini opener deliberately: two providers behind one port read
 * better side by side than each in its own idiom.
 */
export interface MessageStreamOpener {
  open(request: MessageStreamRequest): Promise<MessageStream>;
}

/**
 * One turn of the conversation in the provider's own vocabulary.
 *
 * Anthropic calls the assistant side "assistant", where Gemini calls it
 * "model". The mapping from the domain's author names happens in the adapter;
 * by the time a turn is one of these it is provider shaped.
 */
export interface MessageTurn {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface MessageStreamRequest {
  readonly model: string;
  readonly system: string;
  /** The conversation so far, oldest first, ending with the new question. */
  readonly messages: readonly MessageTurn[];
}

/**
 * A stream that can be abandoned.
 *
 * `abort` is called from the adapter's `finally` block whenever iteration
 * stops, including early. Stopping a turn must release the provider connection,
 * because a provider keeps billing for tokens nobody is reading (ADR-016).
 */
export interface MessageStream {
  events(): AsyncIterator<AnthropicEvent>;
  abort(): Promise<void>;
}

/**
 * The ceiling on one answer.
 *
 * ADR-032 recorded a live call at 700 cutting off inside a numbered list, which
 * for someone following steps on a phone is worse than no answer: they act on
 * half a procedure. This is a cap, not a budget — an answer that ends naturally
 * costs what it costs, so raising it spends nothing on the answers that were
 * already finishing.
 */
export const MAX_ANSWER_TOKENS = 2048;

/** The real thing: the Anthropic Messages API (ADR-032). */
export class AnthropicMessageStreamOpener implements MessageStreamOpener {
  constructor(private readonly client: Anthropic) {}

  static withApiKey(apiKey: string): AnthropicMessageStreamOpener {
    return new AnthropicMessageStreamOpener(new Anthropic({ apiKey }));
  }

  async open(request: MessageStreamRequest): Promise<MessageStream> {
    const stream = await this.client.messages.create({
      model: request.model,
      max_tokens: MAX_ANSWER_TOKENS,
      // The product policy is the system prompt, never a user turn, so no
      // amount of conversation can push it out of the window.
      system: request.system,
      messages: request.messages.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
      // No `thinking` and no `effort`. claude-sonnet-4-5 runs without thinking
      // when the parameter is omitted, which is what makes "no separate
      // reasoning count" true rather than approximate (ADR-032). `effort` is
      // rejected outright by this model.
      stream: true,
    });

    const iterator = stream[Symbol.asyncIterator]();

    return {
      events: () => iterator,
      abort: async () => {
        // Stopping the iterator is what releases the underlying HTTP body.
        // Both calls are best effort: a stream that already closed normally
        // has nothing left to release, and that is not an error.
        try {
          await iterator.return?.();
        } catch {
          /* already finished */
        }
        try {
          stream.controller.abort();
        } catch {
          /* already finished */
        }
      },
    };
  }
}
