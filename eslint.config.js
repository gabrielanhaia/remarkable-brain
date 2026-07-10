import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `web/` is a separate Vite sub-project with its own TypeScript toolchain (`tsc -b`) and React
  // lint rules; the root config lints only the Node `src/` + `tests/`. Its build output lives in
  // `web/dist` (like the root `dist/`, never linted).
  { ignores: ['dist/', 'web/', 'node_modules/', 'coverage/'] },
  ...tseslint.configs.recommended,
  {
    // Test files legitimately use `any` for mocks and partial fixtures.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
