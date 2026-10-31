import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', '.aws-sam/', 'dist/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Plain Node scripts, run without a build step.
  { files: ['**/*.mjs'], languageOptions: { globals: { process: 'readonly', console: 'readonly' } } },
);
