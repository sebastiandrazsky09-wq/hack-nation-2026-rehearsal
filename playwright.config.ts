import { defineConfig, devices } from '@playwright/test';
// scripts/ops.py gives each worker its own E2E_PORT; the lead checkout and merge gate use the default.
const port = Number(process.env.E2E_PORT) || 3100;
export default defineConfig({
  testDir: './tests/e2e', workers: 1, retries: 0,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run start -- --port ${port}`, url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false, timeout: 60000,
    env: { OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' }
  }
});
