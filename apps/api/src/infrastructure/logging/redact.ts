/**
 * Masks sensitive content in text bound for the logs (ADR-004).
 *
 * Logs mask, they never omit. An operator reading a turn needs to see that a
 * card number was in the question — that is often the whole story with a scam —
 * without the number itself being written down. Dropping the text entirely
 * would hide the incident; printing it would copy the harm.
 *
 * Where the boundary finally sits is D15. This slice ships the hook and one
 * implementation: emails, phone numbers and card-shaped digit sequences.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/**
 * 13 to 19 digits, optionally separated by spaces or hyphens. Matched before
 * phone numbers so a card is never mistaken for one.
 *
 * The separator sits between digits rather than after them, so the match stops
 * at the last digit and the space following the number survives.
 */
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;

/**
 * Everyday phone shapes: +1 800 555 0199, (800) 555-0199, 1-800-555-0199,
 * 020 7946 0958, 08001112222.
 *
 * Every group must end on a digit, and the digit-count check below keeps
 * ordinary numbers in prose ("24 hours", "78 years old") out of it.
 */
const PHONE = /\(?\+?\d{1,4}\)?(?:[ .()-]*\d{2,4}){1,5}/g;

export const EMAIL_MASK = '[email]';
export const PHONE_MASK = '[phone]';
export const CARD_MASK = '[card]';

function digitCount(value: string): number {
  let count = 0;
  for (const character of value) {
    if (character >= '0' && character <= '9') {
      count += 1;
    }
  }
  return count;
}

/**
 * Returns the text with sensitive spans replaced by a label naming what was
 * there. Ordinary prose, including small numbers, is left untouched.
 */
export function redact(text: string): string {
  return text
    .replace(EMAIL, EMAIL_MASK)
    .replace(CARD, (match) => {
      const digits = digitCount(match);
      return digits >= 13 && digits <= 19 ? CARD_MASK : match;
    })
    .replace(PHONE, (match) => {
      const digits = digitCount(match);
      return digits >= 7 && digits <= 15 ? PHONE_MASK : match;
    });
}
