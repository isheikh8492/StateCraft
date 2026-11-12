import { rmSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const PORT = 4319;
const DATA_DIR = 'data/e2e';

// Start every run from an empty campaign. Workers load this file too, so only the main
// process clears the folder.
if (process.env.TEST_WORKER_INDEX === undefined) {
  rmSync(DATA_DIR, { recursive: true, force: true });
}

export default defineConfig({
  testDir: 'e2e',
  // The tests share one server and one campaign file, so they run in order.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start -w @statecraft/server',
    url: `http://127.0.0.1:${PORT}/api/session`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      STATECRAFT_PORT: String(PORT),
      STATECRAFT_DATA: DATA_DIR,
      STATECRAFT_STANDIN_PORT: String(PORT + 1),
    },
  },
});
