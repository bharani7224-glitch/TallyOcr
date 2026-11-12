import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 3000,
    proxy: {
      '/ocr-api': {
        target: 'http://192.23.2.41:1010',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ocr-api/, ''),
        timeout: 600000, // 10 minutes for OCR inference
      },
      '/backend-api': {
        target: 'http://localhost:5255',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/backend-api/, ''),
      },
    },
  },
});
