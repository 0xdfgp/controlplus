import { AttachmentTooLarge } from '../errors/attachment-too-large.ts';

/**
 * The ceiling on a photo, measured after the device resized it (ADR-024).
 *
 * Five megabytes is generous for a 1568px JPEG at quality 0.8, which lands
 * closer to half a megabyte. It is a backstop against a photo that arrived by
 * some other route, not a budget anyone is expected to spend.
 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/**
 * Refuses an attachment over the limit, as a domain rule.
 *
 * It lives here rather than on ImagePart.of for one reason: the domain never
 * holds the bytes, so their size is not a property of the part. Putting it in
 * the constructor would mean either persisting a byte count nobody reads or
 * skipping the check when a stored part is rehydrated, and a check with an
 * exception in it is not an invariant.
 *
 * Pure, so it is tested with nothing mocked.
 */
export function assertWithinAttachmentLimit(byteSize: number): void {
  if (byteSize > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentTooLarge(byteSize, MAX_ATTACHMENT_BYTES);
  }
}
