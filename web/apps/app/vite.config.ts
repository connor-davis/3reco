import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8180', changeOrigin: true, ws: true },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Cache shared vendors separately and keep each chunk below 500 kB.
        manualChunks(id) {
          if (!id.includes('/node_modules/')) return;
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id))
            return 'react';
          if (
            /\/node_modules\/@tanstack\/(react-query|query-core|react-router|router-core|history|react-store|store)\//.test(
              id
            )
          )
            return 'tanstack';
        },
      },
    },
  },
});
