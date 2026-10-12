import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
let apiHost = '127.0.0.1';
try {
  apiHost =
    readFileSync(new URL('../../.env', import.meta.url), 'utf8').match(
      /^API_HOST=([0-9.]+)$/m,
    )?.[1] ?? apiHost;
} catch {
  /* default for unconfigured environments */
}
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: '学什么语',
        short_name: '学什么语',
        description: '今天也整两句日语。课堂学的、生活捡的，都收好。',
        theme_color: '#ffdf79',
        background_color: '#fff8e9',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: `http://${apiHost}:3001` } },
  },
});
