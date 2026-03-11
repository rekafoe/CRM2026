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
        // Все node_modules в один chunk — иначе react-query и др. загружались до React,
        // вызывая "useLayoutEffect of undefined" и белый экран после логина.
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  }
});
