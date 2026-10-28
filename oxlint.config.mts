import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['typescript', 'unicorn', 'oxc'],
  categories: {
    correctness: 'error',
  },
  rules: {},
  ignorePatterns: [
    'src/routeTree.gen.ts',
    '.output',
    '.tanstack',
    'dist',
    'coverage',
    'playwright-report',
    'test-results',
    'storage',
    'data',
  ],
  env: {
    builtin: true,
  },
})
