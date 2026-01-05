import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: 'localhost',
    port: 5173,
    hmr: {
      port: 5173
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          // базовые vendor chunks для стабильного кеширования на Vercel
          if (id.includes('react-router')) return 'router';
          if (id.includes('@tanstack')) return 'tanstack';
          if (id.includes('axios')) return 'axios';
          if (id.includes('react')) return 'react';

          return 'vendor';
        }
      }
    }
  }
});
