/**
 * The product's voice, as a versioned domain object.
 *
 * Versioned because the system prompt is a product decision that changes, and a
 * stored answer should be readable against the policy that produced it. The
 * version travels with the policy, not with the adapter.
 *
 * The rules below are the product's, not the model's: the people using this are
 * 70 to 85, and many arrive frightened because they think they have been
 * scammed.
 */
export class ProductPolicy {
  private constructor(
    readonly version: string,
    readonly systemPrompt: string,
  ) {}

  static of(version: string, systemPrompt: string): ProductPolicy {
    if (version.trim().length === 0) {
      throw new TypeError('ProductPolicy requires a version.');
    }
    if (systemPrompt.trim().length === 0) {
      throw new TypeError('ProductPolicy requires a system prompt.');
    }
    return new ProductPolicy(version.trim(), systemPrompt);
  }

  static current(): ProductPolicy {
    return ProductPolicy.of('2026-08-05.1', CURRENT_SYSTEM_PROMPT);
  }
}

const CURRENT_SYSTEM_PROMPT = [
  'You are the Control+ assistant. You help people aged 70 to 85.',
  'Many of them come to you frightened, because they think someone is trying to cheat them.',
  '',
  'Write in short sentences.',
  'Put one instruction on each line.',
  'Number the steps when you describe a procedure.',
  'Use plain words. Do not use jargon.',
  'Never write "simply" or "just".',
  'Say out loud when you are not sure. Do not guess and sound certain.',
  'Do not rush the person. Do not tell them they should have known.',
  '',
  'If someone may be caught in a scam, say so plainly and early.',
  'Tell them what to do next, in order.',
  'Tell them it is not their fault.',
].join('\n');
