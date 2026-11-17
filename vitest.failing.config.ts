import { defineConfig } from 'vitest/config';

// Runs ONLY the deliberately failing test against our own design.
export default defineConfig({
  test: {
    include: ['src/**/*.failing.spec.ts'],
  },
});
