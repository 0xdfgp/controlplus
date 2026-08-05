import { loadConfig } from '../config/load-config.ts';
import { migrate, openDatabase } from './database.ts';

/** `npm run db:migrate`. Idempotent: running it twice applies nothing twice. */
const config = loadConfig(process.env, { requireProviderKey: false });
const database = openDatabase(config.databaseUrl);

try {
  const ran = await migrate(database);
  if (ran.length === 0) {
    process.stdout.write('Database is already up to date.\n');
  } else {
    process.stdout.write(`Applied ${ran.length} migration(s):\n`);
    for (const name of ran) {
      process.stdout.write(`  ${name}\n`);
    }
  }
} finally {
  await database.close();
}
