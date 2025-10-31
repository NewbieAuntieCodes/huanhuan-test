import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // 支持 Google AI Studio IDE 环境变量
    const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

    return {
      plugins: [react()],
      base: '/huanhuan-test/',
      define: {
        'process.env.API_KEY': JSON.stringify(apiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
        global: 'globalThis',
      },
      resolve: {
        alias: {
          buffer: 'buffer',
        },
      },
      optimizeDeps: {
        include: ['buffer'],
      },
      build: {
        target: 'es2015',
        rollupOptions: {
          external: []
        }
      },
      esbuild: {
        target: 'es2015'
      }
    };
});