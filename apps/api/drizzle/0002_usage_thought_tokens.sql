-- ADR-020: Usage carries thinking tokens, not only input and output.
--
-- Gemini bills thinking outside input and output. A live turn reported 22
-- input, 20 output and 388 thought against a total of 430, so a stored usage
-- of input and output alone understates the spend by roughly ten times.
--
-- There is no DDL here on purpose. The `usage` column is untyped jsonb, so the
-- shape lives in the mapper rather than in the schema and drizzle-kit would
-- generate nothing. What is needed is a backfill: rows written by S1 read back
-- with thoughtTokens zero rather than undefined.
--
-- Zero is the honest value. These turns did spend thinking tokens; we simply
-- did not record them, and inventing a number afterwards would be worse than
-- recording none.

UPDATE "messages"
SET "usage" = "usage" || '{"thoughtTokens": 0}'::jsonb
WHERE "author" = 'assistant'
  AND "usage" IS NOT NULL
  AND NOT ("usage" ? 'thoughtTokens');
