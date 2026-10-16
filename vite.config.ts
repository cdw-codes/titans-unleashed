import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2500, // Rapier's compat build inlines its wasm (~1.5 MB).
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'rapier', test: /@dimforge/ },
            { name: 'three', test: /node_modules[\\/]three/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
