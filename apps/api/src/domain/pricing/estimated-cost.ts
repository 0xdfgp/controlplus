/**
 * What one turn cost, in US dollars, split the way providers bill it.
 *
 * Three parts, never blended (ADR-025). ADR-020 was found because a two-part
 * model of usage understated Gemini spend by roughly ten times; blending the
 * three back into one number at this level would hide the same thing one layer
 * up, which is the mistake ADR-025 exists to prevent.
 *
 * These are estimates against a published price list, not an integration with
 * billing. The write up says so rather than presenting them as invoices.
 */
export class EstimatedCost {
  private constructor(
    readonly inputUsd: number,
    readonly outputUsd: number,
    readonly reasoningUsd: number,
  ) {}

  static of(
    inputUsd: number,
    outputUsd: number,
    reasoningUsd: number,
  ): EstimatedCost {
    for (const amount of [inputUsd, outputUsd, reasoningUsd]) {
      if (!Number.isFinite(amount) || amount < 0) {
        throw new TypeError(
          `EstimatedCost components must be non-negative and finite, received ${amount}.`,
        );
      }
    }
    return new EstimatedCost(inputUsd, outputUsd, reasoningUsd);
  }

  static zero(): EstimatedCost {
    return new EstimatedCost(0, 0, 0);
  }

  totalUsd(): number {
    return this.inputUsd + this.outputUsd + this.reasoningUsd;
  }

  plus(other: EstimatedCost): EstimatedCost {
    return new EstimatedCost(
      this.inputUsd + other.inputUsd,
      this.outputUsd + other.outputUsd,
      this.reasoningUsd + other.reasoningUsd,
    );
  }
}
