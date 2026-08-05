import type { ConversationId } from '../value-objects/conversation-id.ts';

/**
 * A conversation. Deliberately thin: identity and timestamps (ADR-013).
 *
 * Conversation and Message are separate aggregates. A Conversation does not
 * hold its messages, so opening one never drags a transcript into memory and
 * closing a turn never rewrites the conversation row.
 *
 * History across turns and context assembly are S3.
 */
export class Conversation {
  private constructor(
    readonly id: ConversationId,
    readonly startedAt: Date,
  ) {}

  static start(id: ConversationId, startedAt: Date): Conversation {
    return new Conversation(id, startedAt);
  }

  equals(other: Conversation): boolean {
    return this.id.equals(other.id);
  }
}
