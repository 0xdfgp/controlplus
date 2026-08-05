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

  async save(message: Message): Promise<void> {
    this.saved.push(message);
  }

  async findByConversation(conversationId: ConversationId): Promise<Message[]> {
    return this.saved.filter((m) => m.conversationId.equals(conversationId));
  }

  assistantMessages(): Message[] {
    return this.saved.filter((m) => m.isFromAssistant());
  }

  userMessages(): Message[] {
    return this.saved.filter((m) => !m.isFromAssistant());
  }
}
