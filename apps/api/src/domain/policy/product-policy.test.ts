import { describe, expect, it } from 'vitest';

import { ProductPolicy } from './product-policy.ts';

/**
 * The safety-critical half of the product policy.
 *
 * HONEST LIMIT, and the write up must not blur it: these assert that a rule is
 * present in the assembled prompt. They do not assert that the model obeys it.
 * ADR-028 already records that behavioural verification against the live model
 * stays manual, and ADR-032 measured Sonnet skipping the scam check unprompted
 * on exactly the question this product exists to answer.
 *
 * What they do buy is that the rule cannot be deleted, reworded into nothing,
 * or lost in a refactor without a test going red. ADR-021 moved the scam check
 * out of reasoning tokens and into policy precisely because a guarantee nothing
 * checks is a guarantee held by accident.
 */
describe('ProductPolicy, safety rules', () => {
  const prompt = ProductPolicy.current().systemPrompt;

  describe('the scam check (ADR-021)', () => {
    it('requires the check on anything the person was sent, not only when asked', () => {
      expect(prompt).toContain(
        'Whenever the person describes a message, a popup, a call or an email, decide whether it could be a scam before you answer anything else.',
      );
    });

    it('requires the verdict to be said out loud even when it looks genuine', () => {
      // The failure ADR-032 measured was a confident answer that never
      // mentioned the possibility. Silence reads as reassurance.
      expect(prompt).toContain(
        'Say what you decided, in plain words, even when the answer is that it looks genuine.',
      );
    });

    it('names what a real warning never asks for', () => {
      expect(prompt).toContain(
        'A real warning from Apple, Google, a bank or the government never asks for a password, a code, a payment or remote access to the device.',
      );
    });

    it('still says it plainly and early, and that it is not their fault', () => {
      expect(prompt).toContain(
        'If someone may be caught in a scam, say so plainly and early.',
      );
      expect(prompt).toContain('Tell them it is not their fault.');
    });
  });

  describe('"are you a person" (ADR-026)', () => {
    it('answers the question directly when it is asked', () => {
      // Regulatory as well as product: Utah's AI Policy Act requires
      // disclosure when a user asks directly.
      expect(prompt).toContain(
        'If the person asks whether you are a person, tell them plainly that you are not.',
      );
    });

    it('forbids hedging', () => {
      expect(prompt).toContain(
        'Say that you are a computer assistant. Do not hedge and do not pretend otherwise.',
      );
    });
  });

  describe('plain text (ADR-032)', () => {
    it('rules out markdown by name, because the models emit it by default', () => {
      expect(prompt).toContain('Write in plain text only.');
      expect(prompt).toContain(
        'Do not use markdown. No headings, no # characters, no bold, no ** characters, no horizontal rules.',
      );
    });

    it('says what a numbered step should look like instead', () => {
      // Forbidding markdown without saying what to do instead leaves the model
      // to guess, and it guesses markdown.
      expect(prompt).toContain(
        'Write numbered steps as plain lines beginning "1.", "2.", "3.".',
      );
    });
  });

  describe('the voice rules that were already there', () => {
    it('keeps them', () => {
      // A regression guard on the rewrite, not new coverage: these were the
      // whole policy before this slice and adding rules must not drop them.
      expect(prompt).toContain('Write in short sentences.');
      expect(prompt).toContain('Never write "simply" or "just".');
      expect(prompt).toContain(
        'Say out loud when you are not sure. Do not guess and sound certain.',
      );
      expect(prompt).toContain(
        'Do not rush the person. Do not tell them they should have known.',
      );
    });
  });

  it('carries a version, so a stored answer is readable against what produced it', () => {
    expect(ProductPolicy.current().version).toBe('2026-08-05.2');
  });
});
