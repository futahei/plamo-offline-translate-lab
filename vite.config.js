import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      // モデルのダウンロード・推論を途中で切らないよう更新は利用者が承認する。
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'KaruYaku - オフライン翻訳',
        short_name: 'KaruYaku',
        description: '軽く、つながず、翻訳する。端末内で動作するオフライン翻訳アプリ',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f7f9fc',
        theme_color: '#f7f9fc',
        lang: 'ja',
        icons: [{ src: './favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,wasm,json}'],
        maximumFileSizeToCacheInBytes: 32 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
      },
    }),
  ],
});
