import {
  collection,
  DocumentData,
  getDocs,
  limit,
  orderBy,
   query,
  QueryConstraint,
  QueryDocumentSnapshot,
  startAfter,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { HelpTrack, Idea, IdeaCategory, IdeaStatus } from '../types/synapse';

/**
 * Search & Cursor Pagination Architecture for Synapse
 *
 * Limitations & Design Notes:
 * - Cloud Firestore does not natively provide unrestricted full-text substring search across
 *   arbitrary document fields without downloading bounded pages or using an external index.
 * - This module provides:
 *   1. Server-side indexed Firestore filtering & cursor-based pagination (`fetchIdeasCursorPage`)
 *      using composite indexes defined in `firestore.indexes.json` (`category`, `helpTrack`, `status`,
 *      `createdAt`, `connectionCount`) and `startAfter(lastDoc)` cursors so unbounded collections are
 *      never downloaded at once.
 *   2. Deterministic, ranked multi-field query matching (`matchAndRankIdeas`) across:
 *      - `title` (weight 4)
 *      - `tags` (weight 3)
 *      - `category` (weight 2)
 *      - `summary` (weight 2)
 *      - `problem` & `solution` (weight 1)
 *   3. A pluggable `SearchProvider` interface so a dedicated full-text search service (e.g. Algolia,
 *      Typesense, or Cloud Search) can be swapped in without modifying UI components.
 */

export const SEARCHABLE_FIELDS_SUMMARY =
  'Title, Summary, Tags, Category, Problem, Solution, and Author Username';

export interface IdeaSearchFilters {
  q?: string;
  query?: string;
  cat?: string;
  category?: string;
  track?: string;
  helpTrack?: string;
  status?: string;
  sort?: 'newest' | 'connected' | 'urgent';
  savedOnly?: boolean;
  bookmarkedIds?: Set<string>;
  isBookmarked?: (ideaId: string) => boolean;
}

export interface CursorPageResult {
  ideas: Idea[];
  items: Idea[];
  lastCursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

export interface SearchProvider {
  name: string;
  search(ideasPool: Idea[], filters: IdeaSearchFilters): Idea[];
}

export function matchesTaxonomyFilter(idea: Idea, taxonomyKey: string): boolean {
  if (!taxonomyKey || taxonomyKey === 'all') return true;
  const key = taxonomyKey.toLowerCase();
  const lowerCat = idea.category.toLowerCase();
  const lowerTags = idea.tags.map((t) => t.toLowerCase());

  if (key === 'software') return lowerCat === 'software' || lowerTags.includes('software');
  if (key === 'hardware') return lowerCat === 'hardware' || lowerTags.includes('hardware');
  if (key === 'ai') return lowerCat === 'ai' || lowerTags.includes('ai');
  if (key === 'web') return lowerCat === 'web' || lowerTags.includes('web');
  if (key === 'opensource') {
    return lowerTags.includes('opensource') || lowerTags.includes('open-hardware');
  }
  if (key === 'other') return lowerCat === 'other';
  return lowerCat === key || lowerTags.includes(key);
}

/**
 * Deterministic multi-field search and sort across a bounded pool of ideas.
 * Searches: Title, Summary, Tags, Category, Problem, Solution, and Author handle.
 */
export const deterministicFirestoreSearchProvider: SearchProvider = {
  name: 'firestore-bounded-deterministic',
  search(ideasPool: Idea[], filters: IdeaSearchFilters): Idea[] {
    const queryLower = (filters.q || filters.query || '').toLowerCase().trim();
    const tokens = queryLower ? queryLower.split(/\s+/).filter(Boolean) : [];
    const cat = filters.cat || filters.category || 'all';
    const track = filters.track || filters.helpTrack || 'all';
    const status = filters.status || 'all';
    const sort = filters.sort || 'newest';

    const scored: { idea: Idea; score: number }[] = [];

    for (const idea of ideasPool) {
      if (!matchesTaxonomyFilter(idea, cat)) continue;
      if (track !== 'all' && idea.helpTrack !== track) continue;
      if (status !== 'all' && idea.status !== status) continue;
      if (filters.savedOnly) {
        if (filters.isBookmarked && !filters.isBookmarked(idea.id)) continue;
        if (filters.bookmarkedIds && !filters.bookmarkedIds.has(idea.id)) continue;
      }

      if (tokens.length === 0) {
        scored.push({ idea, score: 1 });
        continue;
      }

      const titleLower = idea.title.toLowerCase();
      const summaryLower = idea.summary.toLowerCase();
      const categoryLower = idea.category.toLowerCase();
      const tagsLower = idea.tags.map((t) => t.toLowerCase());
      const problemLower = idea.problem.toLowerCase();
      const solutionLower = idea.solution.toLowerCase();
      const authorLower = idea.authorUsername.toLowerCase();

      let allTokensMatch = true;
      let totalScore = 0;

      for (const token of tokens) {
        let tokenScore = 0;
        if (titleLower.includes(token)) tokenScore += 4;
        if (tagsLower.some((t) => t.includes(token))) tokenScore += 3;
        if (categoryLower.includes(token)) tokenScore += 2;
        if (summaryLower.includes(token)) tokenScore += 2;
        if (problemLower.includes(token) || solutionLower.includes(token)) tokenScore += 1;
        if (authorLower.includes(token)) tokenScore += 1;

        if (tokenScore === 0) {
          allTokensMatch = false;
          break;
        }
        totalScore += tokenScore;
      }

      if (allTokensMatch) {
        scored.push({ idea, score: totalScore });
      }
    }

    return scored
      .sort((a, b) => {
        if (sort === 'connected') {
          const diff = (b.idea.connectionCount || 0) - (a.idea.connectionCount || 0);
          if (diff !== 0) return diff;
        }
        if (sort === 'urgent') {
          const aBuilder = a.idea.helpTrack === 'builder' && a.idea.status === 'open' ? 1 : 0;
          const bBuilder = b.idea.helpTrack === 'builder' && b.idea.status === 'open' ? 1 : 0;
          if (bBuilder !== aBuilder) return bBuilder - aBuilder;
        }
        if (tokens.length > 0 && b.score !== a.score && sort === 'newest') {
          return b.score - a.score;
        }
        return new Date(b.idea.createdAt).getTime() - new Date(a.idea.createdAt).getTime();
      })
      .map((entry) => entry.idea);
  },
};

export function searchAndFilterIdeas(
  ideasPool: Idea[],
  filters: IdeaSearchFilters
): Idea[] {
  return deterministicFirestoreSearchProvider.search(ideasPool, filters);
}

/**
 * Executes a cursor-paginated Firestore query (`startAfter`, `limit`) backed by composite indexes
 * in `firestore.indexes.json` so large collections can be paged incrementally without loading all documents.
 */
export async function fetchIdeasCursorPage(params: {
  pageSize?: number;
  cursor?: QueryDocumentSnapshot<DocumentData> | null;
  afterCursor?: QueryDocumentSnapshot<DocumentData> | null;
  category?: IdeaCategory | string;
  helpTrack?: HelpTrack | string;
  status?: IdeaStatus | string;
  sortBy?: 'createdAt' | 'updatedAt' | 'connectionCount' | 'newest' | 'connected' | string;
}): Promise<CursorPageResult> {
  const pageSize = params.pageSize || 24;
  const constraints: QueryConstraint[] = [];
  const activeCursor = params.cursor || params.afterCursor || null;

  if (params.status && params.status !== 'all') {
    constraints.push(where('status', '==', params.status));
  }
  if (
    params.category &&
    params.category !== 'all' &&
    params.category !== 'opensource'
  ) {
    const normalizedCat =
      params.category.toLowerCase() === 'software'
        ? 'Software'
        : params.category.toLowerCase() === 'hardware'
        ? 'Hardware'
        : params.category.toLowerCase() === 'ai'
        ? 'AI'
        : params.category.toLowerCase() === 'web'
        ? 'Web'
        : params.category.toLowerCase() === 'other'
        ? 'Other'
        : params.category;
    constraints.push(where('category', '==', normalizedCat));
  }
  if (params.helpTrack && params.helpTrack !== 'all') {
    constraints.push(where('helpTrack', '==', params.helpTrack));
  }

  const sortField =
    params.sortBy === 'connected' || params.sortBy === 'connectionCount'
      ? 'connectionCount'
      : params.sortBy === 'updatedAt'
      ? 'updatedAt'
      : 'createdAt';
  constraints.push(orderBy(sortField, 'desc'));

  if (activeCursor) {
    constraints.push(startAfter(activeCursor));
  }
  constraints.push(limit(pageSize));

  const q = query(collection(db, 'ideas'), ...constraints);
  const snap = await getDocs(q);
  const ideas: Idea[] = snap.docs
    .map((d) => ({
      id: d.id,
      ...(d.data() as Omit<Idea, 'id'>),
    }))
    .filter((i) => !i.deletedAt && !i.isSeed && !i.id.startsWith('seed-'));

  return {
    ideas,
    items: ideas,
    lastCursor: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    hasMore: snap.docs.length === pageSize,
  };
}
