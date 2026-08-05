import type { ContentPart } from '../domain/content/content-part.ts';
import { ImagePart } from '../domain/content/image-part.ts';
import { TextPart } from '../domain/content/text-part.ts';
import type { GenerationImage } from '../domain/ports/text-generation-port.ts';

/**
 * The photo as it arrives at the use case: the bytes, plus the two things the
 * domain cannot work out for itself.
 *
 * `hash` and `byteSize` are computed where the bytes were decoded, in
 * infrastructure. The domain has no crypto and does not count bytes; it decides
 * what the limit is and what a Message keeps.
 */
export interface AskQuestionImage extends GenerationImage {
  readonly hash: string;
  readonly byteSize: number;
}

/**
 * What the user's message is made of, in reading order.
 *
 * The photo becomes an ImagePart and the bytes do not: what a Message keeps is
 * media type, dimensions and a hash (ADR-024). The image comes first because
 * that is the order it was composed in — the photo, and then the question about
 * it — and because the provider reads a turn the same way round.
 */
export function toUserMessageParts(
  question: string,
  image?: AskQuestionImage,
): ContentPart[] {
  const parts: ContentPart[] = [];

  if (image !== undefined) {
    parts.push(
      ImagePart.of({
        mediaType: image.mediaType,
        width: image.width,
        height: image.height,
        hash: image.hash,
      }),
    );
  }

  parts.push(TextPart.of(question));
  return parts;
}
