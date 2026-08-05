export interface AppConfig {
  readonly databaseUrl: string;
  readonly geminiApiKey: string;
  readonly geminiModel: string;
  readonly port: number;
  readonly logLevel: 'silent' | 'info';
}

const DEFAULT_DATABASE_URL =
  'postgres://controlplus:controlplus@localhost:5433/controlplus';
const DEFAULT_MODEL = 'gemini-3.5-flash';
const DEFAULT_PORT = 3000;

export class ConfigurationError extends Error {
  override readonly name = 'ConfigurationError';
}

/**
 * Reads and validates configuration at boot.
 *
 * A missing provider API key fails at startup, not on the first user request.
 * The person this app is for should never be the one who discovers that the
 * server was misconfigured.
 *
 * `requireProviderKey: false` is for the migration entry point, which talks to
 * the database and never to a provider.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv,
  options: { readonly requireProviderKey?: boolean } = {},
): AppConfig {
  const requireProviderKey = options.requireProviderKey ?? true;
  const problems: string[] = [];

  const geminiApiKey = (env.GEMINI_API_KEY ?? '').trim();
  if (requireProviderKey && geminiApiKey.length === 0) {
    problems.push(
      'GEMINI_API_KEY is missing. The API will not start without a provider key.',
    );
  }

  const databaseUrl = (env.DATABASE_URL ?? DEFAULT_DATABASE_URL).trim();
  if (databaseUrl.length === 0) {
    problems.push('DATABASE_URL is set but empty.');
  }

  const port = Number(env.PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    problems.push(`PORT must be a valid port number, received "${env.PORT}".`);
  }

  const logLevel = (env.LOG_LEVEL ?? 'info').trim();
  if (logLevel !== 'silent' && logLevel !== 'info') {
    problems.push(`LOG_LEVEL must be "silent" or "info", received "${logLevel}".`);
  }

  if (problems.length > 0) {
    throw new ConfigurationError(
      `Configuration is not usable:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }

  return {
    databaseUrl,
    geminiApiKey,
    geminiModel: (env.GEMINI_MODEL ?? DEFAULT_MODEL).trim(),
    port,
    logLevel: logLevel as 'silent' | 'info',
  };
}
