/**
 * What happens to a photo before it leaves the phone (ADR-024).
 *
 * Pure, so the numbers that decide what is sent are testable without a camera,
 * a picker or a device. The hook that drives the native modules imports these
 * and does nothing else with arithmetic.
 */

/**
 * The long edge every photo is resized to.
 *
 * Anthropic scales anything larger down to roughly this before charging for it,
 * so sending more costs upload time on a slow connection and buys nothing.
 * 03-senior-ux-principles is blunter about the same point: expect large
 * uncropped screenshots and downscale on device.
 */
export const RESIZE_LONG_EDGE = 1568;

/** JPEG quality. High enough that small print in a screenshot stays legible. */
export const JPEG_QUALITY = 0.8;

/** The media type every photo is sent as, whatever it started life as. */
export const PHOTO_MEDIA_TYPE = 'image/jpeg';

/** The same limit the server holds, checked here first (ADR-024). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/**
 * What the person reads when the photo is too big.
 *
 * No megabytes, no file size and no error code. It says what happened and what
 * to do, which is all a sentence for this audience should carry.
 */
export const PHOTO_TOO_BIG_SENTENCE =
  'That photo is too big to send. Please take a new one, or choose a smaller picture.';

export interface PhotoSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The size a photo is resized to, keeping its shape.
 *
 * A photo already smaller than the long edge is left alone: enlarging it adds
 * bytes and no detail, and a screenshot of a phone screen is often already
 * under this.
 */
export function resizedSize(size: PhotoSize): PhotoSize {
  const longEdge = Math.max(size.width, size.height);
  if (longEdge <= RESIZE_LONG_EDGE) {
    return size;
  }

  const scale = RESIZE_LONG_EDGE / longEdge;
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/**
 * How many bytes a base64 string decodes to.
 *
 * Counted rather than decoded: the string is already several megabytes and
 * turning it into bytes on the JS thread to learn its length would stall the
 * screen. Every four characters carry three bytes, less whatever the padding
 * stands in for.
 */
export function byteSizeOfBase64(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/**
 * Whether this photo can be sent at all.
 *
 * Checked here, before anything leaves, because the person should be told by
 * the screen in front of them rather than by a request that fails. The server
 * keeps the same rule as a domain error; this is what makes the rule something
 * a person meets rather than something a log records.
 */
export function isPhotoSendable(base64: string): boolean {
  return byteSizeOfBase64(base64) <= MAX_PHOTO_BYTES;
}
