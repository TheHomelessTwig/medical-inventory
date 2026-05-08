import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    globalSetup: './src/tests/globalSetup.ts',  // create/seed/drop DB once
    setupFiles: ['./src/tests/setup.ts'],        // set DB_NAME env per file

    testTimeout: 30_000,
    hookTimeout: 30_000,

    // ─── Sequential, single-process execution ──────────────────────────────
    // Tests share a PostgreSQL database. Concurrent file execution causes
    // clearTransactionalData() calls to race with INSERT/UPDATE in other files,
    // producing FK violations, deadlocks, and connection pool exhaustion.
    //
    // maxWorkers: 1   → only one test file runs at a time
    // singleFork      → all files share one OS process
    // isolate: false  → one module registry → one pg Pool → no connection storm
    maxWorkers: 1,
    pool: 'forks',
    // Vitest 4: singleFork and isolate are top-level forks options
    singleFork: true,
    isolate: false,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/tests/**', 'src/index.ts', 'src/utils/hashPasswords.ts'],
    },
  },
});
