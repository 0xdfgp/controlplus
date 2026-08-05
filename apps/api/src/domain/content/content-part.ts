import { TextPart } from './text-part.ts';

/**
 * The typed content of a Message.
 *
 * A union of one member today. ImagePart (S4) and TranscriptPart (S5) join it
 * later; the union exists now so that adding them is an additive change rather
 * than a reshaping of Message.
 */
export type ContentPart = TextPart;

export function isTextPart(part: ContentPart): part is TextPart {
  return part.kind === 'text';
}

/** Concatenates the text of every text part, in order. */
export function textOf(parts: readonly ContentPart[]): string {
  return parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join('');
}
