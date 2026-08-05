/**
 * A run of text inside a Message.
 *
 * The only ContentPart this slice builds. ImagePart is S4 and TranscriptPart is
 * S5; both are named in the domain vocabulary but declaring them now would be
 * building ahead of the brief.
 */
export class TextPart {
  readonly kind = 'text' as const;

  private constructor(readonly text: string) {}

  static of(text: string): TextPart {
    if (text.length === 0) {
      throw new TypeError('TextPart cannot be empty.');
    }
    return new TextPart(text);
  }

  equals(other: TextPart): boolean {
    return this.text === other.text;
  }
}
