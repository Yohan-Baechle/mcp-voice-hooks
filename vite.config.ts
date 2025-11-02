import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';
import Icons from 'unplugin-icons/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    Icons({
      compiler: 'raw',
      autoInstall: true,
    })
  ],
  root: './',
  publicDir: 'public',
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
    outDir: 'dist/client',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, './src/shared'),
      '@client': resolve(__dirname, './src/client'),
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5111',
        changeOrigin: true,
      }
    }
  }
});
