import { defineConfig } from 'vitest/config';
import { tuningPlugin } from './tools/tuningPlugin.ts';

export default defineConfig({
  plugins: [tuningPlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4500, // Rapier's compat build inlines its wasm as base64 (~4.3 MB, ~1.7 MB gzip).
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
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
  },
});
