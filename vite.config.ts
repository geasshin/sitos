/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dataPlugin } from './server/dataPlugin.ts';

const dataDir = fileURLToPath(new URL('./data', import.meta.url));

export default defineConfig({
  plugins: [react(), dataPlugin(dataDir)],
  server: {
    port: 5180,
    // Les écritures de l'app dans data/ ne doivent pas recharger la page.
    watch: { ignored: ['**/data/**'] },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
