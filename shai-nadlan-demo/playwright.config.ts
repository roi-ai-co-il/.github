import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    locale: 'he-IL',
    // The sandbox ships one Chromium build; pin it so a newer @playwright/test
    // does not try to download a browser revision it can't fetch here.
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
      // Outbound HTTPS in this environment goes through the agent proxy; without
      // it the browser cannot reach Supabase and every login looks broken.
      proxy: process.env.HTTPS_PROXY
        ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }
        : undefined,
      args: ['--ignore-certificate-errors', '--no-sandbox'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // iPhone-sized viewport on Chromium: the sandbox ships no WebKit build, and
    // devices['iPhone 13'] would launch one.
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
});
