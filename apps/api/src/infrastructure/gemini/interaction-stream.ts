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

export interface InteractionStreamRequest {
  readonly model: string;
  readonly systemInstruction: string;
  readonly input: string;
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
      input: request.input,
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
