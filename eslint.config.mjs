// Guard rail for Control+ (ADR-009). Written once in S1, never edited afterwards.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Globals available in Node scripts, tooling and the API. */
const nodeGlobals = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  fetch: 'readonly',
  Response: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

/** Globals available in the React Native runtime. */
const reactNativeGlobals = {
  ...nodeGlobals,
  XMLHttpRequest: 'readonly',
  __DEV__: 'readonly',
};

/** Globals available in a CommonJS module. */
const commonJsGlobals = {
  ...nodeGlobals,
  module: 'writable',
  require: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  exports: 'writable',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/drizzle/**',
      '**/ios/**',
      '**/android/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: reactNativeGlobals,
    },
  },

  // Source: one class per file, 200 line cap.
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mjs'],
    rules: {
      'max-classes-per-file': ['error', 1],
      'max-lines': [
        'error',
        { max: 200, skipBlankLines: false, skipComments: false },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      // A binding named with a leading underscore is deliberately discarded,
      // which is how a test says "this field must be absent".
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // The domain layer carries the invariants. `any` is an error here, not a warning.
  {
    files: ['apps/api/src/domain/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Tests are allowed to be long: fixtures and table-driven cases run past 200 lines.
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/test/**', '**/__fixtures__/**'],
    rules: {
      'max-lines': 'off',
      'max-classes-per-file': 'off',
    },
  },

  // Build and tooling configuration that must stay CommonJS.
  {
    files: ['**/*.cjs', '.dependency-cruiser.js', 'apps/mobile/*.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: commonJsGlobals,
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'max-lines': 'off',
    },
  },
);
