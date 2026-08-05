import type { ModelId } from '../value-objects/model-id.ts';
import { ModelPrice } from './model-price.ts';

/**
 * Published prices per million tokens, in US dollars, read from each provider's
 * own pricing page on 2026-08-05.
 *
 * This is a snapshot and product policy, not a billing integration (ADR-025).
 * It lives in the domain because what a conversation costs is something the
 * product reports, and it must not change when an adapter does.
 *
 * Keys are the identifiers we ask for. The wire often answers with a dated
 * snapshot of the same model, which `priceFor` normalises — see below.
 */
const PUBLISHED_PRICES: ReadonlyArray<
  readonly [key: string, input: number, output: number, reasoning: number]
> = [
  // Anthropic bills reasoning inside output tokens and reports no separate
  // count, so the reasoning rate is the output rate and the reported reasoning
  // token count is zero (ADR-032).
  ['claude-sonnet-4-5', 3, 15, 15],
  ['claude-opus-5', 5, 25, 25],
  // Gemini reports thinking separately (ADR-020) and bills it at the output
  // rate. This is the entry where the third component does real work.
  ['gemini-3.5-flash', 1.5, 9, 9],
  ['gemini-3.6-flash', 1.5, 7.5, 7.5],
  // OpenAI bills reasoning inside output tokens and reports the count under
  // output_tokens_details, so the count is folded into output the same way.
  ['gpt-5.5', 5, 30, 30],
  ['gpt-5.4', 2.5, 15, 15],
];

/**
 * ModelId to price, with the snapshot problem handled.
 *
 * Found in S3b and recorded in ADR-025: the adapter asks for
 * `claude-sonnet-4-5` and the wire reports `claude-sonnet-4-5-20250929`.
 * Provenance records what actually answered, which is correct, so a catalogue
 * keyed only on the alias misses on every real turn and reports zero cost. The
 * brief asks for enough tracking to estimate what a conversation cost, and a
 * silent zero is worse than an imprecise number.
 *
 * So lookup is exact match first, then the longest key the reported id extends
 * with a `-`. The separator matters: without it `gpt-5` would claim `gpt-5.5`.
 *
 * A model the catalogue does not know returns null, never a zero price. An
 * unpriced model has to be visible as unpriced.
 */
export class PricingCatalogue {
  private constructor(private readonly prices: ReadonlyMap<string, ModelPrice>) {}

  static current(): PricingCatalogue {
    const prices = new Map<string, ModelPrice>();
    for (const [key, input, output, reasoning] of PUBLISHED_PRICES) {
      prices.set(key, ModelPrice.of(input, output, reasoning));
    }
    return new PricingCatalogue(prices);
  }

  static of(prices: ReadonlyMap<string, ModelPrice>): PricingCatalogue {
    return new PricingCatalogue(new Map(prices));
  }

  priceFor(modelId: ModelId): ModelPrice | null {
    const reported = modelId.value;

    const exact = this.prices.get(reported);
    if (exact !== undefined) {
      return exact;
    }

    let bestKey: string | null = null;
    for (const key of this.prices.keys()) {
      if (!reported.startsWith(`${key}-`)) {
        continue;
      }
      if (bestKey === null || key.length > bestKey.length) {
        bestKey = key;
      }
    }

    return bestKey === null ? null : (this.prices.get(bestKey) ?? null);
  }
}
