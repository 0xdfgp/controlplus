export interface AppConfig {
  readonly databaseUrl: string;
  readonly anthropicApiKey: string;
  readonly anthropicModel: string;
  readonly geminiApiKey: string;
  readonly geminiModel: string;
  readonly port: number;
  readonly logLevel: 'silent' | 'info';
}

const DEFAULT_DATABASE_URL =
  'postgres://controlplus:controlplus@localhost:5433/controlplus';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5';
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const DEFAULT_PORT = 3000;

/**
 * Every Anthropic key starts with this.
 *
 * Checking it catches the failure that produced ADR-032 in the first place: a
 * credential for one provider pasted into another provider's variable, which
 * authenticates as far as the first user request and no further. The check is
 * a prefix and not a network call, so a well-formed but revoked key still gets
 * through here and fails on first use — stated in the brief rather than hidden.
 */
const ANTHROPIC_KEY_PREFIX = 'sk-ant-';

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

  // Anthropic is the wired provider (ADR-032). Gemini stays configurable
  // because its adapter is still in the tree as the second implementation of
  // the port, but it is no longer required to start.
  const anthropicApiKey = (env.ANTHROPIC_API_KEY ?? '').trim();
  if (requireProviderKey && anthropicApiKey.length === 0) {
    problems.push(
      'ANTHROPIC_API_KEY is missing. The API will not start without a provider key.',
    );
  } else if (
    requireProviderKey &&
    !anthropicApiKey.startsWith(ANTHROPIC_KEY_PREFIX)
  ) {
    problems.push(
      `ANTHROPIC_API_KEY does not start with "${ANTHROPIC_KEY_PREFIX}", so it is not an Anthropic key. ` +
        'Check that a key for another provider has not been pasted into it.',
    );
  }

  const geminiApiKey = (env.GEMINI_API_KEY ?? '').trim();

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
    anthropicApiKey,
    anthropicModel: (env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL).trim(),
    geminiApiKey,
    geminiModel: (env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL).trim(),
    port,
    logLevel: logLevel as 'silent' | 'info',
  };
}
