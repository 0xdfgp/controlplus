import { ConversationTurnLimitReached } from '../errors/conversation-turn-limit-reached.ts';

/**
 * The ceiling on one conversation, counted in messages (ADR-034).
 *
 * Forty messages is twenty turns. CONTEXT_WINDOW_MESSAGES is 10, so the request
 * sent to the provider stopped growing long before this — the cap is not there
 * to bound a request, it is there so that a single conversation cannot spend
 * without limit. Like the attachment limit it is a backstop rather than a budget
 * anyone is expected to reach: five turns is a long conversation in this
 * product, and someone who genuinely needs more starts another one.
 *
 * Counted in messages rather than turns because messages are what the repository
 * can count. A failed turn writes the question and no answer, so the two are not
 * a fixed ratio and converting between them would be arithmetic on an assumption.
 */
export const MAX_MESSAGES_PER_CONVERSATION = 40;

/**
 * Refuses a conversation that has already run its length, as a domain rule.
 *
 * Takes the count rather than the messages: the caller is asking whether one
 * more turn is allowed, and reading forty rows to answer that is the thing the
 * bound exists to avoid.
 *
 * Pure, so it is tested with nothing mocked.
 */
export function assertWithinTurnLimit(messageCount: number): void {
  if (messageCount >= MAX_MESSAGES_PER_CONVERSATION) {
    throw new ConversationTurnLimitReached(
      messageCount,
      MAX_MESSAGES_PER_CONVERSATION,
    );
  }
}
