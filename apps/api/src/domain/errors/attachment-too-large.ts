/**
 * The photo is over the limit, after the device already resized it (ADR-024).
 *
 * A typed domain error rather than a validation failure in the HTTP layer,
 * because how large an attachment may be is a product rule: it exists to keep a
 * turn deliverable over the slow connection this audience is on, not to satisfy
 * a framework.
 *
 * The numbers are carried for the log line. They never reach the user, who is
 * told in one plain sentence that the photo is too big to send — no megabytes,
 * no byte count and no error code (S9 owns how failures are rendered; this
 * decides only what is named).
 */
export class AttachmentTooLarge extends Error {
  override readonly name = 'AttachmentTooLarge';

  constructor(
    readonly byteSize: number,
    readonly limitBytes: number,
  ) {
    super(
      `The attachment is ${byteSize} bytes, over the ${limitBytes} byte limit.`,
    );
  }
}
