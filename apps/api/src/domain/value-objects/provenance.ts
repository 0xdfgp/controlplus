import { ModelId } from './model-id.ts';

/**
 * Records that a Message was machine generated, and by what.
 *
 * Provenance is set in the domain at construction, never by the HTTP layer
 * (closed decision). There is deliberately no factory that takes an arbitrary
 * origin: the only way to get a Provenance is to say it was AI generated and
 * name the model and provider that produced it.
 *
 * AI disclosure in the interface is S6. What ships here is the record.
 */
export class Provenance {
  readonly origin = 'ai-generated' as const;

  private constructor(
    readonly modelId: ModelId,
    readonly provider: string,
  ) {}

  static aiGenerated(modelId: ModelId, provider: string): Provenance {
    const trimmed = provider.trim();
    if (trimmed.length === 0) {
      throw new TypeError('Provenance requires the provider that produced the answer.');
    }
    return new Provenance(modelId, trimmed);
  }

  equals(other: Provenance): boolean {
    return (
      this.modelId.equals(other.modelId) && this.provider === other.provider
    );
  }
}
