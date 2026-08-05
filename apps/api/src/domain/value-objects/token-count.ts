/**
 * A count of tokens. Non-negative and whole, because a provider that reports
 * anything else has told us something we should not quietly store.
 */
export class TokenCount {
  private constructor(readonly value: number) {}

  static of(value: number): TokenCount {
    if (!Number.isInteger(value)) {
      throw new TypeError(`TokenCount must be a whole number, received ${value}.`);
    }
    if (value < 0) {
      throw new TypeError(`TokenCount cannot be negative, received ${value}.`);
    }
    return new TokenCount(value);
  }

  static zero(): TokenCount {
    return new TokenCount(0);
  }

  plus(other: TokenCount): TokenCount {
    return new TokenCount(this.value + other.value);
  }

  equals(other: TokenCount): boolean {
    return this.value === other.value;
  }
}
