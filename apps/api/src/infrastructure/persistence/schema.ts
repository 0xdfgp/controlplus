import {
  bigint,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * The database shape (ADR-010).
 *
 * Conversation and Message are separate aggregates, so they are separate tables
 * with no foreign key cascade dragging one into the other's lifecycle.
 *
 * Content parts, provenance and usage are jsonb: they are value objects owned by
 * the Message, always read and written whole, and never queried field by field.
 * Mapping them back to domain objects is done by hand in the mappers, not by a
 * generic deserialiser that would happily rebuild an invalid Message.
 */

export const conversations = pgTable('conversations', {
  id: text('id').primaryKey(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
});

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    conversationId: text('conversation_id').notNull(),
    author: text('author').notNull(),
    parts: jsonb('parts').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    // Null for a user message. A user message is not machine generated and has
    // no generation usage, and the schema says so rather than storing an empty
    // object that would read as "generated, but by nothing".
    provenance: jsonb('provenance'),
    usage: jsonb('usage'),
    state: text('state'),
    // Insert order, which for a Message is creation order: it is written once
    // when the turn closes and never updated. It exists because created_at is
    // millisecond precision and a question and its answer can share one, which
    // would leave "the last N messages, in order" (ADR-023) undefined.
    //
    // Persistence only. The mapper does not read it and the domain does not
    // know about it; the database assigns it.
    seq: bigint('seq', { mode: 'number' }).generatedByDefaultAsIdentity(),
  },
  (table) => [index('messages_conversation_id_idx').on(table.conversationId)],
);

export type ConversationRow = typeof conversations.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;
export type NewConversationRow = typeof conversations.$inferInsert;
export type NewMessageRow = typeof messages.$inferInsert;
