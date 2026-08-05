import type { Message } from '../entities/message.ts';
import type { ConversationId } from '../value-objects/conversation-id.ts';

/**
 * Persistence for the Message aggregate.
 *
 * There is only `save`, and it is called once per message, when the turn closes
 * and the Message is already complete or already stopped (ADR-013). There is
 * deliberately no update and no partial write: a half-written answer is not a
 * thing this system stores.
 */
export interface MessageRepository {
  save(message: Message): Promise<void>;
  findByConversation(conversationId: ConversationId): Promise<Message[]>;
  /**
   * The most recent `limit` messages of a conversation, returned oldest first.
   *
   * The bound belongs to the query rather than to the caller's slicing, so a
   * long conversation is never read into memory to have most of it discarded.
   * `limit` comes from CONTEXT_WINDOW_MESSAGES; the repository does not know
   * why that number is what it is.
   */
  findRecentByConversation(
    conversationId: ConversationId,
    limit: number,
  ): Promise<Message[]>;
}
