import { defineConfig, devices } from '@playwright/test';

// Captures reference screenshots of every per-server React UI state for the SwiftUI port.
// Shares the Vite + mocked Tauri runtime of playwright.config.ts; only the output and the viewport differ.
const viewport = { width: 1440, height: 900 };

export default defineConfig({
  testDir: './tests/ui-reference',
  outputDir: './spec/idea/native-swiftui-edition/ui-reference/.playwright-output',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    locale: 'en-US',
    screenshot: 'off',
    trace: 'off',
    video: 'off',
    launchOptions: {
      args: ['--force-prefers-reduced-motion'],
    },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport,
        deviceScaleFactor: 2,
        colorScheme: 'dark',
        reducedMotion: 'reduce',
        locale: 'en-US',
      },
    },
  ],

  webServer: {
    command: 'bun run dev:plain',
    env: {
      HOST: '127.0.0.1',
      VITE_PLAYWRIGHT: 'true',
    },
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
