import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

export interface Database {
  readonly db: NodePgDatabase;
  readonly pool: Pool;
  close(): Promise<void>;
}

export function openDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString });
  return {
    db: drizzle(pool),
    pool,
    close: () => pool.end(),
  };
}

const MIGRATIONS_DIRECTORY = fileURLToPath(
  new URL('../../../drizzle/', import.meta.url),
);

/**
 * Applies every migration in order, once.
 *
 * Deliberately small: one slice ships one migration, and a reviewer following
 * the README should be able to read what ran. Each file is applied inside a
 * transaction and recorded, so re-running is a no-op.
 */
export async function migrate(database: Database): Promise<string[]> {
  await database.pool.query(`
    CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "name" text PRIMARY KEY NOT NULL,
      "applied_at" timestamptz NOT NULL DEFAULT now()
    );
  `);

  const applied = await database.pool.query<{ name: string }>(
    'SELECT name FROM schema_migrations',
  );
  const seen = new Set(applied.rows.map((row) => row.name));

  const files = (await readdir(MIGRATIONS_DIRECTORY))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const ran: string[] = [];
  for (const file of files) {
    if (seen.has(file)) {
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIRECTORY, file), 'utf8');
    const client = await database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
        file,
      ]);
      await client.query('COMMIT');
      ran.push(file);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  return ran;
}
