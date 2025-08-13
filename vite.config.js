import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/rooms': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/players': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/purge': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/top10': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/modes': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
