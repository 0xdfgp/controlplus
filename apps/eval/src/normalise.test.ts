import { describe, expect, it } from 'vitest';

import { normaliseForComparison } from './run-evaluation.ts';

describe('comparing a transcript against the script it was read from', () => {
  it('treats a full stop heard as a comma as a match', () => {
    // The exact false alarm from the first live run: the script says
    // "Hello. I had a phone call" and gpt-transcribe returned "Hello, I had a
    // phone call". Nothing was lost, no candidate can see the difference, and
    // a mismatch flag on that tells the reader nothing.
    expect(normaliseForComparison('Hello. I had a phone call')).toBe(
      normaliseForComparison('Hello, I had a phone call'),
    );
  });

  it('ignores casing and repeated whitespace', () => {
    expect(normaliseForComparison('Did I do   the RIGHT thing?')).toBe(
      normaliseForComparison('did i do the right thing'),
    );
  });

  it('still reports a genuinely different word', () => {
    // The failure the check exists to catch: the transcription hop changing
    // what the four candidates are actually asked.
    expect(normaliseForComparison('he was from my bank')).not.toBe(
      normaliseForComparison('he was from my back'),
    );
  });

  it('still reports a dropped clause', () => {
    expect(normaliseForComparison('I did not give it to him')).not.toBe(
      normaliseForComparison('I did give it to him'),
    );
  });
});
