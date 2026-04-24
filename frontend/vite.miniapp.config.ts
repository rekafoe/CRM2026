import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    cssCodeSplit: false,
    lib: {
      entry: 'src/miniapp/index.ts',
      name: 'PrintCRMMiniApp',
      formats: ['iife'],
      fileName: () => 'miniapp.js',
    },
    outDir: '../backend/public/miniapp',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'miniapp.css';
          }
          return '[name][extname]';
        },
      },
    },
  },
});
