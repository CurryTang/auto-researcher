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
        // Bundle mermaid and all its dependencies together to avoid dynamic import issues
        // on GitHub Pages (dagre, cytoscape, etc. are loaded dynamically by mermaid)
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // Bundle all mermaid-related packages together
            if (id.includes('mermaid') ||
                id.includes('dagre') ||
                id.includes('cytoscape') ||
                id.includes('d3') ||
                id.includes('elkjs') ||
                id.includes('katex') ||
                id.includes('khroma') ||
                id.includes('lodash')) {
              return 'mermaid-vendor';
            }
            // Bundle React and related packages
            if (id.includes('react')) {
              return 'react-vendor';
            }
          }
        },
      },
    },
  },
});
