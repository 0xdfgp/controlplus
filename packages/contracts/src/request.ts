/**
 * The wire request for a turn. Hand written, imported by the API and the app.
 *
 * One request per turn (ADR-016). The conversation id travels in the path, not
 * the body: POST /conversations/:conversationId/messages
 */

/** What the provider accepts, and therefore what this request accepts. */
export const SUPPORTED_IMAGE_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export type ImageMediaType = (typeof SUPPORTED_IMAGE_MEDIA_TYPES)[number];

/**
 * A photo travelling with the question, inside the same POST (ADR-024).
 *
 * There is no second request and no upload endpoint: the bytes arrive here as
 * base64 and are gone once the turn closes. The device has already resized to
 * 1568px on the long edge and compressed to JPEG at quality 0.8, so `width` and
 * `height` describe what is actually in `data` rather than what was on the
 * camera roll.
 *
 * `data` is raw base64 with no `data:` URL prefix. The provider block wants it
 * that way and stripping a prefix server side would mean guessing at what the
 * client meant.
 */
export interface ImagePayload {
  readonly data: string;
  readonly mediaType: ImageMediaType;
  readonly width: number;
  readonly height: number;
}

export interface AskQuestionRequest {
  /** The question exactly as the user typed it. */
  readonly question: string;
  /**
   * The photo, when there is one.
   *
   * Optional, and the question is not: a photo arrives with something asked
   * about it. The domain can hold an image with no text (ADR-014), which is
   * what makes adding a photo-only turn later an additive change rather than a
   * reshaping.
   */
  readonly image?: ImagePayload;
}

function isImagePayload(value: unknown): value is ImagePayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const image = value as Partial<ImagePayload>;
  return (
    typeof image.data === 'string' &&
    image.data.length > 0 &&
    typeof image.mediaType === 'string' &&
    (SUPPORTED_IMAGE_MEDIA_TYPES as readonly string[]).includes(image.mediaType) &&
    Number.isInteger(image.width) &&
    (image.width ?? 0) > 0 &&
    Number.isInteger(image.height) &&
    (image.height ?? 0) > 0
  );
}

/**
 * Narrows an unknown body to AskQuestionRequest.
 *
 * The HTTP layer validates shape only. It never constructs Provenance and it
 * never decides whether a message is assistant-authored; the domain does both.
 * It does not decide whether the photo is too big either: that is a domain rule
 * with a domain error (ADR-024), and it needs the decoded byte count rather
 * than the shape.
 */
export function isAskQuestionRequest(
  value: unknown,
): value is AskQuestionRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const body = value as { question?: unknown; image?: unknown };
  if (typeof body.question !== 'string' || body.question.trim().length === 0) {
    return false;
  }
  return body.image === undefined || isImagePayload(body.image);
}
