import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', workers: 1, retries: 0,
  use: { baseURL: 'http://127.0.0.1:3100', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start -- --port 3100', url: 'http://127.0.0.1:3100/api/health',
    reuseExistingServer: false, timeout: 60000,
    env: { APP_MODE: 'replay', OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '' }
  }
});
