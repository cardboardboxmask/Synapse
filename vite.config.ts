import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig, Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { handleAdminSecurityApiRequest } from './src/utils/adminWebAuthnServer';
import { generateSitemapXmlFromFirestore } from './src/utils/sitemapXml';

function synapseDynamicSitemapPlugin(): Plugin {
  return {
    name: 'synapse-dynamic-sitemap',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const reqPath = req.url?.split('?')[0] || '';
        if (reqPath.startsWith('/api/admin/')) {
          const handled = await handleAdminSecurityApiRequest(req, res);
          if (handled) return;
        }
        if (reqPath !== '/sitemap.xml' && reqPath !== '/api/sitemap.xml') {
          return next();
        }
        try {
          const forwardedProto = (req.headers['x-forwarded-proto'] as string)
            ?.split(',')[0]
            ?.trim();
          const protocol = forwardedProto || 'https';
          const host = req.headers.host;
          const baseOrigin =
            process.env.APP_URL ||
            (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')
              ? `${protocol}://${host}`
              : 'https://synapse.network');

          const { xml } = await generateSitemapXmlFromFirestore(baseOrigin);

          try {
            fs.writeFileSync(path.resolve(__dirname, 'public/sitemap.xml'), xml, 'utf-8');
            fs.writeFileSync(path.resolve(__dirname, 'sitemap.xml'), xml, 'utf-8');
          } catch {
            // Non-fatal if filesystem is read-only
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(xml);
        } catch (err) {
          console.error('Vite sitemap middleware error:', err);
          next();
        }
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      synapseDynamicSitemapPlugin(),
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'robots.txt'],
        manifest: {
          id: '/',
          name: 'Synapse — Open Protocol Idea Registry',
          short_name: 'Synapse',
          description:
            'Free, volunteer-run community where makers and researchers post ideas, connect complementary specs, offer guidance, or volunteer to build prototypes.',
          theme_color: '#10131b',
          background_color: '#10131b',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
