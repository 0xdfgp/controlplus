import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

let loaded = false;

/**
 * Reads the repository's .env into the process, without a dependency.
 *
 * The API runs under tsx with the same file, so the harness reading it the same
 * way keeps one place where keys live. Existing environment variables win, so a
 * key exported in the shell overrides the file rather than being silently
 * ignored.
 */
function loadDotEnv(): void {
  if (loaded) {
    return;
  }
  loaded = true;

  let contents: string;
  try {
    contents = readFileSync(path.join(REPO_ROOT, '.env'), 'utf8');
  } catch {
    return;
  }

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * A required key, or a plain message naming what is missing.
 *
 * Fails before any provider is called rather than three fixtures into a run,
 * which is the same reason ADR-029 validates the API's keys at boot.
 */
export function requireEnv(name: string): string {
  loadDotEnv();
  const value = (process.env[name] ?? '').trim();
  if (value.length === 0) {
    throw new Error(
      `${name} is missing. The evaluation needs all four provider keys in .env at the repository root.`,
    );
  }
  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  loadDotEnv();
  const value = (process.env[name] ?? '').trim();
  return value.length === 0 ? fallback : value;
}
