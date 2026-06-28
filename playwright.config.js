import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 7_000
  },
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5173',
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required'
      ]
    },
    permissions: ['camera', 'microphone'],
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://localhost:3000/health',
      reuseExistingServer: false,
      timeout: 15_000
    },
    {
      command: 'npm run dev:client',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 15_000
    }
  ]
});
