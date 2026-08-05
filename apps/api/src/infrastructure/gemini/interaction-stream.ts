import { GoogleGenAI } from '@google/genai';
import type { Interactions } from '@google/genai';

export type InteractionEvent = Interactions.InteractionSSEEvent;

/**
 * Opens one streamed interaction.
 *
 * Everything that knows the SDK exists lives here. The adapter that translates
 * provider events into domain chunks takes one of these, so the translation is
 * testable against recorded fixtures without a network or an API key.
 */
export interface InteractionStreamOpener {
  open(request: InteractionStreamRequest): Promise<InteractionStream>;
}

/** A run of text inside a turn, in the provider's own shape. */
export interface InteractionTextBlock {
  readonly type: 'text';
  readonly text: string;
}

/**
 * A photo inside a turn, in the provider's own shape (ADR-024).
 *
 * Inline base64 rather than a URI, because the bytes arrive with the question
 * and are never stored anywhere we could point at.
 */
export interface InteractionImageBlock {
  readonly type: 'image';
  readonly mime_type: string;
  /** Base64, no `data:` prefix. */
  readonly data: string;
}

export type InteractionContentBlock = InteractionTextBlock | InteractionImageBlock;

/**
 * One turn of the conversation in the provider's own vocabulary.
 *
 * `model` is what Gemini calls the assistant side. The mapping from the
 * domain's author names happens in the adapter; by the time a turn is one of
 * these it is provider shaped.
 *
 * `content` is a plain string for a turn that is only words, and a list of
 * blocks when a photo travels with it. Both are what the API accepts, and
 * keeping the string form means a text-only turn sends exactly what it always
 * sent. Mirrors MessageTurn on the Anthropic side.
 */
export interface InteractionTurn {
  readonly role: 'user' | 'model';
  readonly content: string | readonly InteractionContentBlock[];
}

export interface InteractionStreamRequest {
  readonly model: string;
  readonly systemInstruction: string;
  /** The conversation so far, oldest first, ending with the new question. */
  readonly input: readonly InteractionTurn[];
}

/**
 * A stream that can be abandoned.
 *
 * `abort` is called from the adapter's `finally` block whenever iteration
 * stops, including early. Cancellation is not wired to the UI until S2, but the
 * adapter already releases the provider connection so S2 is a UI change rather
 * than a rewrite here (ADR-012).
 */
export interface InteractionStream {
  events(): AsyncIterator<InteractionEvent>;
  abort(): Promise<void>;
}

/** The real thing: the Gemini Interactions API (ADR-017), not generateContent. */
export class GeminiInteractionStreamOpener implements InteractionStreamOpener {
  constructor(private readonly client: GoogleGenAI) {}

  static withApiKey(apiKey: string): GeminiInteractionStreamOpener {
    return new GeminiInteractionStreamOpener(new GoogleGenAI({ apiKey }));
  }

  async open(request: InteractionStreamRequest): Promise<InteractionStream> {
    const stream = await this.client.interactions.create({
      model: request.model,
      system_instruction: request.systemInstruction,
      // A list of turns rather than a bare string, which is how the same
      // endpoint carries a conversation rather than a single question.
      // Steps, not turns. The deployed Interactions API rejects a list of
      // {role, content} outright: "When using the steps-based API version, use
      // step_list input format instead of turn_list." The adapter and its tests
      // still speak in turns, because a turn is what the domain handed over and
      // what the other provider calls the same thing; converting to the wire's
      // vocabulary is this file's whole job.
      //
      // One cast, here, where our shape meets the SDK's, exactly as on the
      // Anthropic side. The difference is the mime type: the SDK narrows it to
      // a set of string literals and our block carries the string the request
      // validated. Widening our type to the SDK's would put a provider type in
      // the shape the adapter builds.
      input: request.input.map((turn) => ({
        type: turn.role === 'model' ? 'model_output' : 'user_input',
        content: (typeof turn.content === 'string'
          ? [{ type: 'text', text: turn.content }]
          : turn.content) as Interactions.Content[],
      })) as never,
      // ADR-021. Inside generation_config, which is the placement the live
      // probe found: at the top level the parameter is rejected as unknown.
      // Reasoning was 76 to 90 per cent of billed generation and 18 to 52
      // seconds of dead air, none of which the user ever sees.
      generation_config: { thinking_level: 'minimal' },
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
          if (!stream.locked) {
            await stream.cancel();
          }
        } catch {
          /* already finished */
        }
      },
    };
  }
}
