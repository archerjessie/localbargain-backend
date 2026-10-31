import { defineConfig } from 'vitest/config';

// Tests against a running `sam local start-api` (see README, Local mode). Not run in CI: they need sam local and Docker.
export default defineConfig({
  test: {
    include: ['test/sam-local/**/*.test.ts'],
    // A cold arm64 Lambda container under emulation can take about 30 seconds.
    testTimeout: 120_000,
    fileParallelism: false,
  },
});
