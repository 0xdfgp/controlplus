#!/usr/bin/env node
/**
 * PostToolUse guard rail (ADR-009). Written once in S1, never edited afterwards.
 *
 * Runs the boundary lint after any edit under apps/api/. Reports the violation
 * back to the agent so it is fixed in the same turn rather than at `npm test`.
 *
 * Exit 0 = clean. Exit 2 = violation, with the depcruise output on stderr.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BACKEND_PATH = /apps\/api\/src\//;

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => resolve(raw));
  });
}

const raw = await readStdin();

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const toolName = payload.tool_name ?? '';
if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) {
  process.exit(0);
}

const filePath = payload.tool_input?.file_path ?? '';
if (!BACKEND_PATH.test(filePath) || !filePath.endsWith('.ts')) {
  process.exit(0);
}

const projectDir = payload.cwd ?? process.cwd();
const runner = path.join(projectDir, 'scripts', 'lint-boundaries.mjs');

// Before `npm install` there is nothing to run. Stay quiet rather than failing.
if (!existsSync(runner) || !existsSync(path.join(projectDir, 'node_modules'))) {
  process.exit(0);
}

try {
  execFileSync(process.execPath, [runner, 'apps/api/src'], {
    cwd: projectDir,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  process.exit(0);
} catch (error) {
  const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  process.stderr.write(
    `Boundary lint failed after editing ${filePath}.\n\n${output}\n\n` +
      `The layer rules are closed decisions. Fix the import, not the config.\n`,
  );
  process.exit(2);
}
