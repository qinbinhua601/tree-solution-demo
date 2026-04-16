import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/collection': {
        target: 'http://localhost:3001',
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        cardDemo: resolve(__dirname, 'card-demo.html'),
      },
    },
  },
});
