import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  const isCloudEnv = Boolean(
    process.env.APP_URL ||
    process.env.K_SERVICE ||
    process.env.NG_ALLOWED_HOSTS ||
    process.env.AIS_APP_URL
  );

  const rawUrl =
    process.env.APP_URL ||
    (process.env.NG_ALLOWED_HOSTS ? `https://${process.env.NG_ALLOWED_HOSTS}` : '');

  let hmrHost: string | undefined = undefined;
  let isHttps = false;

  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      hmrHost = parsed.hostname;
      isHttps = parsed.protocol === 'https:';
    } catch {
      hmrHost = rawUrl.replace(/^https?:\/\//, '').split('/')[0];
      isHttps = true;
    }
  }

  const hmrConfig = process.env.DISABLE_HMR === 'true'
    ? false
    : {
        protocol: isCloudEnv || isHttps ? ('wss' as const) : ('ws' as const),
        host: hmrHost,
        clientPort: isCloudEnv || isHttps ? 443 : 3000,
      };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    worker: {
      format: 'es' as const,
    },
    server: {
      hmr: hmrConfig,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
