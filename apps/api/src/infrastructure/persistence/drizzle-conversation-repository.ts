import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import type { Conversation } from '../../domain/entities/conversation.ts';
import type { ConversationRepository } from '../../domain/ports/conversation-repository.ts';
import type { ConversationId } from '../../domain/value-objects/conversation-id.ts';
import { toConversation, toConversationRow } from './conversation-mapper.ts';
import { conversations } from './schema.ts';

export class DrizzleConversationRepository implements ConversationRepository {
  constructor(private readonly db: NodePgDatabase) {}

  async findById(id: ConversationId): Promise<Conversation | null> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id.value))
      .limit(1);

    const row = rows.at(0);
    return row === undefined ? null : toConversation(row);
  }

  async save(conversation: Conversation): Promise<void> {
    await this.db
      .insert(conversations)
      .values(toConversationRow(conversation))
      .onConflictDoNothing({ target: conversations.id });
  }
}
