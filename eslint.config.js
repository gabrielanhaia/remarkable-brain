import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'coverage/'] },
  ...tseslint.configs.recommended,
  {
    // Test files legitimately use `any` for mocks and partial fixtures.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  }
);
