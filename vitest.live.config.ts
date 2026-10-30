import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
  resolve: {
    alias: {},
  },
});
