import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so tests don't load the TanStack Start / Nitro plugins.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
