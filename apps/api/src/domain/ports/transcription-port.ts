import type { ModelId } from '../value-objects/model-id.ts';

/**
 * A recording to be turned into text.
 *
 * `data` is base64 with no `data:` prefix, the same choice ADR-024 made for a
 * photo: the bytes are what is being said now, not what is kept, and the domain
 * has no Buffer because it has no Node core imports.
 */
export interface TranscriptionAudio {
  /** Base64, no `data:` prefix. */
  readonly data: string;
  readonly mediaType: string;
  /** What to call the upload. Some providers infer the codec from it. */
  readonly fileName: string;
}

export interface TranscriptionRequest {
  readonly audio: TranscriptionAudio;
}

/**
 * The first chunk of any transcription, successful or not.
 *
 * Same reason as StartedChunk on the generation port: a turn is attributable
 * from its first moment, so a transcription abandoned before it completed can
 * still say which model was asked.
 */
export interface TranscriptionStartedChunk {
  readonly kind: 'started';
  readonly modelId: ModelId;
  readonly provider: string;
}

/** A run of transcript text as it arrives. */
export interface TranscriptTextChunk {
  readonly kind: 'text';
  readonly text: string;
}

/**
 * The last chunk of a successful transcription.
 *
 * It carries no Usage. Transcription is billed by audio duration, not by
 * tokens, and ADR-011 keeps those as two separate ledger lines rather than one
 * blended calculation. Duration is a property of the recording the caller
 * supplied, so the caller measures it and no provider has to be trusted for it.
 */
export interface TranscriptionCompletionChunk {
  readonly kind: 'completion';
  readonly transcript: string;
  readonly modelId: ModelId;
  readonly provider: string;
}

export type TranscriptionChunk =
  | TranscriptionStartedChunk
  | TranscriptTextChunk
  | TranscriptionCompletionChunk;

/**
 * Streaming speech to text (ADR-012, ADR-018).
 *
 * Returns an AsyncIterable for the same reason TextGenerationPort does:
 * cancellation is expressed by stopping iteration, and the adapter releases the
 * provider stream in its `finally`. No AbortSignal enters the domain.
 *
 * This port has no caller in the product. ADR-018 moved transcription onto the
 * device, so what reaches the backend is text. It stays here because Transcript
 * is a domain concept and this is what produces one, and because ADR-018
 * attached a condition to that: the port is not a design left unbuilt, it is
 * executed by the evaluation harness against a real provider. If nothing ran
 * it, it would be an omission dressed as design.
 *
 * Every provider failure surfaces as ProviderUnavailable. No provider type
 * crosses this boundary.
 */
export interface TranscriptionPort {
  transcribe(request: TranscriptionRequest): AsyncIterable<TranscriptionChunk>;
}
