/**
 * Test environment defaults.
 *
 * Config is validated at boot (a missing provider key fails at startup, not on
 * the first user request). The unit and application suites never reach a
 * provider, so they get a placeholder key. The persistence and e2e suites use
 * the real DATABASE_URL from docker-compose.
 *
 * A real GEMINI_API_KEY in the environment is left alone, so the live smoke
 * check can use it.
 */
process.env.NODE_ENV ??= 'test';
process.env.GEMINI_API_KEY ??= 'test-key-not-used-by-the-suite';
process.env.DATABASE_URL ??=
  'postgres://controlplus:controlplus@localhost:5433/controlplus';
process.env.LOG_LEVEL ??= 'silent';
