import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import { BookmarkButton } from '../components/BookmarkButton';
import { PageMeta } from '../components/PageMeta';
import { IdeaCardSkeletonGrid } from '../components/Skeletons';
import { Idea } from '../types/synapse';
import { formatRelativeTime } from '../utils/sanitize';
import {
  fetchIdeasCursorPage,
  SEARCHABLE_FIELDS_SUMMARY,
  searchAndFilterIdeas,
} from '../utils/searchService';

const ITEMS_PER_PAGE = 6;

export const ExplorePage: React.FC = () => {
  const {
    user,
    isAdmin,
    ideas,
    ideasLoading,
    ideasError,
    savedBookmarks,
    isBookmarked,
    showToast,
  } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const [simulatedZeroState, setSimulatedZeroState] = useState(false);

  const q = searchParams.get('q') || '';
  const cat = searchParams.get('cat') || 'all';
  const track = searchParams.get('track') || 'all';
  const status = searchParams.get('status') || 'all';
  const sort = (searchParams.get('sort') || 'newest') as 'newest' | 'connected' | 'urgent';
  const savedOnly = searchParams.get('saved') === '1';
  const page = Math.max(1, Number(searchParams.get('page') || '1'));

  // Firestore cursor-based pagination state for indexed queries
  const cursorMapRef = useRef<Map<number, QueryDocumentSnapshot<DocumentData> | null>>(
    new Map([[1, null]])
  );
  const [cursorLoading, setCursorLoading] = useState(false);
  const [cursorIdeas, setCursorIdeas] = useState<Idea[] | null>(null);
  const [cursorHasMore, setCursorHasMore] = useState(false);

  // Determine whether current filter combination can use direct Firestore cursor pagination
  const canUseDirectFirestoreCursor =
    !simulatedZeroState &&
    !q.trim() &&
    !savedOnly &&
    sort !== 'urgent' &&
    cat.toLowerCase() !== 'opensource';

  // Reset cursor cache whenever filters or sort change
  useEffect(() => {
    cursorMapRef.current = new Map([[1, null]]);
  }, [cat, track, status, sort, q, savedOnly]);

  // Execute Firestore cursor pagination when applicable
  useEffect(() => {
    if (!canUseDirectFirestoreCursor) {
      setCursorIdeas(null);
      return;
    }

    let cancelled = false;
    async function loadCursorPage() {
      setCursorLoading(true);
      try {
        // Ensure we have cursors up to `page` if user navigated directly to `?page=N`
        for (let p = 1; p <= page; p++) {
          if (p > 1 && !cursorMapRef.current.has(p)) {
            const prevCursor = cursorMapRef.current.get(p - 1) ?? null;
            const stepResult = await fetchIdeasCursorPage({
              category: cat,
              helpTrack: track,
              status,
              sortBy: sort === 'connected' ? 'connected' : 'newest',
              pageSize: ITEMS_PER_PAGE,
              afterCursor: prevCursor,
            });
            cursorMapRef.current.set(p, stepResult.lastCursor);
          }
        }

        const startCursor = cursorMapRef.current.get(page) ?? null;
        const result = await fetchIdeasCursorPage({
          category: cat,
          helpTrack: track,
          status,
          sortBy: sort === 'connected' ? 'connected' : 'newest',
          pageSize: ITEMS_PER_PAGE,
          afterCursor: startCursor,
        });

        if (!cancelled) {
          cursorMapRef.current.set(page + 1, result.lastCursor);
          setCursorIdeas(result.items);
          setCursorHasMore(result.hasMore);
        }
      } catch {
        // Fallback to deterministic index if composite cursor query isn't warm
        if (!cancelled) {
          setCursorIdeas(null);
        }
      } finally {
        if (!cancelled) {
          setCursorLoading(false);
        }
      }
    }

    loadCursorPage();
    return () => {
      cancelled = true;
    };
  }, [canUseDirectFirestoreCursor, cat, track, status, sort, page, ideas.length]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === 'all' || (key === 'sort' && value === 'newest')) {
      next.delete(key);
    } else {
      next.set(key, value);
    }
    if (key !== 'page') {
      next.delete('page');
    }
    setSearchParams(next);
  };

  const resetAllFilters = () => {
    setSimulatedZeroState(false);
    setSearchParams(new URLSearchParams());
  };

  const matchesTaxonomy = (idea: Idea, taxonomyKey: string): boolean => {
    const keyLower = taxonomyKey.toLowerCase();
    if (keyLower === 'all') return true;
    const lowerCat = idea.category.toLowerCase();
    const lowerTags = idea.tags.map((t) => t.toLowerCase());
    if (keyLower === 'software') {
      return lowerCat === 'software' || lowerTags.includes('software');
    }
    if (keyLower === 'hardware') {
      return lowerCat === 'hardware' || lowerTags.includes('hardware');
    }
    if (keyLower === 'ai') {
      return lowerCat === 'ai' || lowerTags.includes('ai');
    }
    if (keyLower === 'web') {
      return lowerCat === 'web' || lowerTags.includes('web');
    }
    if (keyLower === 'opensource') {
      return lowerTags.includes('opensource') || lowerTags.includes('open-hardware');
    }
    if (keyLower === 'other') {
      return lowerCat === 'other';
    }
    return lowerTags.includes(keyLower);
  };

  const taxonomyCounts = useMemo(() => {
    return {
      all: ideas.length,
      software: ideas.filter((i) => matchesTaxonomy(i, 'software')).length,
      hardware: ideas.filter((i) => matchesTaxonomy(i, 'hardware')).length,
      ai: ideas.filter((i) => matchesTaxonomy(i, 'ai')).length,
      web: ideas.filter((i) => matchesTaxonomy(i, 'web')).length,
      opensource: ideas.filter((i) => matchesTaxonomy(i, 'opensource')).length,
      other: ideas.filter((i) => matchesTaxonomy(i, 'other')).length,
    };
  }, [ideas]);

  const filteredIdeas = useMemo(() => {
    if (simulatedZeroState) return [];
    return searchAndFilterIdeas(ideas, {
      q,
      cat,
      track,
      status,
      sort,
      savedOnly,
      isBookmarked,
    });
  }, [ideas, q, cat, track, status, sort, savedOnly, isBookmarked, simulatedZeroState]);

  const totalPages = Math.max(1, Math.ceil(filteredIdeas.length / ITEMS_PER_PAGE));
  const safePage = Math.min(page, totalPages);

  const paginatedIdeas = useMemo(() => {
    if (simulatedZeroState) return [];
    // Prioritize client-side filtering which is safer for small sets
    const start = (safePage - 1) * ITEMS_PER_PAGE;
    return filteredIdeas.slice(start, start + ITEMS_PER_PAGE);
  }, [simulatedZeroState, filteredIdeas, safePage]);

  const hasNextPage =
    canUseDirectFirestoreCursor && cursorIdeas !== null
      ? cursorHasMore && safePage < totalPages
      : safePage < totalPages;

  const uriPreview = useMemo(() => {
    const qs = searchParams.toString();
    return `/explore${qs ? `?${qs}` : '?track=all&sort=newest'}`;
  }, [searchParams]);

  const handleCopyQueryLink = () => {
    navigator.clipboard
      .writeText(window.location.href)
      .then(() => showToast('Permanent registry filter link copied to clipboard.', 'success'))
      .catch(() => showToast('Could not copy link to clipboard.', 'error'));
  };

  return (
    <div className="flex flex-col w-full">
      <PageMeta
        title="Explore Ideas — Synapse"
        description="Browse ideas posted by people looking for builders or guidance. Pick an idea up, collaborate, or offer feedback."
      />

      {/* Top Filter Workbench */}
      <div className="relative w-full overflow-hidden bg-surface-container-lowest py-space-xl">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-secondary/5 blur-3xl pointer-events-none" />
        <div className="absolute top-12 left-1/4 w-80 h-80 rounded-full bg-primary-container/5 blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-margin flex flex-col gap-space-lg">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center gap-space-xs">
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                <span className="font-code-sm text-[13px] text-secondary font-medium">
                  Community Ideas
                </span>
              </div>
              <h1 className="font-headline-lg text-headline-lg-mobile sm:text-headline-lg font-bold text-on-surface tracking-tight">
                Explore Ideas
              </h1>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl leading-relaxed">
                Browse ideas posted by people who need help building or refining them. Anyone can jump in, collaborate, or offer advice.
              </p>
            </div>

            <div className="flex items-center gap-space-sm bg-surface-container-high px-space-md py-space-xs rounded-xl self-start lg:self-auto">
              <span className="material-symbols-outlined text-[16px] text-secondary">link</span>
              <span className="font-code-sm text-[13px] text-on-surface-variant">Filter link:</span>
              <code className="font-code-sm text-[13px] text-secondary font-mono tracking-tight">
                {uriPreview}
              </code>
            </div>
          </div>

          {/* Search, Sort & Filter Controls */}
          <div className="flex flex-col gap-space-md bg-surface-container-low p-space-md sm:p-space-lg rounded-2xl">
            <div className="flex flex-col md:flex-row gap-space-md items-center">
              <div className="relative flex-1 w-full">
                <span className="material-symbols-outlined absolute left-space-md top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] pointer-events-none">
                  search
                </span>
                <input
                  type="text"
                  value={q}
                  onChange={(e) => updateParam('q', e.target.value)}
                  aria-label="Search ideas by title, summary, tags, problem statement, category, or author"
                  placeholder="Search title, summary, tags, problem statement, or @maker..."
                  className="w-full h-11 bg-surface-container-highest rounded-lg pl-11 pr-10 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:bg-surface-bright transition-all"
                />
                {q && (
                  <button
                    type="button"
                    onClick={() => updateParam('q', '')}
                    aria-label="Clear search"
                    className="min-w-[36px] min-h-[36px] absolute right-1.5 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface flex items-center justify-center rounded"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-space-sm w-full md:w-auto">
                <div className="relative w-full sm:w-auto">
                  <select
                    aria-label="Sort ideas"
                    value={sort}
                    onChange={(e) => updateParam('sort', e.target.value)}
                    className="w-full sm:w-52 h-11 appearance-none bg-surface-container-highest text-on-surface font-title-md text-title-md px-space-md pr-9 rounded-lg focus:outline-none cursor-pointer"
                  >
                    <option value="newest">Newest first</option>
                    <option value="connected">Most connected</option>
                    <option value="urgent">Needs builder first</option>
                  </select>
                  <span className="material-symbols-outlined absolute right-space-sm top-1/2 -translate-y-1/2 pointer-events-none text-on-surface-variant text-[18px]">
                    expand_more
                  </span>
                </div>

                {user && (
                  <button
                    type="button"
                    onClick={() => updateParam('saved', savedOnly ? '' : '1')}
                    className={`min-h-[44px] px-space-md rounded-lg font-title-md text-title-md transition-colors flex items-center gap-space-xs whitespace-nowrap ${
                      savedOnly
                        ? 'bg-primary-container text-on-primary'
                        : 'bg-surface-container-highest text-on-surface hover:bg-surface-bright'
                    }`}
                    title="Filter by your bookmarked ideas"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {savedOnly ? 'bookmark_added' : 'bookmark'}
                    </span>
                    <span>Saved ({savedBookmarks.length})</span>
                  </button>
                )}

                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setSimulatedZeroState((prev) => !prev)}
                    className={`min-h-[44px] px-space-md rounded-lg font-title-md text-title-md transition-colors flex items-center gap-space-xs whitespace-nowrap ${
                      simulatedZeroState
                        ? 'bg-primary-container text-on-primary'
                        : 'bg-surface-container-highest text-on-surface hover:bg-surface-bright'
                    }`}
                    title="Toggle to preview zero results empty state"
                  >
                    <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
                    <span className="hidden sm:inline">Simulate</span> Zero State
                  </button>
                )}
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center justify-between flex-wrap gap-2 text-on-surface-variant font-code-sm text-code-sm">
                <span>
                  Query scope (<code className="text-secondary">q</code>): {SEARCHABLE_FIELDS_SUMMARY}
                </span>
                {canUseDirectFirestoreCursor && (
                  <span className="text-secondary">Firestore Cursor Pagination Active</span>
                )}
              </div>
            )}

            {/* Category Filter Chips - only shown if category has at least 1 idea */}
            <div className="flex flex-wrap items-center gap-space-xs pt-space-xs">
              <span className="font-code-sm text-[13px] text-on-surface-variant font-medium mr-space-xs">
                Category:
              </span>
              {[
                { key: 'all', label: `All (${taxonomyCounts.all})`, count: taxonomyCounts.all },
                { key: 'software', label: `Software (${taxonomyCounts.software})`, count: taxonomyCounts.software },
                { key: 'hardware', label: `Hardware (${taxonomyCounts.hardware})`, count: taxonomyCounts.hardware },
                { key: 'ai', label: `AI (${taxonomyCounts.ai})`, count: taxonomyCounts.ai },
                { key: 'web', label: `Web (${taxonomyCounts.web})`, count: taxonomyCounts.web },
                { key: 'opensource', label: `Open Source (${taxonomyCounts.opensource})`, count: taxonomyCounts.opensource },
                { key: 'other', label: `Other (${taxonomyCounts.other})`, count: taxonomyCounts.other },
              ]
                .filter((item) => item.key === 'all' || item.count > 0)
                .map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => updateParam('cat', item.key)}
                    className={`min-h-[36px] px-3.5 rounded-full font-label-md text-[13px] transition-colors ${
                      cat.toLowerCase() === item.key
                        ? 'bg-primary-container text-on-primary font-semibold'
                        : 'bg-surface-container-highest text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
            </div>

            {/* Track & Lifecycle Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md pt-space-xs">
              <div className="flex flex-col gap-space-xs">
                <span className="font-code-sm text-[13px] text-on-surface-variant font-medium">
                  Track
                </span>
                <div className="inline-flex p-1 bg-surface-container-highest rounded-lg w-full max-w-md">
                  {[
                    { key: 'all', label: 'All Tracks' },
                    { key: 'guidance', label: 'Needs Guidance' },
                    { key: 'builder', label: 'Needs a Builder' },
                  ].map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => updateParam('track', t.key)}
                      className={`flex-1 min-h-[38px] rounded font-label-md text-[13px] transition-all ${
                        track === t.key
                          ? 'bg-surface-container text-on-surface font-semibold shadow-sm'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-space-xs">
                <span className="font-code-sm text-code-sm text-on-surface-variant uppercase tracking-wider">
                  Lifecycle Status
                </span>
                <div className="flex flex-wrap items-center gap-space-xs">
                  <button
                    type="button"
                    onClick={() => updateParam('status', 'all')}
                    className={`min-h-[38px] px-space-md rounded-lg font-label-md text-label-md transition-colors ${
                      status === 'all'
                        ? 'bg-surface-container text-on-surface font-semibold'
                        : 'bg-surface-container-highest text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    All Statuses
                  </button>
                  <button
                    type="button"
                    onClick={() => updateParam('status', 'open')}
                    className={`min-h-[38px] px-space-md rounded-lg font-label-md text-label-md flex items-center gap-1.5 transition-colors ${
                      status === 'open'
                        ? 'bg-surface-container text-on-surface font-semibold'
                        : 'bg-surface-container-highest text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-primary-container" />
                    Open
                  </button>
                  <button
                    type="button"
                    onClick={() => updateParam('status', 'in-progress')}
                    className={`min-h-[38px] px-space-md rounded-lg font-label-md text-label-md flex items-center gap-1.5 transition-colors ${
                      status === 'in-progress'
                        ? 'bg-surface-container text-on-surface font-semibold'
                        : 'bg-surface-container-highest text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-secondary" />
                    In Progress
                  </button>
                  <button
                    type="button"
                    onClick={() => updateParam('status', 'built')}
                    className={`min-h-[38px] px-space-md rounded-lg font-label-md text-label-md flex items-center gap-1.5 transition-colors ${
                      status === 'built'
                        ? 'bg-surface-container text-on-surface font-semibold'
                        : 'bg-surface-container-highest text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-tertiary" />
                    Built
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-margin py-space-xl w-full">
        {ideasError && (
          <div className="mb-space-md p-4 rounded-xl bg-surface-container-high border border-primary/30 font-code-sm text-code-sm text-on-surface-variant flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px] text-primary">info</span>
            <span>{ideasError}</span>
          </div>
        )}

        <div className="flex items-center justify-between pb-space-lg">
          <div className="flex items-baseline gap-space-sm">
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Community Specifications
            </h2>
            <span className="font-code-sm text-[13px] text-secondary bg-surface-container-high px-2.5 py-0.5 rounded-full font-medium">
              {filteredIdeas.length} active {filteredIdeas.length === 1 ? 'idea' : 'ideas'}
            </span>
          </div>
          <Link
            to="/connections"
            title="See how related ideas connect"
            className="hidden sm:flex items-center gap-space-xs font-code-sm text-[13px] text-on-surface-variant hover:text-secondary transition-colors"
          >
            <span className="material-symbols-outlined text-[16px] text-secondary">hub</span>
            <span>Open Idea Map →</span>
          </Link>
        </div>

        {ideasLoading || cursorLoading ? (
          <IdeaCardSkeletonGrid count={6} />
        ) : paginatedIdeas.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20 px-space-md bg-surface-container-low rounded-2xl">
            <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant mb-space-md">
              <span className="material-symbols-outlined text-[32px]">manage_search</span>
            </div>
            <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">
              No specs found matching filters
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-md mt-space-xs mb-space-lg">
              No active nodes align with your current track or category intersection. Ideas stay
              yours—deploy the initial hypothesis.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-space-md">
              <button
                type="button"
                onClick={resetAllFilters}
                className="min-h-[44px] px-space-lg bg-surface-container-highest text-on-surface font-title-md text-title-md rounded-lg hover:bg-surface-bright transition-colors"
              >
                Reset All Filters
              </button>
              <Link
                to="/post/basics"
                className="min-h-[44px] px-space-lg bg-primary-container text-on-primary font-title-md text-title-md rounded-lg hover:opacity-90 transition-opacity inline-flex items-center gap-space-xs"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Post this idea
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-lg">
            {paginatedIdeas.map((idea) => {
              const hasActivity = (idea.volunteerCount || 0) > 0 || (idea.connectionCount || 0) > 0;
              const problemLine = idea.problem?.trim() || idea.summary;

              return (
                <article
                  key={idea.id}
                  className="group flex flex-col justify-between bg-surface-container-low hover:bg-surface-container rounded-2xl p-space-lg transition-all duration-200 border border-surface-variant/30 hover:border-surface-variant/60"
                >
                  <div className="flex flex-col gap-space-md">
                    {/* Header tags: Category & Track & Status */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {idea.category && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-md text-[13px] capitalize">
                            {idea.category}
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full font-label-md text-[13px] font-medium ${
                            idea.helpTrack === 'builder'
                              ? 'bg-primary-container/20 text-primary'
                              : 'bg-secondary/15 text-secondary'
                          }`}
                        >
                          {idea.helpTrack === 'builder' ? 'Needs a Builder' : 'Needs Guidance'}
                        </span>
                        {idea.adminVerified && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/15 text-secondary font-code-sm text-[12px] font-semibold"
                            title="Reviewed and verified"
                          >
                            <span className="material-symbols-outlined text-[13px]">verified</span>
                            <span>Verified</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <BookmarkButton idea={idea} variant="icon" />
                      </div>
                    </div>

                    {/* Title & One-line Problem Statement */}
                    <div className="flex flex-col gap-1.5">
                      <Link to={`/ideas/${idea.id}`}>
                        <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface group-hover:text-primary transition-colors leading-snug">
                          {idea.title}
                        </h3>
                      </Link>
                      <p className="font-body-md text-[14px] text-on-surface-variant line-clamp-3 leading-relaxed">
                        {problemLine}
                      </p>
                    </div>

                    {/* What help do you need (if present) */}
                    {idea.helpWanted && (
                      <div className="px-3 py-2 rounded-xl bg-surface-container-highest/60 border border-surface-variant/30 text-[13px] text-on-surface-variant flex items-start gap-2">
                        <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">
                          handshake
                        </span>
                        <div className="line-clamp-2">
                          <strong className="text-on-surface font-medium">Help needed: </strong>
                          {idea.helpWanted}
                        </div>
                      </div>
                    )}

                    {/* Tags */}
                    {idea.tags && idea.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-space-xs">
                        {idea.tags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => updateParam('q', tag)}
                            className="font-code-sm text-[13px] bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface px-2.5 py-0.5 rounded transition-colors"
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer metadata: Author, Time, Activity & View Idea */}
                  <div className="flex flex-col gap-space-sm pt-space-md mt-space-md bg-surface-container-lowest/50 -mx-space-lg -mb-space-lg p-space-lg rounded-b-2xl border-t border-surface-variant/20">
                    <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-[13px]">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/u/${idea.authorUsername}`}
                          className="flex items-center gap-2 hover:text-primary transition-colors"
                        >
                          <span className="w-6 h-6 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-code-sm text-[11px] font-bold">
                            {(idea.authorUsername || 'A').slice(0, 2).toUpperCase()}
                          </span>
                          <span className="text-on-surface font-label-md text-[13px] font-medium">
                            @{idea.authorUsername}
                          </span>
                        </Link>
                        {(idea.authorUsername === 'admin' || idea.authorUsername === 'cardboardboxmask') && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-bold uppercase tracking-wider">
                            Admin
                          </span>
                        )}
                      </div>
                      <span className="text-on-surface-variant text-[13px]">
                        {formatRelativeTime(idea.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-3 font-body-sm text-[13px] text-on-surface-variant">
                        {hasActivity ? (
                          <>
                            {idea.volunteerCount > 0 && (
                              <Link
                                to={`/ideas/${idea.id}/volunteers`}
                                className="flex items-center gap-1 hover:text-on-surface"
                                title="Volunteers"
                              >
                                <span className="material-symbols-outlined text-[16px]">group</span>
                                <span>{idea.volunteerCount}</span>
                              </Link>
                            )}
                            {idea.connectionCount > 0 && (
                              <Link
                                to={`/ideas/${idea.id}/connections`}
                                className="flex items-center gap-1 text-secondary hover:text-on-surface"
                                title="Connected ideas"
                              >
                                <span className="material-symbols-outlined text-[16px]">scatter_plot</span>
                                <span>{idea.connectionCount}</span>
                              </Link>
                            )}
                            {idea.responseCount > 0 && (
                              <Link
                                to={`/ideas/${idea.id}/responses`}
                                className="flex items-center gap-1 hover:text-on-surface"
                                title="Responses"
                              >
                                <span className="material-symbols-outlined text-[16px]">chat_bubble</span>
                                <span>{idea.responseCount}</span>
                              </Link>
                            )}
                          </>
                        ) : (
                          <span className="text-secondary font-medium text-[13px] flex items-center gap-1">
                            <span className="material-symbols-outlined text-[15px]">volunteer_activism</span>
                            <span>Be the first to help</span>
                          </span>
                        )}
                      </div>

                      <Link
                        to={`/ideas/${idea.id}`}
                        className="inline-flex items-center gap-1 font-title-md text-[14px] text-primary hover:text-primary-container font-semibold transition-colors"
                      >
                        View idea
                        <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Pagination & Permalink Bar */}
        <div className="mt-space-xl pt-space-lg flex flex-col sm:flex-row items-center justify-between gap-space-md">
          <div className="flex items-center gap-space-xs flex-wrap">
            {safePage > 2 && (
              <button
                type="button"
                onClick={() => updateParam('page', '1')}
                className="min-h-[44px] px-3 rounded-lg bg-surface-container-high text-on-surface hover:bg-surface-bright font-code-sm text-code-sm"
              >
                First
              </button>
            )}
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => updateParam('page', String(safePage - 1))}
              className="min-h-[44px] px-space-md rounded-lg bg-surface-container-high text-on-surface disabled:text-on-surface-variant disabled:cursor-not-allowed disabled:opacity-50 font-title-md text-title-md flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              Previous
            </button>
            <span className="px-space-md font-code-sm text-code-sm text-on-surface-variant">
              Page {safePage} of {totalPages}
              {!hasNextPage && paginatedIdeas.length > 0 && ' • End of results'}
            </span>
            <button
              type="button"
              disabled={!hasNextPage}
              onClick={() => updateParam('page', String(safePage + 1))}
              className="min-h-[44px] px-space-md rounded-lg bg-surface-container-high text-on-surface disabled:text-on-surface-variant disabled:cursor-not-allowed disabled:opacity-50 font-title-md text-title-md flex items-center gap-1"
            >
              Next
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </div>

          <div className="flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-xs rounded-lg">
            <span className="material-symbols-outlined text-[16px] text-primary">share</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Permanent registry link:
            </span>
            <button
              type="button"
              onClick={handleCopyQueryLink}
              className="min-h-[36px] font-code-sm text-code-sm text-primary hover:underline flex items-center gap-1"
            >
              Copy Synapse Query
            </button>
          </div>
        </div>
      </div>

      {/* Constellation Graph Banner */}
      <div className="max-w-7xl mx-auto px-4 sm:px-margin pb-space-xl w-full">
        <div className="relative overflow-hidden bg-gradient-to-r from-surface-container-low to-surface-container-high p-space-lg rounded-2xl flex flex-col md:flex-row items-center justify-between gap-space-lg">
          <div className="flex items-start gap-space-md">
            <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
              <span className="material-symbols-outlined text-[26px]">network_node</span>
            </div>
            <div className="flex flex-col">
              <h3 className="font-title-md text-title-md font-semibold text-on-surface">
                Explore the Constellation Graph
              </h3>
              <p className="font-body-sm text-body-sm text-on-surface-variant max-w-xl">
                Prefer spatial navigation over structured grids? Explore our 2D topological map
                visualizing semantic links between research specs, repos, and solo makers.
              </p>
            </div>
          </div>
          <Link
            to="/connections"
            className="inline-flex items-center justify-center min-h-[44px] px-space-lg bg-surface-bright text-on-surface hover:text-secondary font-title-md text-title-md rounded-lg transition-colors whitespace-nowrap gap-space-xs"
          >
            Launch Topology
            <span className="material-symbols-outlined text-[18px]">satellite_alt</span>
          </Link>
        </div>
      </div>
    </div>
  );
};
