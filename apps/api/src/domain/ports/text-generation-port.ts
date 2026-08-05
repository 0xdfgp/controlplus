import type { ProductPolicy } from '../policy/product-policy.ts';
import type { ModelId } from '../value-objects/model-id.ts';
import type { Usage } from '../value-objects/usage.ts';

/** What the domain asks a generation provider for. One request per turn. */
export interface GenerationRequest {
  readonly policy: ProductPolicy;
  /** The user's question. Conversation history is S3. */
  readonly question: string;
}

/**
 * The first chunk of any generation, successful or not.
 *
 * It exists so that a turn is attributable from its first moment. A cancelled
 * stream never reaches the completion chunk, and a Message cannot be built
 * without provenance, so without this the partial answer of a stopped turn
 * could not be recorded at all.
 *
 * What it names is the model the adapter asked for. The completion chunk still
 * reports the model that actually answered, which can differ; a stopped turn
 * only ever established the former.
 */
export interface StartedChunk {
  readonly kind: 'started';
  readonly modelId: ModelId;
  readonly provider: string;
}

/** A run of answer text as it arrives. */
export interface TextChunk {
  readonly kind: 'text';
  readonly text: string;
}

/**
 * The last chunk of a successful generation.
 *
 * Usage crosses the port as a domain value object here, not as a loose field,
 * and the model and provider that actually produced the answer are reported by
 * the adapter rather than assumed from configuration.
 */
export interface CompletionChunk {
  readonly kind: 'completion';
  readonly usage: Usage;
  readonly modelId: ModelId;
  readonly provider: string;
}

export type GenerationChunk = StartedChunk | TextChunk | CompletionChunk;

/**
 * Streaming text generation (ADR-012).
 *
 * Returns an AsyncIterable. Cancellation is expressed by stopping iteration —
 * `break` out of the `for await`, and the adapter aborts the underlying stream
 * in its `finally` block. No AbortSignal enters the domain.
 *
 * A successful stream is one started chunk, then zero or more text chunks, then
 * exactly one completion chunk. A cancelled one is a prefix of that.
 *
 * Every provider failure surfaces as ProviderUnavailable. No provider type
 * crosses this boundary.
 */
export interface TextGenerationPort {
  generate(request: GenerationRequest): AsyncIterable<GenerationChunk>;
}
