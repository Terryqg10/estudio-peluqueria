import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests de integración contra Supabase local (Docker). Requiere `supabase start`.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Comparten una única base de datos: se ejecutan en serie.
    fileParallelism: false,
  },
});
