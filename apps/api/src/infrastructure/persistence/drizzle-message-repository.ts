import { asc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { Message } from '../../domain/entities/message.ts';
import type { MessageRepository } from '../../domain/ports/message-repository.ts';
import type { ConversationId } from '../../domain/value-objects/conversation-id.ts';
import { toMessage, toMessageRow } from './message-mapper.ts';
import { messages } from './schema.ts';

/**
 * A plain insert, no upsert.
 *
 * A Message is written once when the turn closes (ADR-013). If the same id is
 * saved twice that is a bug in the caller, and the primary key should say so
 * rather than quietly overwriting an answer somebody already read.
 */
export class DrizzleMessageRepository implements MessageRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async save(message: Message): Promise<void> {
    await this.db.insert(messages).values(toMessageRow(message));
  }

  async findByConversation(conversationId: ConversationId): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId.value))
      .orderBy(asc(messages.createdAt));

    return rows.map(toMessage);
  }
}
