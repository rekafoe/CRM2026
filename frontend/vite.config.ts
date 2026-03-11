import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
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

          // React и все зависимые от него библиотеки — в один chunk (избегаем useLayoutEffect of undefined)
          if (id.includes('react') || id.includes('react-konva') || id.includes('use-image') || id.includes('@tanstack')) return 'react';
          if (id.includes('react-router')) return 'router';
          if (id.includes('axios')) return 'axios';

          return 'vendor';
        }
      }
    }
  }
});
