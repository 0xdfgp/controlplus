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

/**
 * One turn of the conversation in the provider's own vocabulary.
 *
 * `model` is what Gemini calls the assistant side. The mapping from the
 * domain's author names happens in the adapter; by the time a turn is one of
 * these it is provider shaped.
 */
export interface InteractionTurn {
  readonly role: 'user' | 'model';
  readonly content: string;
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
      input: request.input.map((turn) => ({
        role: turn.role,
        content: turn.content,
      })),
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
