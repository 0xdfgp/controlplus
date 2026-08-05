import type { ProductPolicy } from '../policy/product-policy.ts';
import type { ModelId } from '../value-objects/model-id.ts';
import type { Usage } from '../value-objects/usage.ts';

/** What the domain asks a generation provider for. One request per turn. */
export interface GenerationRequest {
  readonly policy: ProductPolicy;
  /** The user's question. Conversation history is S3. */
  readonly question: string;
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

export type GenerationChunk = TextChunk | CompletionChunk;

/**
 * Streaming text generation (ADR-012).
 *
 * Returns an AsyncIterable. Cancellation is expressed by stopping iteration —
 * `break` out of the `for await`, and the adapter aborts the underlying stream
 * in its `finally` block. No AbortSignal enters the domain.
 *
 * Every provider failure surfaces as ProviderUnavailable. No provider type
 * crosses this boundary.
 */
export interface TextGenerationPort {
  generate(request: GenerationRequest): AsyncIterable<GenerationChunk>;
}
