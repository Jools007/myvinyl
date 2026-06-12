import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { apiPlugin } from './server/api-plugin';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    appType: 'spa',
    plugins: [
      react(),
      tailwindcss(),
      // Local dev: /api/* is served by server/api-plugin.ts (not the api/ folder).
      // Production (Vercel): /api/* is served by serverless functions in api/.
      apiPlugin(env),
    ],
    server: {
      port: 5174,
      host: true,
    },
    preview: {
      port: 5174,
    },
  };
});