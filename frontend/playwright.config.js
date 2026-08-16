import { defineConfig } from '@playwright/test';

/**
 * Boot/render gate: serves the production build and checks the app reaches
 * an interactive state without uncaught errors. This is the gate that would
 * have caught the SprintPassPanel TDZ crash (build + unit tests stayed green).
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
