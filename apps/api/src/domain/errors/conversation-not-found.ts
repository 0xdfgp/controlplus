import type { ConversationId } from '../value-objects/conversation-id.ts';

/** The conversation the caller named does not exist. */
export class ConversationNotFound extends Error {
  override readonly name = 'ConversationNotFound';

  constructor(readonly conversationId: ConversationId) {
    super(`Conversation ${conversationId.value} was not found.`);
  }
}
