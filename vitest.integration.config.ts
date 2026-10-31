import { defineConfig } from 'vitest/config';

// Integration tests call DynamoDB Local and MinIO from `docker compose up -d --wait` directly. They do not need sam local.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.test.ts'],
    env: {
      DYNAMODB_ENDPOINT: 'http://localhost:8000',
      S3_ENDPOINT: 'http://localhost:9000',
      S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
      S3_ACCESS_KEY_ID: 'localbargain',
      S3_SECRET_ACCESS_KEY: 'localbargain-secret',
      IMAGE_BUCKET: 'localbargain-images',
      IMAGE_BASE_URL: 'http://localhost:9000/localbargain-images/',
    },
    // Each test file creates its own table, so files can run in parallel.
    testTimeout: 20_000,
  },
});
