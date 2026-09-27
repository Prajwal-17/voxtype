import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    viewport: { width: 1100, height: 800 },
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
        (existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined),
      args: ['--no-sandbox'],
    },
  },
  webServer: { command: 'pnpm dev', url: 'http://127.0.0.1:1420', reuseExistingServer: true },
});
