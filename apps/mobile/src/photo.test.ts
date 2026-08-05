import { describe, expect, it } from 'vitest';

import {
  byteSizeOfBase64,
  isPhotoSendable,
  JPEG_QUALITY,
  MAX_PHOTO_BYTES,
  PHOTO_TOO_BIG_SENTENCE,
  resizedSize,
  RESIZE_LONG_EDGE,
} from './photo.ts';

describe('resizing before anything is sent (ADR-024)', () => {
  it('bounds the long edge at 1568, whichever edge that is', () => {
    expect(RESIZE_LONG_EDGE).toBe(1568);

    // A modern phone screenshot, portrait.
    expect(resizedSize({ width: 1290, height: 2796 })).toEqual({
      width: 723,
      height: 1568,
    });
    // The same photo turned on its side.
    expect(resizedSize({ width: 2796, height: 1290 })).toEqual({
      width: 1568,
      height: 723,
    });
  });

  it('keeps the shape of the photo', () => {
    const before = { width: 4032, height: 3024 };
    const after = resizedSize(before);

    expect(after.width / after.height).toBeCloseTo(before.width / before.height, 2);
    expect(Math.max(after.width, after.height)).toBe(RESIZE_LONG_EDGE);
  });

  it('leaves a photo that is already small enough alone', () => {
    // Enlarging adds bytes and no detail, and plenty of screenshots are already
    // under this.
    const small = { width: 800, height: 600 };

    expect(resizedSize(small)).toEqual(small);
    expect(resizedSize({ width: 1568, height: 1000 })).toEqual({
      width: 1568,
      height: 1000,
    });
  });

  it('never rounds an edge away to nothing', () => {
    expect(resizedSize({ width: 20000, height: 4 })).toEqual({
      width: 1568,
      height: 1,
    });
  });

  it('compresses at a quality that keeps small print legible', () => {
    expect(JPEG_QUALITY).toBe(0.8);
  });
});

describe('measuring a photo without decoding it', () => {
  it('counts the bytes a base64 string stands for', () => {
    // Counted rather than decoded: turning several megabytes into bytes on the
    // JS thread to learn their length would stall the screen.
    expect(byteSizeOfBase64(Buffer.from('a').toString('base64'))).toBe(1);
    expect(byteSizeOfBase64(Buffer.from('ab').toString('base64'))).toBe(2);
    expect(byteSizeOfBase64(Buffer.from('abc').toString('base64'))).toBe(3);
    expect(byteSizeOfBase64(Buffer.from('abcd').toString('base64'))).toBe(4);
  });

  it('agrees with a real encoding at size', () => {
    const bytes = Buffer.alloc(100_003, 7);

    expect(byteSizeOfBase64(bytes.toString('base64'))).toBe(100_003);
  });
});

describe('the photo size limit, met on the device (AC4)', () => {
  it('is the same five megabytes the server holds', () => {
    expect(MAX_PHOTO_BYTES).toBe(5 * 1024 * 1024);
  });

  it('accepts a resized screenshot', () => {
    expect(isPhotoSendable(Buffer.alloc(480_000).toString('base64'))).toBe(true);
  });

  it('accepts a photo exactly on the limit', () => {
    expect(isPhotoSendable(Buffer.alloc(MAX_PHOTO_BYTES).toString('base64'))).toBe(
      true,
    );
  });

  it('refuses a photo over it', () => {
    expect(
      isPhotoSendable(Buffer.alloc(MAX_PHOTO_BYTES + 1).toString('base64')),
    ).toBe(false);
  });

  it('says so in a sentence with no code and no technical term', () => {
    // AC4 in full: no megabytes, no byte count, no error class. It says what
    // happened and what to do about it.
    expect(PHOTO_TOO_BIG_SENTENCE).toBe(
      'That photo is too big to send. Please take a new one, or choose a smaller picture.',
    );
    expect(PHOTO_TOO_BIG_SENTENCE).not.toMatch(/MB|byte|error|code|limit|size/i);
  });
});
