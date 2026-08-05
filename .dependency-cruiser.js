/**
 * Boundary guard rail for Control+ (ADR-009).
 *
 * Written once in S1 and never edited afterwards, including by an agent that
 * finds it inconvenient. If a rule below blocks you, the import is wrong --
 * the rule is not.
 *
 * Every rule is severity 'error' and every comment names BOTH layers, so a
 * failure tells you where the import came from and where it went.
 */

/**
 * Packages the domain layer is permitted to import.
 *
 * Deliberately empty. The domain is pure TypeScript: no SDK, no fetch, no
 * Date.now(), no crypto.randomUUID(). Time and identity arrive through the
 * Clock and IdGenerator ports. Adding an entry here is a design decision, not
 * a convenience.
 *
 * @type {string[]}
 */
const DOMAIN_NPM_ALLOWLIST = [];

const allowlistPattern =
  DOMAIN_NPM_ALLOWLIST.length > 0
    ? `^(${DOMAIN_NPM_ALLOWLIST.join('|')})(/|$)`
    : undefined;

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-not-to-application',
      severity: 'error',
      comment:
        'Layer violation: apps/api/src/domain imported from apps/api/src/application. ' +
        'The domain layer imports nothing from the application layer. ' +
        'Invert the dependency: declare a port under domain/ports and let application depend on domain.',
      from: { path: '^apps/api/src/domain/' },
      to: { path: '^apps/api/src/application/' },
    },
    {
      name: 'domain-not-to-infrastructure',
      severity: 'error',
      comment:
        'Layer violation: apps/api/src/domain imported from apps/api/src/infrastructure. ' +
        'The domain layer imports nothing from the infrastructure layer. ' +
        'Declare a port under domain/ports and implement it in infrastructure; ' +
        'the composition root does the wiring.',
      from: { path: '^apps/api/src/domain/' },
      to: { path: '^apps/api/src/infrastructure/' },
    },
    {
      name: 'domain-not-to-external',
      severity: 'error',
      comment:
        'Layer violation: apps/api/src/domain imported from an external package outside the domain allowlist. ' +
        'The domain layer depends on no SDK, no runtime and no Node core module. ' +
        'Put the dependency behind a port in domain/ports and implement it in infrastructure.',
      from: { path: '^apps/api/src/domain/' },
      to: {
        dependencyTypes: [
          'npm',
          'npm-dev',
          'npm-optional',
          'npm-peer',
          'npm-bundled',
          'core',
        ],
        ...(allowlistPattern ? { pathNot: allowlistPattern } : {}),
      },
    },
    {
      name: 'application-not-to-infrastructure',
      severity: 'error',
      comment:
        'Layer violation: apps/api/src/application imported from apps/api/src/infrastructure. ' +
        'The application layer imports the domain layer only. ' +
        'Depend on the port, not on the adapter that implements it.',
      from: { path: '^apps/api/src/application/' },
      to: { path: '^apps/api/src/infrastructure/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular dependency between modules. Break the cycle by moving the shared type ' +
        'to the layer both sides already depend on.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '\\.test\\.ts$|/__fixtures__/' },
    tsConfig: { fileName: 'apps/api/tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      extensions: ['.ts', '.js'],
    },
  },
};
