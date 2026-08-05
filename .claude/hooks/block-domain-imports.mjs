#!/usr/bin/env node
/**
 * PreToolUse guard rail (ADR-009). Written once in S1, never edited afterwards.
 *
 * Blocks a write or edit that would introduce a forbidden import into
 * apps/api/src/domain/**. This is the fast feedback loop; .dependency-cruiser.js
 * is the authority and runs in `npm test`.
 *
 * Exit 0 = allow. Exit 2 = block, with the reason on stderr.
 */

const DOMAIN_PATH = /apps\/api\/src\/domain\//;

const FORBIDDEN = [
  {
    pattern: /from\s+['"](?:[^'"]*\/)?application\//,
    reason:
      'domain imported from application. The domain layer imports nothing from the application layer.',
  },
  {
    pattern: /from\s+['"](?:[^'"]*\/)?infrastructure\//,
    reason:
      'domain imported from infrastructure. The domain layer imports nothing from the infrastructure layer. ' +
      'Declare a port under domain/ports instead.',
  },
  {
    pattern: /from\s+['"](?!\.)[^'"]+['"]/,
    reason:
      'domain imported an external package. The domain layer is pure TypeScript: ' +
      'no SDK, no runtime, no Node core module. Put it behind a port.',
  },
  {
    pattern: /\bDate\.now\s*\(/,
    reason: 'Date.now() under domain/. Time arrives through the Clock port.',
  },
  {
    pattern: /\bnew\s+Date\s*\(\s*\)/,
    reason: 'new Date() under domain/. Time arrives through the Clock port.',
  },
  {
    pattern: /\bcrypto\.randomUUID\s*\(/,
    reason:
      'crypto.randomUUID() under domain/. Identity arrives through the IdGenerator port.',
  },
  {
    pattern: /\bMath\.random\s*\(/,
    reason: 'Math.random() under domain/. Randomness arrives through a port.',
  },
];

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
  process.exit(0); // Never block on a malformed payload.
}

const toolName = payload.tool_name ?? '';
if (!['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(toolName)) {
  process.exit(0);
}

const input = payload.tool_input ?? {};
const filePath = input.file_path ?? '';
if (!DOMAIN_PATH.test(filePath) || !filePath.endsWith('.ts')) {
  process.exit(0);
}
if (filePath.endsWith('.test.ts')) {
  process.exit(0);
}

const candidates = [
  input.content,
  input.new_string,
  ...(Array.isArray(input.edits) ? input.edits.map((e) => e.new_string) : []),
].filter((v) => typeof v === 'string');

const text = candidates.join('\n');
if (text.length === 0) {
  process.exit(0);
}

/**
 * Comments describe the rules; they do not break them. A doc comment that says
 * "time arrives through the Clock port, not Date.now()" is the rule being
 * documented, so match against code only.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const hits = FORBIDDEN.filter(({ pattern }) => pattern.test(stripComments(text)));

if (hits.length > 0) {
  const lines = hits.map((h) => `  - ${h.reason}`).join('\n');
  process.stderr.write(
    `Blocked by the Control+ boundary guard rail (.dependency-cruiser.js is the authority).\n` +
      `File: ${filePath}\n${lines}\n` +
      `These rules are closed decisions. Do not work around them; change the design.\n`,
  );
  process.exit(2);
}

process.exit(0);
