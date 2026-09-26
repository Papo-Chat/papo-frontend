import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Only the E2E dir: the vitest unit tests in tests/*.test.ts must NOT be
  // picked up by Playwright (they use vitest's describe/it and $env imports).
  testDir: 'tests/e2e',
  webServer: {
    command: 'DEMO=1 npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'webkit',
      use: { browserName: 'webkit' },
    },
  ],
});