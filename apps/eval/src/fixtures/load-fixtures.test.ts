import { describe, expect, it } from 'vitest';

import { loadAudio, loadImage } from './load-fixtures.ts';

describe('the committed voice fixture', () => {
  it('reads its real duration despite a streamed placeholder length', () => {
    // The bug this exists for: OpenAI's speech endpoint streams the WAV and
    // writes 0xFFFFFFFF as the data chunk length because it does not know the
    // length yet. Taking that at face value reported 89,478 seconds for a 21
    // second file, and the transcription ledger line came out at $6.71 instead
    // of a sixth of a cent — three orders of magnitude, on the one number in
    // the run that nothing else cross-checks.
    const audio = loadAudio('assets/voice-question.wav');

    expect(audio.seconds).toBeGreaterThan(15);
    expect(audio.seconds).toBeLessThan(40);
  });

  it('agrees with the byte size at the rate in its own header', () => {
    const audio = loadAudio('assets/voice-question.wav');

    // 24 kHz, 16 bit, mono: 48000 bytes per second. Derived from the file
    // rather than hard-coded, so this still holds if the fixture is regenerated
    // at another rate.
    expect(audio.seconds).toBeCloseTo(audio.bytes / 48000, 1);
  });

  it('is the format gpt-transcribe was asked for', () => {
    const audio = loadAudio('assets/voice-question.wav');

    expect(audio.mediaType).toBe('audio/wav');
    expect(audio.fileName).toBe('voice-question.wav');
    expect(audio.data.length).toBeGreaterThan(0);
  });
});

describe('the committed screenshot', () => {
  it('is inside the bounds ADR-024 would have applied on the device', () => {
    const image = loadImage('assets/screenshot-error.png');

    expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(1568);
    expect(image.bytes).toBeLessThan(5 * 1024 * 1024);
  });

  it('reads its dimensions from the PNG header', () => {
    const image = loadImage('assets/screenshot-error.png');

    expect(image.width).toBeGreaterThan(0);
    expect(image.height).toBeGreaterThan(0);
    expect(image.mediaType).toBe('image/png');
  });

  it('refuses a fixture that is not there rather than sending nothing', () => {
    expect(() => loadImage('assets/not-a-file.png')).toThrow();
  });
});
