/**
 * The conversation has run as long as one is allowed to run (ADR-034).
 *
 * A typed domain error rather than a check in the HTTP layer, for the same
 * reason AttachmentTooLarge is one: how much a single conversation may spend is
 * a product rule, not a framework concern.
 *
 * The numbers are carried for the log line and never reach the user. What they
 * read is one plain sentence asking them to start a new conversation — no
 * count, no limit, and nothing that reads as having been told off.
 *
 * Honest about what it is: this bounds a conversation, not a caller. The
 * endpoint has no authentication and the conversation id comes from the client,
 * so anything that cycles ids never meets this at all (ADR-034).
 */
export class ConversationTurnLimitReached extends Error {
  override readonly name = 'ConversationTurnLimitReached';

  constructor(
    readonly messageCount: number,
    readonly limitMessages: number,
  ) {
    super(
      `The conversation holds ${messageCount} messages, at or over the ${limitMessages} message limit.`,
    );
  }
}
