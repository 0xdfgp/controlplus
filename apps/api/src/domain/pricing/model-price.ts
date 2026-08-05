import type { Usage } from '../value-objects/usage.ts';
import { EstimatedCost } from './estimated-cost.ts';

const TOKENS_PER_UNIT = 1_000_000;

/**
 * What one model charges, per million tokens, for each of the three components.
 *
 * Reasoning is priced separately from output because the catalogue has to be
 * able to express a provider that bills them differently. Today none of the
 * four evaluated models does: Anthropic and OpenAI bill reasoning inside their
 * output tokens, and Gemini bills thinking at the output rate while reporting
 * the count separately. So `reasoningPerMillion` equals `outputPerMillion` for
 * every current entry, and that is a fact about August 2026 rather than a
 * property of the model. Collapsing the field would make the catalogue wrong
 * the first time a provider splits the rate.
 *
 * Where reasoning is billed inside output, the provider reports zero reasoning
 * tokens (ADR-032), so the reasoning component of the cost is zero and the
 * spend is already inside the output component. Nothing is double counted.
 */
export class ModelPrice {
  private constructor(
    readonly inputPerMillion: number,
    readonly outputPerMillion: number,
    readonly reasoningPerMillion: number,
  ) {}

  static of(
    inputPerMillion: number,
    outputPerMillion: number,
    reasoningPerMillion: number,
  ): ModelPrice {
    for (const rate of [inputPerMillion, outputPerMillion, reasoningPerMillion]) {
      if (!Number.isFinite(rate) || rate < 0) {
        throw new TypeError(
          `ModelPrice rates must be non-negative and finite, received ${rate}.`,
        );
      }
    }
    return new ModelPrice(inputPerMillion, outputPerMillion, reasoningPerMillion);
  }

  costOf(usage: Usage): EstimatedCost {
    return EstimatedCost.of(
      (usage.inputTokens.value * this.inputPerMillion) / TOKENS_PER_UNIT,
      (usage.outputTokens.value * this.outputPerMillion) / TOKENS_PER_UNIT,
      (usage.thoughtTokens.value * this.reasoningPerMillion) / TOKENS_PER_UNIT,
    );
  }
}
