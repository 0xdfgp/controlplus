import OpenAI, { toFile } from 'openai';
import type { TranscriptionStreamEvent } from 'openai/resources/audio/transcriptions';

export type OpenAITranscriptionEvent = TranscriptionStreamEvent;

/**
 * Opens one streamed transcription.
 *
 * Everything that knows the SDK exists lives here. The adapter that translates
 * provider events into domain chunks takes one of these, so the translation is
 * testable against recorded fixtures without a network or an API key.
 *
 * Mirrors the Anthropic and Gemini openers deliberately: three providers behind
 * two ports read better side by side than each in its own idiom.
 */
export interface TranscriptionStreamOpener {
  open(request: TranscriptionStreamRequest): Promise<TranscriptionStream>;
}

export interface TranscriptionStreamRequest {
  readonly model: string;
  /** Base64, no `data:` prefix. */
  readonly data: string;
  readonly mediaType: string;
  readonly fileName: string;
}

/**
 * A stream that can be abandoned.
 *
 * `abort` is called from the adapter's `finally` block whenever iteration
 * stops, including early, for the same reason as on the generation port: a
 * provider keeps billing for work nobody is reading.
 */
export interface TranscriptionStream {
  events(): AsyncIterator<OpenAITranscriptionEvent>;
  abort(): Promise<void>;
}

/**
 * The model ADR-017 named: gpt-transcribe, the current recommended model for
 * new integrations. gpt-4o-transcribe is supported for existing ones and is
 * explicitly not the starting point here.
 */
export const TRANSCRIPTION_MODEL = 'gpt-transcribe';

/** The real thing: the OpenAI audio transcriptions API (ADR-017, ADR-018). */
export class OpenAITranscriptionStreamOpener implements TranscriptionStreamOpener {
  constructor(private readonly client: OpenAI) {}

  static withApiKey(apiKey: string): OpenAITranscriptionStreamOpener {
    return new OpenAITranscriptionStreamOpener(new OpenAI({ apiKey }));
  }

  async open(request: TranscriptionStreamRequest): Promise<TranscriptionStream> {
    const stream = await this.client.audio.transcriptions.create({
      model: request.model,
      file: await toFile(Buffer.from(request.data, 'base64'), request.fileName, {
        type: request.mediaType,
      }),
      // The property this port's AsyncIterable was designed around (ADR-012).
      // Without it the whole transcript arrives at once and the streaming
      // contract would be a shape with nothing behind it.
      stream: true,
    });

    const iterator = stream[Symbol.asyncIterator]();

    return {
      events: () => iterator,
      abort: async () => {
        // Stopping the iterator is what releases the underlying HTTP body.
        // Best effort: a stream that already closed normally has nothing left
        // to release, and that is not an error.
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
