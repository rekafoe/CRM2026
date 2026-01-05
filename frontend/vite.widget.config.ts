import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/widget/index.ts',
      name: 'PrintCRMWidget',
      formats: ['iife'],
      fileName: () => 'print-crm-widget.js'
    },
    outDir: 'dist/widget',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
