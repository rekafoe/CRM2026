import { defineConfig, type HmrContext, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const isWin = process.platform === 'win32';
const forceOptimizeDeps = process.env.VITE_FORCE_DEPS === '1';

/** Lazy-чанки редактора на Windows часто не подхватывают fast refresh — полная перезагрузка страницы. */
function fullReloadOnEditorModuleChanges(): Plugin {
  const editorPathRe = /[\\/]features[\\/](publicDesignEditor|designEditorShell)[\\/]/;

  return {
    name: 'full-reload-editor-modules',
    handleHotUpdate(ctx: HmrContext) {
      if (!editorPathRe.test(ctx.file)) return;
      if (!/\.(tsx?|jsx?)$/.test(ctx.file)) return;
      ctx.server.ws.send({ type: 'full-reload', path: '*' });
      return [];
    },
  };
}

export default defineConfig({
  plugins: [react(), fullReloadOnEditorModuleChanges()],
  resolve: {
    // В src/ лежали скомпилированные .js — без этого Vite брал их раньше .tsx
    extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.mts', '.json'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    force: forceOptimizeDeps,
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5173,
    },
    headers: {
      'Cache-Control': 'no-store',
    },
    watch: isWin
      ? {
          usePolling: true,
          interval: 800,
        }
      : undefined,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
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
  },
});
