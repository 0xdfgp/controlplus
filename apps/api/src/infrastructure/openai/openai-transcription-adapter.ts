import { ProviderUnavailable } from '../../domain/errors/provider-unavailable.ts';
import type {
  TranscriptionChunk,
  TranscriptionPort,
  TranscriptionRequest,
} from '../../domain/ports/transcription-port.ts';
import { ModelId } from '../../domain/value-objects/model-id.ts';
import type {
  OpenAITranscriptionEvent,
  TranscriptionStreamOpener,
} from './transcription-stream.ts';

export const OPENAI_PROVIDER = 'openai';

/**
 * TranscriptionPort over the OpenAI audio transcriptions API (ADR-017,
 * ADR-018).
 *
 * Normalises provider events into domain chunks here, so no provider type
 * crosses the port. Every failure becomes ProviderUnavailable: nothing above
 * this line branches on an SDK error.
 *
 * Only `transcript.text.delta` becomes transcript text. Segment events belong
 * to diarization, which this product does not do: one person is speaking, and a
 * speaker label is not part of what they said.
 */
export class OpenAITranscriptionAdapter implements TranscriptionPort {
  constructor(
    private readonly opener: TranscriptionStreamOpener,
    private readonly modelId: ModelId,
  ) {}

  async *transcribe(
    request: TranscriptionRequest,
  ): AsyncIterable<TranscriptionChunk> {
    let stream;
    try {
      stream = await this.opener.open({
        model: this.modelId.value,
        data: request.audio.data,
        mediaType: request.audio.mediaType,
        fileName: request.audio.fileName,
      });
    } catch (cause) {
      throw new ProviderUnavailable(OPENAI_PROVIDER, { cause });
    }

    let transcript = '';
    const iterator = stream.events();

    try {
      // Named before the provider has said anything, so a transcription
      // abandoned in the first second is still attributable. Inside the try,
      // because a consumer that stops here must still release the stream.
      yield {
        kind: 'started',
        modelId: this.modelId,
        provider: OPENAI_PROVIDER,
      };

      while (true) {
        const step = await iterator.next();
        if (step.done === true) {
          // The provider closed without a done event. Whatever arrived is not
          // a transcript we can attest to, so this is a failure rather than a
          // short answer.
          throw new ProviderUnavailable(OPENAI_PROVIDER, {
            cause: new Error('The transcription stream closed before completing.'),
          });
        }

        const chunk = this.translate(step.value, transcript);
        if (chunk === null) {
          continue;
        }
        if (chunk.kind === 'text') {
          transcript += chunk.text;
          yield chunk;
          continue;
        }
        yield chunk;
        return;
      }
    } catch (cause) {
      if (cause instanceof ProviderUnavailable) {
        throw cause;
      }
      throw new ProviderUnavailable(OPENAI_PROVIDER, { cause });
    } finally {
      // Reached on completion, on error, and when the consumer stops iterating
      // early, which is how cancellation is expressed (ADR-012).
      await stream.abort();
    }
  }

  private translate(
    event: OpenAITranscriptionEvent,
    accumulated: string,
  ): TranscriptionChunk | null {
    if (event.type === 'transcript.text.delta') {
      return event.delta.length > 0 ? { kind: 'text', text: event.delta } : null;
    }

    if (event.type === 'transcript.text.done') {
      // The provider's own final text wins over our accumulation when both
      // exist: it is what the provider stands behind. Falling back to the
      // deltas keeps a done event with an empty body from erasing a transcript
      // the user already watched arrive.
      return {
        kind: 'completion',
        transcript: event.text.length > 0 ? event.text : accumulated,
        modelId: this.modelId,
        provider: OPENAI_PROVIDER,
      };
    }

    // transcript.text.segment: diarization, which this product does not use.
    return null;
  }
}
