import { defineConfig } from 'vitest/config';

// Default suite: must be green. The annotated failing test lives in
// *.failing.spec.ts and runs only through `pnpm test:failing`.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['src/**/*.failing.spec.ts'],
    passWithNoTests: true,
  },
});
