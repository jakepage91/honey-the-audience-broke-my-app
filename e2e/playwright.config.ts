import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  timeout: 30_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://honey-we-have-a-problem.freeddns.org',
    extraHTTPHeaders: {
      // mirrord steal-mode filter: only requests carrying this header
      // are routed to the local service. See .mirrord/mirrord-e2e.json.
      baggage: 'mirrord=e2e',
    },
  },
});
