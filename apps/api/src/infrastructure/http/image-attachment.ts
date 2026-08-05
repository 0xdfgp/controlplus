import { createHash } from 'node:crypto';

import type { ImagePayload } from '@control-plus/contracts';

import type { AskQuestionImage } from '../../application/user-message.ts';

/**
 * Turns the wire's base64 into what the use case needs.
 *
 * Two things happen here that cannot happen anywhere else. The bytes are
 * counted, because the domain rule is a size and the domain never sees the
 * bytes. And they are hashed, because hashing needs a crypto primitive and the
 * domain has no dependencies — the same reason time arrives through the Clock
 * port rather than from `Date.now()`.
 *
 * Neither is a business rule. What the limit is, and what a Message keeps, are
 * decided in the domain; this only measures and identifies.
 *
 * SHA-256 because it is the ordinary choice and nothing here needs it to be
 * anything cleverer. The hash identifies a photo across turns; it is not a
 * security claim.
 */
export function decodeImageAttachment(payload: ImagePayload): AskQuestionImage {
  const bytes = Buffer.from(payload.data, 'base64');

  // Buffer.from ignores what it cannot decode rather than failing, so an empty
  // result is how a malformed body announces itself. Caught here, before the
  // stream is opened, so it is a 400 and not an error event.
  if (bytes.byteLength === 0) {
    throw new TypeError('The photo could not be decoded.');
  }

  return {
    data: payload.data,
    mediaType: payload.mediaType,
    width: payload.width,
    height: payload.height,
    hash: createHash('sha256').update(bytes).digest('hex'),
    byteSize: bytes.byteLength,
  };
}
