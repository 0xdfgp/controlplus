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
}
