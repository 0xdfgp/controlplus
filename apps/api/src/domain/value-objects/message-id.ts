/** Identity of a Message aggregate. Generated through the IdGenerator port. */
export class MessageId {
  private constructor(readonly value: string) {}

  static fromString(value: string): MessageId {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new TypeError('MessageId cannot be empty.');
    }
    return new MessageId(trimmed);
  }

  equals(other: MessageId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
