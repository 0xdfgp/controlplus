/**
 * A photo inside a Message. A reference to one, never the photo itself.
 *
 * ADR-014 says an attachment is referenced and never embedded, and ADR-024
 * decided that the bytes are not persisted at all: they travel to the provider
 * inside the turn that carried them and are gone when it closes. So this holds
 * what survives the turn and nothing else — what kind of picture it was, how
 * big it was, and a hash that identifies it if the same photo is ever sent
 * again.
 *
 * The consequence is stated in ADR-024 rather than hidden here: a conversation
 * cannot be fully reconstructed from the database, because the image is gone.
 * The production answer is object storage behind an attachment port.
 *
 * A new variant of an existing union, not a new message type. Video later is
 * another variant and a branch in two mappers, which is the whole point of
 * ADR-014.
 */
export class ImagePart {
  readonly kind = 'image' as const;

  private constructor(
    readonly mediaType: string,
    readonly width: number,
    readonly height: number,
    /**
     * Identifies the bytes that were sent, without keeping them.
     *
     * The domain does not compute it: hashing needs a crypto primitive and the
     * domain has no dependencies. It arrives already computed, the same way
     * time arrives through the Clock port.
     */
    readonly hash: string,
  ) {}

  static of(input: {
    readonly mediaType: string;
    readonly width: number;
    readonly height: number;
    readonly hash: string;
  }): ImagePart {
    if (input.mediaType.trim().length === 0) {
      throw new TypeError('ImagePart requires a media type.');
    }
    if (!Number.isInteger(input.width) || input.width <= 0) {
      throw new TypeError(
        `ImagePart requires a positive whole width, received ${String(input.width)}.`,
      );
    }
    if (!Number.isInteger(input.height) || input.height <= 0) {
      throw new TypeError(
        `ImagePart requires a positive whole height, received ${String(input.height)}.`,
      );
    }
    if (input.hash.trim().length === 0) {
      // Without it the part records that there was a photo and nothing about
      // which one, which is not a reference to anything.
      throw new TypeError('ImagePart requires a hash of the bytes that were sent.');
    }
    return new ImagePart(
      input.mediaType.trim(),
      input.width,
      input.height,
      input.hash.trim(),
    );
  }

  equals(other: ImagePart): boolean {
    return (
      this.mediaType === other.mediaType &&
      this.width === other.width &&
      this.height === other.height &&
      this.hash === other.hash
    );
  }
}
