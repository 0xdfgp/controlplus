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

  describe('topic scope (ADR-034)', () => {
    it('names the two things the assistant is for', () => {
      expect(prompt).toContain(
        'You help with two things: keeping the person safe from scams and fraud, and using their own phone, computer and online accounts.',
      );
    });

    it('asks for a short, warm refusal rather than a lecture', () => {
      expect(prompt).toContain(
        'If they ask about anything else, tell them plainly that those two things are what you can help with.',
      );
      expect(prompt).toContain(
        'Say it in one or two sentences. Be warm. Do not lecture them and do not apologise at length.',
      );
    });

    it('leaves the person with something to ask next', () => {
      // A refusal that ends at "no" tells someone of 80 that they used the
      // wrong app, not that they asked the wrong question.
      expect(prompt).toContain(
        'Then say what you can help with, so they know what to ask next.',
      );
    });

    it('says how to write the list of what it can help with', () => {
      // A regression guard on a measured failure, not a precaution: the first
      // probe run answered an off-topic question with "- " bullets, which the
      // plain text rule forbids and which nothing else in the prompt covered,
      // because a list of capabilities is not a procedure (ADR-032, ADR-034).
      expect(prompt).toContain(
        'When you list what you can help with, put each one on its own line, with no dash and no bullet in front of it.',
      );
    });

    it('resolves an unsure case by answering, not by refusing', () => {
      // The safety valve, and the reason this rule is safe to ship at all. A
      // scam arrives dressed as a device problem more often than it announces
      // itself, so the failure this guards against is not an off-topic answer
      // slipping through — it is a frightened person being turned away.
      expect(prompt).toContain(
        'If you are not sure whether a question is about their safety or their device, answer it.',
      );
      expect(prompt).toContain(
        'A question about a message, a call, an email, a payment, a password or an account is always yours to answer.',
      );
    });

    it('keeps the scam check ahead of the scope rule', () => {
      // Order is load-bearing: ADR-032 measured a model skipping the scam
      // check, and a rule about what not to answer must not be read before the
      // rule about what to check first.
      expect(prompt.indexOf('decide whether it could be a scam')).toBeLessThan(
        prompt.indexOf('You help with two things:'),
      );
    });
  });

  describe('photos (S4, 03-senior-ux-principles)', () => {
    it('requires the model to read the photo before answering', () => {
      expect(prompt).toContain(
        'When the person sends a photo, read what is in it before you answer.',
      );
    });

    it('requires saying so plainly when the photo cannot be read, rather than guessing', () => {
      // The failure mode this exists for is a confident wrong answer about a
      // half-legible popup, which for this user costs money. Same argument as
      // the scam check: not a property bought from the model, a rule with a
      // test.
      expect(prompt).toContain(
        'If the photo is too blurry, too dark or too cut off to read, say so plainly and ask for another one. Do not guess what it says.',
      );
    });

    it('gives the sentence to say and what would help', () => {
      expect(prompt).toContain(
        'Say something like: I cannot quite read that, could you take it again?',
      );
      expect(prompt).toContain(
        'Tell them what would help, such as holding the phone steadier or getting the whole message in the picture.',
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
    expect(ProductPolicy.current().version).toBe('2026-08-06.1');
  });
});
