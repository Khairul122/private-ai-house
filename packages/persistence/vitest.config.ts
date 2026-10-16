import { defineConfig } from 'vitest/config';

// Each in-memory PGlite database takes a few seconds to boot.
export default defineConfig({ test: { testTimeout: 60_000, hookTimeout: 60_000 } });
