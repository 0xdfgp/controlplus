import { describe, expect, it } from 'vitest';

import { ImagePart } from './image-part.ts';

const valid = {
  mediaType: 'image/jpeg',
  width: 1568,
  height: 1176,
  hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
};

describe('ImagePart', () => {
  it('keeps what survives the turn, and nothing that does not', () => {
    const part = ImagePart.of(valid);

    expect(part.kind).toBe('image');
    expect(part.mediaType).toBe('image/jpeg');
    expect(part.width).toBe(1568);
    expect(part.height).toBe(1176);
    expect(part.hash).toBe(valid.hash);
  });

  it('has nowhere to put the bytes', () => {
    // ADR-024 is the whole reason this type exists in this shape. A `data`
    // field appearing here would be that decision quietly reversed, and this is
    // the test that goes red when someone adds one.
    const part = ImagePart.of(valid);

    expect(Object.keys(part).sort()).toEqual([
      'hash',
      'height',
      'kind',
      'mediaType',
      'width',
    ]);
    expect(JSON.stringify(part)).not.toContain('data');
  });

  it('refuses an image with no media type', () => {
    expect(() => ImagePart.of({ ...valid, mediaType: '  ' })).toThrow(TypeError);
  });

  it('refuses dimensions that are not positive whole numbers', () => {
    expect(() => ImagePart.of({ ...valid, width: 0 })).toThrow(TypeError);
    expect(() => ImagePart.of({ ...valid, height: -1 })).toThrow(TypeError);
    expect(() => ImagePart.of({ ...valid, width: 1568.5 })).toThrow(TypeError);
  });

  it('refuses a part with no hash', () => {
    // Without one it records that there was a photo and nothing about which
    // one, which is not a reference to anything.
    expect(() => ImagePart.of({ ...valid, hash: '' })).toThrow(TypeError);
  });

  it('compares by what it holds', () => {
    expect(ImagePart.of(valid).equals(ImagePart.of(valid))).toBe(true);
    expect(
      ImagePart.of(valid).equals(ImagePart.of({ ...valid, hash: 'other' })),
    ).toBe(false);
  });
});
