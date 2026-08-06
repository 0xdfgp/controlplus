import { asc, count, desc, eq } from 'drizzle-orm';
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
      .orderBy(asc(messages.seq));

    return rows.map(toMessage);
  }

  /**
   * The most recent `limit` messages, oldest first.
   *
   * Newest-first with a LIMIT and then reversed, rather than reading the
   * conversation and slicing: the database returns N rows however long the
   * conversation is, which is what stops the request growing without bound.
   *
   * Ordered by seq, not by created_at. Two messages written in the same
   * millisecond — a question and its answer, routinely — have no order under a
   * timestamp, and "in order" is the whole point of the query.
   */
  async findRecentByConversation(
    conversationId: ConversationId,
    limit: number,
  ): Promise<Message[]> {
    if (limit <= 0) {
      return [];
    }

    const rows = await this.db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId.value))
      .orderBy(desc(messages.seq))
      .limit(limit);

    return rows.reverse().map(toMessage);
  }

  /**
   * COUNT, not a length. Reading forty rows to find out there are forty is the
   * shape this method exists to avoid (ADR-034).
   *
   * Drizzle returns count as a string on some drivers, since Postgres bigint
   * does not fit a JS number. Parsed rather than cast: a silent NaN here reads
   * as an empty conversation and would turn the limit off.
   */
  async countByConversation(conversationId: ConversationId): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(messages)
      .where(eq(messages.conversationId, conversationId.value));

    return Number(row?.value ?? 0);
  }
}
