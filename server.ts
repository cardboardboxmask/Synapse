import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleAdminSecurityApiRequest } from './src/utils/adminWebAuthnServer';
import { generateSitemapXmlFromFirestore } from './src/utils/sitemapXml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const PORT = Number(process.env.PORT) || 3000;
const distPath = path.resolve(__dirname, 'dist');
const publicPath = path.resolve(__dirname, 'public');

// 1. Request body size limits
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// 2. HTTP Security Headers & CSP
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), publickey-credentials-get=(self), publickey-credentials-create=(self)'
  );
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://apis.google.com https://*.firebaseapp.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' https: data: blob:",
      "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com wss://*.firebaseio.com",
      "frame-src 'self' https://*.firebaseapp.com https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
    ].join('; ')
  );
  next();
});

// 3. Strict CORS Configuration for API routes
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigin = process.env.APP_URL;
  if (origin && allowedOrigin && origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

// 4. Sliding-window IP Rate Limiting for dynamic endpoints
const ipWindows = new Map<string, { count: number; resetAt: number }>();
function rateLimitMiddleware(maxRequests: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = ipWindows.get(ip);
    if (!record || now > record.resetAt) {
      ipWindows.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (record.count >= maxRequests) {
      res.setHeader('Retry-After', String(Math.ceil((record.resetAt - now) / 1000)));
      res.status(429).json({
        error: 'Too many requests. Please wait before retrying.',
      });
      return;
    }
    record.count += 1;
    next();
  };
}

// 5. Structured Request & Performance Logging (no sensitive tokens/headers)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/assets/') || req.path.endsWith('.js') || req.path.endsWith('.css')) {
      return;
    }
    const durationMs = Date.now() - start;
    console.log(
      JSON.stringify({
        severity: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARNING' : 'INFO',
        event: 'http_request',
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs,
        timestamp: new Date().toISOString(),
      })
    );
  });
  next();
});

// 6. Cloud Run Liveness & Readiness Health Endpoints
const healthHandler = (_req: express.Request, res: express.Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'synapse-registry',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
};
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// 6b. Admin Security WebAuthn & Step-Up Verification API Routes
app.use('/api/admin', async (req, res, next) => {
  req.url = `/api/admin${req.url}`;
  const handled = await handleAdminSecurityApiRequest(req, res);
  if (!handled) {
    next();
  }
});

// 7. Dynamic robots.txt
app.get('/robots.txt', (req, res) => {
  const forwardedProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim();
  const protocol = forwardedProto || req.protocol || 'https';
  const host = req.get('host');
  const baseOrigin = (
    process.env.APP_URL || (host ? `${protocol}://${host}` : 'https://synapse.network')
  ).replace(/\/+$/, '');

  const robots = [
    'User-agent: *',
    'Allow: /',
    'Allow: /explore',
    'Allow: /ideas/',
    'Allow: /connections',
    'Allow: /showcase',
    'Allow: /about',
    'Allow: /support',
    'Allow: /u/',
    'Disallow: /admin/',
    'Disallow: /profile',
    'Disallow: /notifications',
    'Disallow: /login',
    'Disallow: /post/',
    'Disallow: /ideas/*/edit',
    '',
    `Sitemap: ${baseOrigin}/sitemap.xml`,
    '',
  ].join('\n');

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(robots);
});

// 8. Dynamic Firestore Sitemap Handler (excludes deleted ideas & accounts)
async function handleDynamicSitemap(req: express.Request, res: express.Response) {
  try {
    const forwardedProto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim();
    const protocol = forwardedProto || req.protocol || 'https';
    const host = req.get('host');
    const baseOrigin =
      process.env.APP_URL || (host ? `${protocol}://${host}` : 'https://synapse.network');

    const { xml } = await generateSitemapXmlFromFirestore(baseOrigin);

    try {
      fs.writeFileSync(path.join(publicPath, 'sitemap.xml'), xml, 'utf-8');
      fs.writeFileSync(path.join(__dirname, 'sitemap.xml'), xml, 'utf-8');
    } catch {
      // Ignore write error on read-only container filesystems
    }

    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    res.status(200).send(xml);
  } catch (err) {
    console.error('Dynamic sitemap error:', err);
    const fallbackFile = path.join(publicPath, 'sitemap.xml');
    if (fs.existsSync(fallbackFile)) {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.sendFile(fallbackFile);
    } else {
      res
        .status(500)
        .send(
          '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>'
        );
    }
  }
}

app.get('/sitemap.xml', rateLimitMiddleware(30, 60_000), handleDynamicSitemap);
app.get('/api/sitemap.xml', rateLimitMiddleware(30, 60_000), handleDynamicSitemap);

// 9. Static Assets with Cache Control
app.use(
  express.static(publicPath, {
    maxAge: '1h',
  })
);
app.use(
  express.static(distPath, {
    maxAge: '7d',
    immutable: true,
    index: false,
  })
);

// 10. SPA Fallback for client-side routes
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  const builtIndex = path.join(distPath, 'index.html');
  const rootIndex = path.join(__dirname, 'index.html');
  if (fs.existsSync(builtIndex)) {
    res.sendFile(builtIndex);
  } else {
    res.sendFile(rootIndex);
  }
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(
    JSON.stringify({
      severity: 'INFO',
      event: 'server_started',
      port: PORT,
      timestamp: new Date().toISOString(),
    })
  );
});

// 11. Graceful Shutdown for Cloud Run SIGTERM / SIGINT
function shutdownGracefully(signal: string) {
  console.log(
    JSON.stringify({
      severity: 'INFO',
      event: 'server_shutting_down',
      signal,
      timestamp: new Date().toISOString(),
    })
  );
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(1);
  }, 8000).unref();
}

process.on('SIGTERM', () => shutdownGracefully('SIGTERM'));
process.on('SIGINT', () => shutdownGracefully('SIGINT'));
