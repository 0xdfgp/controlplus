import type { Message, TerminalState } from '../entities/message.ts';
import type { ConversationId } from '../value-objects/conversation-id.ts';
import type { MessageId } from '../value-objects/message-id.ts';

/**
 * A turn closed and produced an assistant Message (ADR-015).
 *
 * Raised once the Message exists and its invariants hold, before it is
 * persisted. Persistence is the use case's job, not the event's.
 *
 * It carries the terminal state because ADR-015 rejected a separate
 * MessageStopped on exactly that ground: stopped is a state this event already
 * describes. S1 had one terminal state and left the field off, which made the
 * rejection true by accident. S2 introduces the second, so it is on.
 */
export class MessageCompleted {
  readonly name = 'MessageCompleted' as const;

  private constructor(
    readonly conversationId: ConversationId,
    readonly messageId: MessageId,
    readonly state: TerminalState,
    readonly occurredAt: Date,
  ) {}

  static from(message: Message, occurredAt: Date): MessageCompleted {
    if (!message.isFromAssistant()) {
      throw new TypeError(
        'MessageCompleted describes an assistant message closing a turn.',
      );
    }
    if (message.state === null) {
      throw new TypeError(
        'MessageCompleted requires a terminal state on the message.',
      );
    }
    return new MessageCompleted(
      message.conversationId,
      message.id,
      message.state,
      occurredAt,
    );
  }
}
