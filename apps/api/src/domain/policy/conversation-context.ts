import { isImagePart } from '../content/content-part.ts';
import type { Message } from '../entities/message.ts';
import type { GenerationTurn } from '../ports/text-generation-port.ts';

/**
 * How many prior messages travel with a turn (ADR-023).
 *
 * A count of messages, not of tokens. Counting tokens before sending needs a
 * provider tokenizer, which would either put a vendor dependency inside the
 * domain or move the windowing decision into an adapter, and business rules do
 * not live in adapters. A message count is provider agnostic and testable with
 * nothing mocked.
 *
 * Ten is five turns. Honest limit, and the write up should say it rather than
 * imply the request is bounded in tokens: this bounds the number of messages,
 * not their size, so a conversation of long messages still produces a large
 * request.
 */
export const CONTEXT_WINDOW_MESSAGES = 10;

/**
 * What a partial answer is called when it goes back to the model.
 *
 * A stopped message is a real part of the conversation and is included as what
 * it is: an answer the user cut short. Without this the model reads its own
 * half sentence as a finished thought and follows on from it, which is how a
 * follow up ends up building on advice that was never given.
 *
 * The wording is product policy and lives in the domain, versioned with the
 * rest of it, for the same reason the scam check does (ADR-021) and the
 * redaction rules do (ADR-031). An adapter choosing these words would be a
 * business rule inside an adapter.
 */
export const STOPPED_ANSWER_NOTICE =
  '[This answer was stopped by the person before it was finished.]';

/**
 * What an earlier photo is called when the conversation goes back to the model.
 *
 * The bytes are not stored (ADR-024), so a follow up cannot resend them however
 * it is written. What that leaves is a choice between two silences: drop the
 * turn, or say a photo was there. Dropping it is worse in both directions — an
 * image-only message renders to no text at all and would disappear from the
 * window entirely, and a follow up like "what should I do about it?" would then
 * read as a question about nothing.
 *
 * The wording says the photo is gone rather than implying the model can still
 * see it, because a model told there is an image it cannot find will describe
 * one anyway. Product policy, versioned here with the rest of it, for the same
 * reason as the notice above.
 */
export const PHOTO_IN_HISTORY_NOTICE =
  '[The person sent a photo with this question. The photo is no longer available to you.]';

/**
 * Renders stored messages into the turns the provider is told about.
 *
 * Pure, and the only place a Message becomes prompt content. Three rules beyond
 * the mapping itself:
 *
 *   - A stopped assistant message carries the notice above, so an unfinished
 *     answer is never presented as a finished one.
 *   - A message carrying an ImagePart carries the photo notice, because the
 *     image itself cannot travel a second time.
 *   - A message that renders to nothing at all is dropped. A turn stopped
 *     before the first delta has nothing to say, and an empty turn is a payload
 *     a provider is entitled to reject.
 */
export function toGenerationTurns(
  messages: readonly Message[],
): GenerationTurn[] {
  const turns: GenerationTurn[] = [];

  for (const message of messages) {
    const text = renderText(message);
    if (text.length === 0) {
      continue;
    }
    turns.push({ author: message.author, text });
  }

  return turns;
}

function renderText(message: Message): string {
  const lines: string[] = [];

  if (message.parts.some(isImagePart)) {
    lines.push(PHOTO_IN_HISTORY_NOTICE);
  }

  const text = message.text();
  if (text.length > 0) {
    lines.push(text);
  }

  if (
    lines.length > 0 &&
    message.isFromAssistant() &&
    message.state === 'stopped'
  ) {
    lines.push(STOPPED_ANSWER_NOTICE);
  }

  return lines.join('\n\n');
}
