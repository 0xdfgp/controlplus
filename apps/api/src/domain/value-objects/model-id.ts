/**
 * The provider's identifier for the model that produced an answer.
 *
 * Carried on Provenance so a stored Message can always say which model wrote
 * it, even after the configured default has moved on.
 */
export class ModelId {
  private constructor(readonly value: string) {}

  static fromString(value: string): ModelId {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new TypeError('ModelId cannot be empty.');
    }
    return new ModelId(trimmed);
  }

  equals(other: ModelId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
