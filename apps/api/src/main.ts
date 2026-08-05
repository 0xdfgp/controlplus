import { loadEnvFile } from 'node:process';

import { composeApplication } from './infrastructure/composition-root.ts';
import { loadConfig } from './infrastructure/config/load-config.ts';

// .env lives at the repo root, next to docker-compose.yml.
try {
  loadEnvFile(new URL('../../../.env', import.meta.url).pathname);
} catch {
  // No .env file is fine as long as the environment already carries the values;
  // loadConfig is the thing that decides whether we can start.
}

// Config is validated before anything is constructed. A missing provider key
// fails here, at startup, not on the first user request.
const config = loadConfig(process.env);

const application = composeApplication(config);

await application.server.listen({ port: config.port, host: '0.0.0.0' });
process.stdout.write(
  `Control+ API listening on http://localhost:${config.port}\n`,
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void application.close().then(() => process.exit(0));
  });
}
