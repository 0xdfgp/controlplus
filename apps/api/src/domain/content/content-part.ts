import { ImagePart } from './image-part.ts';
import { TextPart } from './text-part.ts';

/**
 * The typed content of a Message.
 *
 * TextPart and ImagePart today; TranscriptPart (S5) joins them later. The union
 * is the reason adding a way to ask is an additive change rather than a
 * reshaping of Message (ADR-014): a photo with a question is one message from
 * the user carrying two parts, not a second kind of message.
 */
export type ContentPart = TextPart | ImagePart;

export function isTextPart(part: ContentPart): part is TextPart {
  return part.kind === 'text';
}

export function isImagePart(part: ContentPart): part is ImagePart {
  return part.kind === 'image';
}

/**
 * Concatenates the text of every text part, in order.
 *
 * An ImagePart contributes nothing here, and deliberately: it has no text, and
 * inventing a caption for it would put words in the user's mouth. What a photo
 * looks like when the conversation is replayed to the model is decided in
 * conversation-context.ts, where the rest of the prompt wording lives.
 */
export function textOf(parts: readonly ContentPart[]): string {
  return parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join('');
}
