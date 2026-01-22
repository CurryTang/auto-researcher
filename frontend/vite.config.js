import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // For GitHub Pages deployment - update 'auto-researcher' to your repo name
  base: '/auto-researcher/',
  build: {
    outDir: 'dist',
  },
});
