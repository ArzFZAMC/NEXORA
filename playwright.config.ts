import { defineConfig, devices } from '@playwright/test';

// Tes e2e butuh `npm run build` + `npm run preview` (otomatis lewat webServer) dan env VITE_* terisi.
// Tes yang butuh akun hanya jalan bila E2E_EMAIL dan E2E_PASSWORD diset (akun uji milikmu sendiri).
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'npm run build && npm run preview -- --port 4173', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
