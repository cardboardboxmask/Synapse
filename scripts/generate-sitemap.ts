import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateSitemapXmlFromFirestore } from '../src/utils/sitemapXml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const baseOrigin = process.env.APP_URL || 'https://synapse.network';
  const { xml, ideaCount, urlCount, ideaIds } = await generateSitemapXmlFromFirestore(baseOrigin);

  const publicSitemapPath = path.resolve(__dirname, '../public/sitemap.xml');
  const rootSitemapPath = path.resolve(__dirname, '../sitemap.xml');

  fs.writeFileSync(publicSitemapPath, xml, 'utf-8');
  fs.writeFileSync(rootSitemapPath, xml, 'utf-8');

  console.log(
    `[Sitemap] Generated sitemap.xml with ${urlCount} URLs across ${ideaCount} Firestore ideas (${ideaIds.join(', ')}).`
  );
  process.exit(0);
}

run().catch((err) => {
  console.error('[Sitemap] Generation failed:', err);
  process.exit(1);
});
