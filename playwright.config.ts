import { defineConfig, devices } from "@playwright/test";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file: rely on the environment (CI).
}

const PORT = 3100;
const baseURL = `http://127.0.0.1:${PORT}`;

const databaseUrl = new URL(process.env.DATABASE_URL ?? "postgres://framework:framework@127.0.0.1:5432/framework_dev");
databaseUrl.pathname = `${databaseUrl.pathname}_e2e`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 3,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 7_500 },
  use: {
    baseURL,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    // The suite runs against a production build, like a real deployment.
    command: `npm run build && npx next start --hostname 127.0.0.1 --port ${PORT}`,
    url: `${baseURL}/sign-in`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: databaseUrl.toString(),
      APP_URL: baseURL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-e2e-only-secret-e2e-only",
      // Many accounts are created from one address during the run.
      AUTH_RATE_LIMIT: "false",
    },
  },
});
