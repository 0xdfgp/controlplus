#!/usr/bin/env node
/**
 * Runs the layer boundary rules from .dependency-cruiser.js.
 *
 * This drives dependency-cruiser's API rather than its CLI. The CLI refuses to
 * start on odd-numbered Node releases (it accepts ^22||^24||>=26, this machine
 * runs 25). The rules themselves are unchanged: .dependency-cruiser.js is still
 * the single authority and is not edited by this script.
 *
 * Exit 0 = clean. Exit 1 = at least one error-severity violation, with each one
 * naming the rule, the source layer and the imported layer (AC7).
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { cruise } from 'dependency-cruiser';
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const configPath = path.join(projectRoot, '.dependency-cruiser.js');
const { forbidden = [], options = {} } = require(configPath);

const entryPoints = process.argv.slice(2);
if (entryPoints.length === 0) {
  entryPoints.push('apps/api/src');
}

const transpileOptions = {};
if (options.tsConfig?.fileName) {
  transpileOptions.tsConfig = extractTSConfig(
    path.join(projectRoot, options.tsConfig.fileName),
  );
}

const { output } = await cruise(
  entryPoints,
  { ...options, ruleSet: { forbidden }, validate: true },
  undefined,
  transpileOptions,
);

if (typeof output === 'string') {
  process.stderr.write(`${output}\n`);
  process.exit(1);
}

const violations = (output.summary?.violations ?? []).filter(
  (violation) => violation.rule.severity === 'error',
);

if (violations.length === 0) {
  const { totalCruised } = output.summary;
  process.stdout.write(
    `Boundary lint clean: ${totalCruised} modules cruised, no layer violations.\n`,
  );
  process.exit(0);
}

const ruleComment = new Map(forbidden.map((rule) => [rule.name, rule.comment]));

process.stderr.write(
  `\nBoundary lint failed: ${violations.length} layer violation${
    violations.length === 1 ? '' : 's'
  }.\n\n`,
);

for (const violation of violations) {
  process.stderr.write(`  error ${violation.rule.name}\n`);
  process.stderr.write(`    ${violation.from}\n`);
  process.stderr.write(`      -> ${violation.to}\n`);
  const comment = ruleComment.get(violation.rule.name);
  if (comment) {
    process.stderr.write(`    ${comment}\n`);
  }
  process.stderr.write('\n');
}

process.stderr.write(
  'The layer rules are closed decisions (ADR-009). Fix the import, not the config.\n\n',
);
process.exit(1);
