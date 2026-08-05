import type { Conversation } from '../entities/conversation.ts';
import type { ConversationId } from '../value-objects/conversation-id.ts';

/**
 * Persistence for the Conversation aggregate.
 *
 * Returns null rather than throwing when a conversation is absent: whether that
 * is an error depends on the use case, and the port should not decide.
 */
export interface ConversationRepository {
  findById(id: ConversationId): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<void>;
}
