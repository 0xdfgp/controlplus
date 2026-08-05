import type { ConversationId } from '../value-objects/conversation-id.ts';
import type { MessageId } from '../value-objects/message-id.ts';

/**
 * The source of identity for the domain.
 *
 * The domain never generates a UUID itself. Identity arrives here, so a test
 * gets predictable ids and the persistence layer is not the thing deciding what
 * an aggregate is called.
 */
export interface IdGenerator {
  nextConversationId(): ConversationId;
  nextMessageId(): MessageId;
}
