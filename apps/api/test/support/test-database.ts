import { migrate, openDatabase } from '../../src/infrastructure/persistence/database.ts';
import type { Database } from '../../src/infrastructure/persistence/database.ts';

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://controlplus:controlplus@localhost:5433/controlplus';

/**
 * Opens the real Postgres from docker-compose and makes sure it is migrated.
 *
 * Not a fake and not skipped when absent: `docker compose up -d` is a documented
 * prerequisite of `npm test`. A persistence suite that quietly passes without a
 * database proves nothing about the mapping it exists to check.
 */
export async function openTestDatabase(): Promise<Database> {
  const database = openDatabase(TEST_DATABASE_URL);
  try {
    await migrate(database);
  } catch (error) {
    await database.close();
    throw new Error(
      `Could not reach Postgres at ${TEST_DATABASE_URL}. Run "npm run db:up" first.`,
      { cause: error },
    );
  }
  return database;
}

/** Removes only what a test created, so suites can run side by side. */
export async function deleteConversation(
  database: Database,
  conversationId: string,
): Promise<void> {
  await database.pool.query('DELETE FROM messages WHERE conversation_id = $1', [
    conversationId,
  ]);
  await database.pool.query('DELETE FROM conversations WHERE id = $1', [
    conversationId,
  ]);
}
