import { useEffect } from 'react';

interface PageMetaProps {
  title: string;
  description: string;
  canonicalPath?: string;
  noindex?: boolean;
}

const PRIVATE_PATH_PREFIXES = [
  '/login',
  '/profile',
  '/notifications',
  '/admin',
  '/post/',
];

export function PageMeta({ title, description, canonicalPath, noindex }: PageMetaProps) {
  useEffect(() => {
    const fullTitle = title.includes('Synapse') ? title : `${title} — Synapse`;
    document.title = fullTitle;

    const currentPath =
      canonicalPath || (typeof window !== 'undefined' ? window.location.pathname : '/');

    const canonicalUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${currentPath}`
        : `https://synapse.network${currentPath}`;

    const isPrivateRoute =
      Boolean(noindex) ||
      PRIVATE_PATH_PREFIXES.some((prefix) => currentPath.startsWith(prefix)) ||
      currentPath.endsWith('/edit');

    const ensureAndSetMeta = (
      selector: string,
      createAttrs: Record<string, string>,
      targetAttr: string,
      content: string
    ) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        Object.entries(createAttrs).forEach(([k, v]) => el!.setAttribute(k, v));
        document.head.appendChild(el);
      }
      el.setAttribute(targetAttr, content);
    };

    ensureAndSetMeta('meta[name="description"]', { name: 'description' }, 'content', description);
    ensureAndSetMeta('meta[property="og:title"]', { property: 'og:title' }, 'content', fullTitle);
    ensureAndSetMeta(
      'meta[property="og:description"]',
      { property: 'og:description' },
      'content',
      description
    );
    ensureAndSetMeta('meta[property="og:url"]', { property: 'og:url' }, 'content', canonicalUrl);
    ensureAndSetMeta(
      'meta[name="twitter:title"]',
      { name: 'twitter:title' },
      'content',
      fullTitle
    );
    ensureAndSetMeta(
      'meta[name="twitter:description"]',
      { name: 'twitter:description' },
      'content',
      description
    );
    ensureAndSetMeta(
      'meta[name="robots"]',
      { name: 'robots' },
      'content',
      isPrivateRoute ? 'noindex, nofollow' : 'index, follow'
    );

    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', canonicalUrl);

    // Structured Data (Schema.org JSON-LD) for public pages
    const scriptId = 'synapse-jsonld';
    let scriptEl = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (isPrivateRoute) {
      if (scriptEl) scriptEl.remove();
    } else {
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.id = scriptId;
        scriptEl.type = 'application/ld+json';
        document.head.appendChild(scriptEl);
      }
      scriptEl.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: fullTitle,
        description,
        url: canonicalUrl,
        isPartOf: {
          '@type': 'WebSite',
          name: 'Synapse — Open Protocol Idea Registry',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://synapse.network',
        },
      });
    }
  }, [title, description, canonicalPath, noindex]);

  return null;
}


