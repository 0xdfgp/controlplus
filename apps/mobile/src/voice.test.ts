import { describe, expect, it } from 'vitest';

import {
  COULD_NOT_LISTEN,
  isTranscriptUsable,
  levelFraction,
  levelToBars,
  LEVEL_INAUDIBLE,
  LEVEL_LOUDEST,
  meansNothingHeard,
  MICROPHONE_DENIED,
  NOTHING_HEARD,
  ON_DEVICE_UNAVAILABLE,
  RESTING_BAR,
  sentenceForRecognitionProblem,
  SPEECH_DENIED,
} from './voice.ts';

describe('reading the microphone level (AC1)', () => {
  it('treats the recogniser range as −2 to 10, inaudible at or below zero', () => {
    expect(LEVEL_INAUDIBLE).toBe(0);
    expect(LEVEL_LOUDEST).toBe(10);

    // The bottom of the range the recogniser can report, and the floor it
    // calls inaudible. Both are silence, and both draw the same.
    expect(levelFraction(-2)).toBe(0);
    expect(levelFraction(0)).toBe(0);
  });

  it('rises in proportion to what was actually heard', () => {
    expect(levelFraction(2.5)).toBeCloseTo(0.25, 5);
    expect(levelFraction(5)).toBeCloseTo(0.5, 5);
    expect(levelFraction(10)).toBe(1);
  });

  it('clamps above the loudest value rather than overflowing the bars', () => {
    expect(levelFraction(11)).toBe(1);
    expect(levelFraction(1000)).toBe(1);
  });

  it('reads a value that is not a real number as silence', () => {
    // Better a still meter than one drawn from NaN or infinity. Neither is a
    // measurement, so neither gets drawn as one.
    expect(levelFraction(Number.NaN)).toBe(0);
    expect(levelFraction(Number.POSITIVE_INFINITY)).toBe(0);
    expect(levelFraction(Number.NEGATIVE_INFINITY)).toBe(0);
  });
});

describe('the level meter, driven only by the microphone', () => {
  it('draws one height per bar', () => {
    expect(levelToBars(5, 5)).toHaveLength(5);
    expect(levelToBars(5, 3)).toHaveLength(3);
  });

  it('rests every bar at the same visible height when nothing is heard', () => {
    // Silence looks like silence. Nothing here moves on a timer: with no
    // volume arriving, the bars do not move at all.
    expect(levelToBars(LEVEL_INAUDIBLE, 5)).toEqual([
      RESTING_BAR,
      RESTING_BAR,
      RESTING_BAR,
      RESTING_BAR,
      RESTING_BAR,
    ]);
    expect(levelToBars(-2, 5)).toEqual(levelToBars(0, 5));
  });

  it('grows with loudness and never past the full height', () => {
    const quiet = levelToBars(2, 5);
    const loud = levelToBars(9, 5);

    for (const [index, height] of loud.entries()) {
      expect(height).toBeGreaterThan(quiet[index] as number);
      expect(height).toBeLessThanOrEqual(1);
      expect(height).toBeGreaterThanOrEqual(RESTING_BAR);
    }
  });

  it('is tallest in the middle, so it reads as a voice not a progress bar', () => {
    const bars = levelToBars(LEVEL_LOUDEST, 5);

    expect(bars[2]).toBe(1);
    expect(bars[1]).toBeCloseTo(bars[3] as number, 10);
    expect(bars[0]).toBeCloseTo(bars[4] as number, 10);
    expect(bars[0] as number).toBeLessThan(bars[1] as number);
    expect(bars[1] as number).toBeLessThan(bars[2] as number);
  });

  it('draws a single bar without dividing by zero', () => {
    expect(levelToBars(LEVEL_LOUDEST, 1)).toEqual([1]);
    expect(levelToBars(LEVEL_INAUDIBLE, 1)).toEqual([RESTING_BAR]);
  });
});

describe('whether anything was heard (AC5)', () => {
  it('accepts a transcript with words in it', () => {
    expect(isTranscriptUsable('Can you check if this email from my bank is real')).toBe(
      true,
    );
  });

  it('refuses an empty or blank transcript', () => {
    // What a recogniser that heard nothing actually returns, on both platforms.
    expect(isTranscriptUsable('')).toBe(false);
    expect(isTranscriptUsable('   ')).toBe(false);
    expect(isTranscriptUsable('\n\t ')).toBe(false);
  });
});

describe('what the person reads when speaking does not work out', () => {
  const SENTENCES = [
    MICROPHONE_DENIED,
    SPEECH_DENIED,
    NOTHING_HEARD,
    ON_DEVICE_UNAVAILABLE,
    COULD_NOT_LISTEN,
  ];

  it('carries no error code and no technical term', () => {
    for (const sentence of SENTENCES) {
      expect(sentence).not.toMatch(
        /error|code|exception|recogni[sz]er|not-allowed|no-speech|null|undefined|API/i,
      );
    }
  });

  it('always leaves a way to carry on', () => {
    // A refused microphone is not a failure state. Every one of these says so
    // by naming the thing the person can still do.
    for (const sentence of SENTENCES) {
      expect(sentence).toMatch(/type your question/i);
    }
  });

  it('promises the voice goes nowhere when the phone cannot keep that promise', () => {
    // ADR-018's guarantee is the reason this path exists at all. If the phone
    // cannot transcribe on its own, the person types rather than the audio
    // quietly going to a server.
    expect(ON_DEVICE_UNAVAILABLE).toMatch(/never sends your voice anywhere/);
  });
});

describe('translating a recogniser problem into a sentence', () => {
  it('says nothing was heard for the two codes that mean that (AC5)', () => {
    expect(sentenceForRecognitionProblem('no-speech')).toBe(NOTHING_HEARD);
    expect(sentenceForRecognitionProblem('speech-timeout')).toBe(NOTHING_HEARD);

    expect(meansNothingHeard('no-speech')).toBe(true);
    expect(meansNothingHeard('speech-timeout')).toBe(true);
  });

  it('explains a refusal as a permission, not a fault (AC4)', () => {
    expect(sentenceForRecognitionProblem('not-allowed')).toBe(SPEECH_DENIED);
    expect(sentenceForRecognitionProblem('service-not-allowed')).toBe(SPEECH_DENIED);

    expect(meansNothingHeard('not-allowed')).toBe(false);
  });

  it('falls back to one plain sentence for everything else', () => {
    // interrupted by a call, busy, audio-capture, client, unknown. The person
    // does not need to know which; they need to know they can try again.
    for (const code of ['interrupted', 'busy', 'audio-capture', 'client', 'unknown']) {
      expect(sentenceForRecognitionProblem(code)).toBe(COULD_NOT_LISTEN);
      expect(meansNothingHeard(code)).toBe(false);
    }
  });

  it('sends an unsupported language down the on-device path', () => {
    expect(sentenceForRecognitionProblem('language-not-supported')).toBe(
      ON_DEVICE_UNAVAILABLE,
    );
  });
});
