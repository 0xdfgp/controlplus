import { describe, expect, it } from 'vitest';

import { ModelId } from '../value-objects/model-id.ts';
import { Usage } from '../value-objects/usage.ts';
import { ModelPrice } from './model-price.ts';
import { PricingCatalogue } from './pricing-catalogue.ts';

const catalogue = PricingCatalogue.current();

const priceOf = (id: string): ModelPrice => {
  const price = catalogue.priceFor(ModelId.fromString(id));
  if (price === null) {
    throw new Error(`Expected a price for ${id}.`);
  }
  return price;
};

describe('PricingCatalogue lookup', () => {
  it('resolves the identifier the adapter asks for', () => {
    expect(priceOf('claude-sonnet-4-5').inputPerMillion).toBe(3);
    expect(priceOf('claude-sonnet-4-5').outputPerMillion).toBe(15);
  });

  it('resolves the dated snapshot the wire actually reports', () => {
    // The S3b finding recorded in ADR-025. Provenance stores what answered,
    // and without this the lookup misses and the turn reports zero cost.
    expect(priceOf('claude-sonnet-4-5-20250929').outputPerMillion).toBe(15);
    expect(priceOf('gpt-5.5-2026-04-23').outputPerMillion).toBe(30);
  });

  it('does not let a shorter key claim a different model', () => {
    // "gpt-5" would prefix-match "gpt-5.5" without the separator guard, which
    // would price a frontier model at a cheaper model's rate and look right.
    expect(priceOf('gpt-5.5').inputPerMillion).toBe(5);
    expect(priceOf('gpt-5.4').inputPerMillion).toBe(2.5);
  });

  it('prefers the longest matching key', () => {
    const prices = new Map([
      ['gemini-3', ModelPrice.of(1, 1, 1)],
      ['gemini-3.5-flash', ModelPrice.of(2, 2, 2)],
    ]);
    const ambiguous = PricingCatalogue.of(prices);

    const price = ambiguous.priceFor(ModelId.fromString('gemini-3.5-flash-001'));

    expect(price?.inputPerMillion).toBe(2);
  });

  it('returns null for a model it does not know, never a zero price', () => {
    // A silent zero reads as "this turn was free". Absent has to look absent.
    expect(catalogue.priceFor(ModelId.fromString('some-unreleased-model'))).toBeNull();
  });
});

describe('ModelPrice cost', () => {
  it('prices input, output and reasoning separately', () => {
    const cost = priceOf('gemini-3.5-flash').costOf(
      Usage.fromCounts(1_000_000, 1_000_000, 1_000_000),
    );

    expect(cost.inputUsd).toBeCloseTo(1.5, 10);
    expect(cost.outputUsd).toBeCloseTo(9, 10);
    expect(cost.reasoningUsd).toBeCloseTo(9, 10);
    expect(cost.totalUsd()).toBeCloseTo(19.5, 10);
  });

  it('charges nothing for reasoning a provider reported as zero', () => {
    // Anthropic bills reasoning inside output_tokens, so the spend is already
    // in the output component. A non-zero reasoning charge here would be the
    // same figure counted twice.
    const cost = priceOf('claude-opus-5').costOf(Usage.fromCounts(1000, 500, 0));

    expect(cost.reasoningUsd).toBe(0);
    expect(cost.inputUsd).toBeCloseTo(0.005, 10);
    expect(cost.outputUsd).toBeCloseTo(0.0125, 10);
  });

  it('sums the three parts and never blends them', () => {
    const cost = priceOf('claude-sonnet-4-5').costOf(Usage.fromCounts(100, 200, 0));

    expect(cost.totalUsd()).toBeCloseTo(
      cost.inputUsd + cost.outputUsd + cost.reasoningUsd,
      12,
    );
  });

  it('rejects a negative rate rather than producing a negative cost', () => {
    expect(() => ModelPrice.of(-1, 1, 1)).toThrow(TypeError);
  });
});
