import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { SEED_IDEAS } from '../data/seedIdeas';
import { Idea, UserProfile } from '../types/synapse';

export interface SitemapUrlEntry {
  loc: string;
  lastmod?: string;
  changefreq: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority: string;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeIsoDate(dateStr?: string): string {
  if (!dateStr) return new Date().toISOString();
  const parsed = Date.parse(dateStr);
  if (Number.isNaN(parsed)) return new Date().toISOString();
  return new Date(parsed).toISOString();
}

function getServerFirestore() {
  const existingApps = getApps();
  const app =
    existingApps.length > 0
      ? existingApps[0]
      : initializeApp(firebaseConfig, 'synapse-sitemap-client');
  return getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

/**
  * Queries Firestore for all active (non-deleted) ideas and active public user profiles,
  * ensuring starter ideas are seeded when the database is empty, and builds a complete XML Sitemap.
  * Deleted ideas and deleted/anonymized accounts are automatically excluded from the sitemap.
  */
export async function generateSitemapXmlFromFirestore(
  baseOrigin = 'https://synapse.network'
): Promise<{
  xml: string;
  ideaCount: number;
  urlCount: number;
  ideaIds: string[];
}> {
  const cleanOrigin = baseOrigin.replace(/\/+$/, '');
  const ideasMap = new Map<string, Idea>();
  const usernamesSet = new Set<string>(['founder']);

  try {
    const db = getServerFirestore();

    // Fetch existing ideas in Firestore
    let ideasSnapshot = await getDocs(collection(db, 'ideas'));

    // If the collection is completely empty, seed starter ideas once
    if (ideasSnapshot.empty) {
      for (const seed of SEED_IDEAS) {
        try {
          const seedRef = doc(db, 'ideas', seed.id);
          const snap = await getDoc(seedRef);
          if (!snap.exists()) {
            const { id: _id, ...payload } = seed;
            await setDoc(seedRef, payload);
          }
        } catch {
          // Non-fatal if rules or network prevent seeding during read
        }
      }
      ideasSnapshot = await getDocs(collection(db, 'ideas'));
    }

    if (!ideasSnapshot.empty) {
      ideasSnapshot.forEach((docSnap) => {
        const data = docSnap.data() as Omit<Idea, 'id'>;
        // Exclude soft-deleted ideas from sitemap
        if (data.deletedAt) return;
        const idea: Idea = {
          ...data,
          id: docSnap.id,
        };
        ideasMap.set(docSnap.id, idea);
        if (idea.authorUsername && idea.authorUsername !== 'deleted-member') {
          usernamesSet.add(idea.authorUsername);
        }
      });
    } else {
      // Fallback if Firestore is unreachable
      for (const seed of SEED_IDEAS) {
        ideasMap.set(seed.id, seed);
        if (seed.authorUsername) {
          usernamesSet.add(seed.authorUsername);
        }
      }
    }

    // Fetch active public maker profiles in Firestore
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      usersSnapshot.forEach((userSnap) => {
        const userData = userSnap.data() as Partial<UserProfile>;
        if (
          userData.username &&
          userData.username !== 'deleted-member' &&
          userData.accountStatus !== 'deleted' &&
          !userData.deletedAt
        ) {
          usernamesSet.add(userData.username);
        }
      });
    } catch {
      // Non-fatal if users collection is empty
    }
  } catch (err) {
    console.warn('Sitemap Firestore fetch fallback notice:', err);
    for (const seed of SEED_IDEAS) {
      ideasMap.set(seed.id, seed);
      if (seed.authorUsername) {
        usernamesSet.add(seed.authorUsername);
      }
    }
  }

  const allIdeas = Array.from(ideasMap.values()).sort((a, b) =>
    (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
  );

  const latestIdeaTimestamp =
    allIdeas.length > 0
      ? normalizeIsoDate(allIdeas[0].updatedAt || allIdeas[0].createdAt)
      : new Date().toISOString();

  const entries: SitemapUrlEntry[] = [
    // Core Public Discovery Routes
    {
      loc: `${cleanOrigin}/`,
      lastmod: latestIdeaTimestamp,
      changefreq: 'daily',
      priority: '1.0',
    },
    {
      loc: `${cleanOrigin}/explore`,
      lastmod: latestIdeaTimestamp,
      changefreq: 'hourly',
      priority: '0.9',
    },
    {
      loc: `${cleanOrigin}/connections`,
      lastmod: latestIdeaTimestamp,
      changefreq: 'daily',
      priority: '0.8',
    },
    {
      loc: `${cleanOrigin}/showcase`,
      lastmod: latestIdeaTimestamp,
      changefreq: 'daily',
      priority: '0.8',
    },
    {
      loc: `${cleanOrigin}/about`,
      lastmod: '2026-09-24T10:00:00.000Z',
      changefreq: 'monthly',
      priority: '0.7',
    },
    {
      loc: `${cleanOrigin}/support`,
      lastmod: '2026-09-24T10:00:00.000Z',
      changefreq: 'monthly',
      priority: '0.7',
    },

    // Public Discovery Track & Category Permalinks
    {
      loc: `${cleanOrigin}/explore?track=guidance`,
      lastmod: latestIdeaTimestamp,
      changefreq: 'daily',
      priority: '0.8',
    },
    {
      loc: `${cleanOrigin}/explore?track=builder`,
      lastmod: latestIdeaTimestamp,
      changefreq: 'daily',
      priority: '0.8',
    },
    {
      loc: `${cleanOrigin}/explore?cat=Software`,
      lastmod: latestIdeaTimestamp,
      changefreq: 'daily',
      priority: '0.7',
    },
    {
      loc: `${cleanOrigin}/explore?cat=Hardware`,
      lastmod: latestIdeaTimestamp,
      changefreq: 'daily',
      priority: '0.7',
    },
    {
      loc: `${cleanOrigin}/explore?cat=AI`,
      lastmod: latestIdeaTimestamp,
      changefreq: 'daily',
      priority: '0.7',
    },
    {
      loc: `${cleanOrigin}/explore?cat=Web`,
      lastmod: latestIdeaTimestamp,
      changefreq: 'daily',
      priority: '0.7',
    },
  ];

  // Dynamic Routes for Every Active Idea in Firestore
  for (const idea of allIdeas) {
    const encodedId = encodeURIComponent(idea.id);
    const ideaLastMod = normalizeIsoDate(idea.updatedAt || idea.createdAt);

    // 1. Primary Idea Specification Route
    entries.push({
      loc: `${cleanOrigin}/ideas/${encodedId}`,
      lastmod: ideaLastMod,
      changefreq: 'weekly',
      priority: '0.8',
    });

    // 2. Idea Community Responses Route
    entries.push({
      loc: `${cleanOrigin}/ideas/${encodedId}/responses`,
      lastmod: ideaLastMod,
      changefreq: 'weekly',
      priority: '0.7',
    });

    // 3. Idea Volunteers & Lifecycle Route
    entries.push({
      loc: `${cleanOrigin}/ideas/${encodedId}/volunteers`,
      lastmod: ideaLastMod,
      changefreq: 'weekly',
      priority: '0.7',
    });

    // 4. Idea Connected Ideas Route
    entries.push({
      loc: `${cleanOrigin}/ideas/${encodedId}/connections`,
      lastmod: ideaLastMod,
      changefreq: 'weekly',
      priority: '0.7',
    });

    // 5. Showcase Detail Route for Built Ideas
    if (idea.status === 'built') {
      entries.push({
        loc: `${cleanOrigin}/showcase/${encodedId}`,
        lastmod: ideaLastMod,
        changefreq: 'weekly',
        priority: '0.8',
      });
    }
  }

  // Dynamic Routes for Active Public Maker Profiles
  for (const username of Array.from(usernamesSet).sort()) {
    if (!username || username === 'deleted-member') continue;
    entries.push({
      loc: `${cleanOrigin}/u/${encodeURIComponent(username)}`,
      lastmod: latestIdeaTimestamp,
      changefreq: 'weekly',
      priority: '0.6',
    });
  }

  const urlBlocks = entries
    .map((entry) => {
      const lines = [
        '  <url>',
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        ...(entry.lastmod ? [`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`] : []),
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority}</priority>`,
        '  </url>',
      ];
      return lines.join('\n');
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlBlocks}\n</urlset>\n`;

  return {
    xml,
    ideaCount: allIdeas.length,
    urlCount: entries.length,
    ideaIds: allIdeas.map((i) => i.id),
  };
}
