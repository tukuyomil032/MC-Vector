import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/live/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@tauri-apps/plugin-http': fileURLToPath(
        new URL('./tests/live/tauri-plugin-http.live.ts', import.meta.url),
      ),
    },
  },
});
