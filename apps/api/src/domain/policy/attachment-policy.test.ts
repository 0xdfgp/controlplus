import { describe, expect, it } from 'vitest';

import { AttachmentTooLarge } from '../errors/attachment-too-large.ts';
import {
  assertWithinAttachmentLimit,
  MAX_ATTACHMENT_BYTES,
} from './attachment-policy.ts';

describe('the attachment limit (ADR-024)', () => {
  it('is five megabytes, measured after the device resized the photo', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(5 * 1024 * 1024);
  });

  it('accepts a photo the size of a resized screenshot', () => {
    // A 1568px JPEG at quality 0.8 lands nearer half a megabyte. The limit is a
    // backstop, not a budget.
    expect(() => assertWithinAttachmentLimit(480_000)).not.toThrow();
  });

  it('accepts a photo exactly on the limit', () => {
    expect(() =>
      assertWithinAttachmentLimit(MAX_ATTACHMENT_BYTES),
    ).not.toThrow();
  });

  it('refuses a photo over the limit as a typed domain error', () => {
    expect(() => assertWithinAttachmentLimit(MAX_ATTACHMENT_BYTES + 1)).toThrow(
      AttachmentTooLarge,
    );
  });

  it('carries the numbers for the log line and not for the user', () => {
    try {
      assertWithinAttachmentLimit(9_000_000);
      throw new Error('expected AttachmentTooLarge');
    } catch (error) {
      expect(error).toBeInstanceOf(AttachmentTooLarge);
      const tooLarge = error as AttachmentTooLarge;
      expect(tooLarge.name).toBe('AttachmentTooLarge');
      expect(tooLarge.byteSize).toBe(9_000_000);
      expect(tooLarge.limitBytes).toBe(MAX_ATTACHMENT_BYTES);
    }
  });
});
