import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Allows using describe, it, and expect without explicit imports (like Jest)
    globals: true, 
    include: [
      '**/[^.]*.{test,spec}.{ts,js}',
      '**/[^.]*.unit.{test,spec}.{ts,js}'
    ],
    exclude: [
      '**/[^.]*.integration.{test,spec}.{ts,js}',
      '**/[^.]*.e2e.{test,spec}.{ts,js}',
      '**/node_modules/**', 
      '**/lib/**'

    ],
    // Uses Node.js environment (change to 'jsdom' for browser tests)
    environment: 'node', 
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage' 
    },
    setupFiles: ['./vitest.setup.ts'], 
    passWithNoTests: true,
  },
});