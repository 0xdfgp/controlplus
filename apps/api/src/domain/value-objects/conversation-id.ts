/** Identity of a Conversation aggregate. Generated through the IdGenerator port. */
export class ConversationId {
  private constructor(readonly value: string) {}

  static fromString(value: string): ConversationId {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new TypeError('ConversationId cannot be empty.');
    }
    return new ConversationId(trimmed);
  }

  equals(other: ConversationId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
