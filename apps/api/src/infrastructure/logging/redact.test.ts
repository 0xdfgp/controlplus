import { describe, expect, it } from 'vitest';

import { CARD_MASK, EMAIL_MASK, PHONE_MASK, redact } from './redact.ts';

describe('redact', () => {
  it('masks an email address', () => {
    expect(redact('Write to me at margaret.wilson@example.com please')).toBe(
      `Write to me at ${EMAIL_MASK} please`,
    );
  });

  it('masks a phone number', () => {
    expect(redact('They told me to call 1-800-555-0199 right away')).toBe(
      `They told me to call ${PHONE_MASK} right away`,
    );
  });

  it('masks a card-shaped digit sequence', () => {
    expect(redact('The message asked for 4111 1111 1111 1111 urgently')).toBe(
      `The message asked for ${CARD_MASK} urgently`,
    );
  });

  it('masks a card number written without separators', () => {
    expect(redact('I typed in 4111111111111111')).toBe(`I typed in ${CARD_MASK}`);
  });

  it('leaves ordinary prose untouched', () => {
    const prose =
      'A message about my bank arrived this morning and it made me feel rushed.';

    expect(redact(prose)).toBe(prose);
  });

  it('leaves small numbers in prose untouched', () => {
    const prose = 'It said I had 24 hours to reply, and I am 78 years old.';

    expect(redact(prose)).toBe(prose);
  });

  it('masks rather than omits, so the log still says what was there', () => {
    const masked = redact('my card is 4111 1111 1111 1111');

    expect(masked).toContain(CARD_MASK);
    expect(masked).toContain('my card is');
    expect(masked).not.toContain('4111');
  });

  it('masks several kinds in one sentence', () => {
    const masked = redact(
      'Email bob@example.com or call 020 7946 0958 about card 4111111111111111.',
    );

    expect(masked).toContain(EMAIL_MASK);
    expect(masked).toContain(PHONE_MASK);
    expect(masked).toContain(CARD_MASK);
    expect(masked).not.toMatch(/\d{4}/);
  });

  it('does not mangle text with no sensitive content at all', () => {
    expect(redact('Is this a scam?')).toBe('Is this a scam?');
  });
});
