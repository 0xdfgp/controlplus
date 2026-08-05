import type { Message } from '../entities/message.ts';
import type { ConversationId } from '../value-objects/conversation-id.ts';
import type { MessageId } from '../value-objects/message-id.ts';

/**
 * A turn closed and produced an assistant Message (ADR-015).
 *
 * Raised once the Message exists and its invariants hold, before it is
 * persisted. Persistence is the use case's job, not the event's.
 */
export class MessageCompleted {
  readonly name = 'MessageCompleted' as const;

  private constructor(
    readonly conversationId: ConversationId,
    readonly messageId: MessageId,
    readonly occurredAt: Date,
  ) {}

  static from(message: Message, occurredAt: Date): MessageCompleted {
    if (!message.isFromAssistant()) {
      throw new TypeError(
        'MessageCompleted describes an assistant message closing a turn.',
      );
    }
    return new MessageCompleted(
      message.conversationId,
      message.id,
      occurredAt,
    );
  }
}
