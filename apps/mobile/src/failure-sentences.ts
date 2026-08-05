import type { StreamErrorClass } from '@control-plus/contracts';

/**
 * The one sentence shown when a turn fails.
 *
 * Plain language, no error code, no provider name. Someone who has just been
 * frightened by a scam message should not then be handed a stack trace.
 */
export const FAILURE_SENTENCE =
  'Something went wrong on our side. Your question was not answered. Please try again in a moment.';

/**
 * The sentence for a photo the server refused as too big.
 *
 * The device checks the same limit before sending, so in practice nobody reads
 * this. It exists because the error class exists: if a photo ever gets past the
 * device check, the person is told what happened rather than told nothing.
 */
export const PHOTO_TOO_BIG_SENTENCE =
  'That photo was too big to send. Please try taking it again, or choose a smaller picture.';

/**
 * What the person reads for a given domain error class.
 *
 * The class is all the stream carries (ADR-016) and the words are chosen here,
 * so nothing a provider or a database wrote can reach the screen. An unknown
 * class falls back to the general sentence rather than naming itself.
 */
export function sentenceFor(errorClass: StreamErrorClass): string {
  return errorClass === 'AttachmentTooLarge'
    ? PHOTO_TOO_BIG_SENTENCE
    : FAILURE_SENTENCE;
}
