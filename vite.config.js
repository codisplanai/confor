import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'maskable-icon-512x512.png',
      ],
      manifest: {
        name: 'ConFor — Conciliação Contábil de Fornecedores',
        short_name: 'ConFor',
        description:
          'Conciliação contábil entre Balancete Analítico e Conta Corrente de Fornecedores 100% no navegador.',
        theme_color: '#1B365D',
        background_color: '#0B101B',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        lang: 'pt-BR',
        categories: ['finance', 'productivity', 'business'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,mjs}'],
        maximumFileSizeToCacheInBytes: 3500000,
      },
    }),
  ],
});
