import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // For GitHub Pages deployment - update 'auto-researcher' to your repo name
  base: '/auto-researcher/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        // Mermaid is lazy-loaded via dynamic import() to reduce initial bundle
        // and build memory usage. Group its deps together when loaded.
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('mermaid') ||
                id.includes('dagre') ||
                id.includes('cytoscape') ||
                id.includes('d3') ||
                id.includes('elkjs') ||
                id.includes('khroma') ||
                id.includes('lodash')) {
              return 'mermaid-vendor';
            }
            if (id.includes('react')) {
              return 'react-vendor';
            }
          }
        },
      },
    },
  },
});
