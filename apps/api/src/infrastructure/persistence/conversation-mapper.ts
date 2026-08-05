import { Conversation } from '../../domain/entities/conversation.ts';
import { ConversationId } from '../../domain/value-objects/conversation-id.ts';
import type { ConversationRow, NewConversationRow } from './schema.ts';

/** Row to domain and back, written by hand (ADR-010). */
export function toConversationRow(
  conversation: Conversation,
): NewConversationRow {
  return {
    id: conversation.id.value,
    startedAt: conversation.startedAt,
  };
}

export function toConversation(row: ConversationRow): Conversation {
  return Conversation.start(ConversationId.fromString(row.id), row.startedAt);
}
