import { TokenCount } from './token-count.ts';

/**
 * Token usage for one turn, as reported by the provider when the stream closes.
 *
 * Usage crosses the TextGenerationPort as this value object on the completion
 * chunk, not as a loose field, so an adapter cannot hand the domain a bare
 * number it has not checked.
 *
 * Three fields, not two (ADR-020). Gemini bills thinking separately: a live
 * turn reported 22 input, 20 output and 388 thought against a total of 430, so
 * a model with only input and output understates the spend by roughly ten
 * times. thoughtTokens defaults to zero for providers that report no separate
 * reasoning count, which is honest rather than approximate. The number is what
 * the provider reports, not an independent measurement.
 *
 * Conversation cost totals are S7. Whether a conversation total exposes
 * thinking separately or blends it is D12, since it is priced differently.
 */
export class Usage {
  private constructor(
    readonly inputTokens: TokenCount,
    readonly outputTokens: TokenCount,
    readonly thoughtTokens: TokenCount,
  ) {}

  static of(
    inputTokens: TokenCount,
    outputTokens: TokenCount,
    thoughtTokens: TokenCount = TokenCount.zero(),
  ): Usage {
    return new Usage(inputTokens, outputTokens, thoughtTokens);
  }

  static fromCounts(
    inputTokens: number,
    outputTokens: number,
    thoughtTokens = 0,
  ): Usage {
    return new Usage(
      TokenCount.of(inputTokens),
      TokenCount.of(outputTokens),
      TokenCount.of(thoughtTokens),
    );
  }

  /**
   * Every token the turn was billed for.
   *
   * The three-part sum, which is what the provider's own total reports: 22 in
   * plus 20 out plus 388 thought is the 430 it returned. A two-part sum called
   * "total" would be the bug ADR-020 exists to remove.
   */
  totalTokens(): TokenCount {
    return this.inputTokens.plus(this.outputTokens).plus(this.thoughtTokens);
  }

  equals(other: Usage): boolean {
    return (
      this.inputTokens.equals(other.inputTokens) &&
      this.outputTokens.equals(other.outputTokens) &&
      this.thoughtTokens.equals(other.thoughtTokens)
    );
  }
}
