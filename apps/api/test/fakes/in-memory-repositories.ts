import type { Conversation } from '../../src/domain/entities/conversation.ts';
import type { Message } from '../../src/domain/entities/message.ts';
import type { ConversationRepository } from '../../src/domain/ports/conversation-repository.ts';
import type { MessageRepository } from '../../src/domain/ports/message-repository.ts';
import type { ConversationId } from '../../src/domain/value-objects/conversation-id.ts';

export class InMemoryConversationRepository implements ConversationRepository {
  readonly saved: Conversation[] = [];

  async findById(id: ConversationId): Promise<Conversation | null> {
    return this.saved.find((c) => c.id.equals(id)) ?? null;
  }

  async save(conversation: Conversation): Promise<void> {
    this.saved.push(conversation);
  }
}

export class InMemoryMessageRepository implements MessageRepository {
  readonly saved: Message[] = [];

  /**
   * Set to make the history read fail, which is the database being unreachable
   * at the moment a follow up needs its context.
   */
  historyFailure: Error | null = null;

  async save(message: Message): Promise<void> {
    this.saved.push(message);
  }

  async findByConversation(conversationId: ConversationId): Promise<Message[]> {
    return this.saved.filter((m) => m.conversationId.equals(conversationId));
  }

  /**
   * Insertion order is the order, which is what the seq column buys the real
   * adapter. Slicing from the end mirrors its ORDER BY seq DESC ... LIMIT.
   */
  async findRecentByConversation(
    conversationId: ConversationId,
    limit: number,
  ): Promise<Message[]> {
    if (this.historyFailure !== null) {
      throw this.historyFailure;
    }
    if (limit <= 0) {
      return [];
    }
    return this.saved
      .filter((m) => m.conversationId.equals(conversationId))
      .slice(-limit);
  }

  /**
   * Set to make the count fail, which is the database being unreachable at the
   * moment the conversation limit is being checked.
   */
  countFailure: Error | null = null;

  async countByConversation(conversationId: ConversationId): Promise<number> {
    if (this.countFailure !== null) {
      throw this.countFailure;
    }
    return this.saved.filter((m) => m.conversationId.equals(conversationId))
      .length;
  }

  assistantMessages(): Message[] {
    return this.saved.filter((m) => m.isFromAssistant());
  }

  userMessages(): Message[] {
    return this.saved.filter((m) => !m.isFromAssistant());
  }
}
