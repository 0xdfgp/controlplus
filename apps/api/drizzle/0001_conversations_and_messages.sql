-- S1: the spine. Conversations and messages, one migration for the slice (ADR-010).
--
-- Content parts, provenance and usage are jsonb: value objects owned by the
-- Message, always read and written whole.

CREATE TABLE IF NOT EXISTS "conversations" (
  "id" text PRIMARY KEY NOT NULL,
  "started_at" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" text PRIMARY KEY NOT NULL,
  "conversation_id" text NOT NULL,
  "author" text NOT NULL,
  "parts" jsonb NOT NULL,
  "created_at" timestamptz NOT NULL,
  "provenance" jsonb,
  "usage" jsonb,
  "state" text,

  -- An assistant message is machine generated and must say by what, in what
  -- terminal state, and at what token cost. A user message must claim none of
  -- those. The invariant lives in the domain; this is the database refusing to
  -- hold a row the domain could not have produced.
  CONSTRAINT "messages_author_is_known"
    CHECK ("author" IN ('user', 'assistant')),
  CONSTRAINT "messages_assistant_is_attributed"
    CHECK (
      ("author" = 'assistant'
        AND "provenance" IS NOT NULL
        AND "usage" IS NOT NULL
        AND "state" IN ('completed', 'stopped'))
      OR
      ("author" = 'user'
        AND "provenance" IS NULL
        AND "usage" IS NULL
        AND "state" IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx"
  ON "messages" ("conversation_id");
