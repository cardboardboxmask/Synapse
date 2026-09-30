import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { subscribeToPublicUsers } from '../firebase';
import { Idea, UserProfile } from '../types/synapse';

type SearchScope = 'all' | 'ideas' | 'projects' | 'users';

interface SearchResultItem {
  id: string;
  kind: 'idea' | 'project' | 'user';
  title: string;
  subtitle: string;
  badge: string;
  href: string;
}

export const GlobalSearchBar: React.FC = () => {
  const { ideas } = useApp();
  const navigate = useNavigate();

  const [queryText, setQueryText] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');
  const [isOpen, setIsOpen] = useState(false);
  const [mobileModalOpen, setMobileModalOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [publicUsers, setPublicUsers] = useState<UserProfile[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  const hasQuery = queryText.trim().length > 0;

  // Subscribe to public users only when the user actually types a search query
  useEffect(() => {
    if (!hasQuery) return;
    const unsub = subscribeToPublicUsers(setPublicUsers, 150);
    return () => unsub();
  }, [hasQuery]);

  // Global keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (window.innerWidth < 768) {
          setMobileModalOpen(true);
          setTimeout(() => mobileInputRef.current?.focus(), 50);
        } else {
          inputRef.current?.focus();
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
        setMobileModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Deduplicated directory of users combining Firestore `users` + idea authors
  const allUsers = useMemo(() => {
    const byUsername = new Map<string, { username: string; displayName: string; bio: string }>();

    for (const u of publicUsers) {
      if (!u.username || u.deleted) continue;
      byUsername.set(u.username.toLowerCase(), {
        username: u.username,
        displayName: u.displayName || u.username,
        bio: u.bio || 'Maker on Synapse',
      });
    }

    for (const idea of ideas) {
      if (!idea.authorUsername || idea.authorUsername.startsWith('deleted-')) continue;
      const key = idea.authorUsername.toLowerCase();
      if (!byUsername.has(key)) {
        byUsername.set(key, {
          username: idea.authorUsername,
          displayName: idea.authorName || idea.authorUsername,
          bio: `Author of "${idea.title}"`,
        });
      }
    }

    return Array.from(byUsername.values());
  }, [publicUsers, ideas]);

  // Compute categorized search matches ONLY when the user has typed a search query
  const categorized = useMemo(() => {
    const raw = queryText.trim().toLowerCase();
    const cleanQuery = raw.startsWith('@') ? raw.slice(1) : raw;
    const tokens = cleanQuery ? cleanQuery.split(/\s+/).filter(Boolean) : [];

    // Do not return any items or profiles when the search input is empty
    if (tokens.length === 0) {
      return {
        ideas: [] as SearchResultItem[],
        projects: [] as SearchResultItem[],
        users: [] as SearchResultItem[],
        visible: [] as SearchResultItem[],
        totalCount: 0,
      };
    }

    const matchIdeaOrProject = (idea: Idea): boolean => {
      // If user explicitly prefixed with '@', they are searching for a user profile
      if (raw.startsWith('@')) return false;
      const haystack = [
        idea.title,
        idea.summary,
        idea.problem,
        idea.solution,
        idea.category,
        idea.authorName,
        idea.authorUsername,
        idea.showcaseCredits || '',
        idea.showcaseNotes || '',
        ...idea.tags,
      ]
        .join(' ')
        .toLowerCase();
      return tokens.every((t) => haystack.includes(t));
    };

    const matchingIdeas = ideas
      .filter((i) => i.status !== 'built' && matchIdeaOrProject(i))
      .slice(0, 5)
      .map<SearchResultItem>((i) => ({
        id: `idea-${i.id}`,
        kind: 'idea',
        title: i.title,
        subtitle: `${i.category} · @${i.authorUsername}`,
        badge: i.helpTrack === 'builder' ? 'Needs Builder' : 'Needs Guidance',
        href: `/ideas/${i.id}`,
      }));

    const matchingProjects = ideas
      .filter((i) => (i.status === 'built' || Boolean(i.showcaseUrl)) && matchIdeaOrProject(i))
      .slice(0, 5)
      .map<SearchResultItem>((i) => ({
        id: `project-${i.id}`,
        kind: 'project',
        title: i.title,
        subtitle: i.showcaseCredits || `Built by @${i.authorUsername}`,
        badge: 'Built Project',
        href: `/ideas/${i.id}`,
      }));

    // Only match user profiles when the typed query matches their @username or displayName
    const matchingUsers = allUsers
      .filter((u) => {
        const handleAndName = `${u.username} ${u.displayName}`.toLowerCase();
        return tokens.every((t) => handleAndName.includes(t));
      })
      .slice(0, 5)
      .map<SearchResultItem>((u) => ({
        id: `user-${u.username}`,
        kind: 'user',
        title: u.displayName,
        subtitle: `@${u.username} · ${u.bio}`,
        badge: 'Profile',
        href: `/u/${u.username}`,
      }));

    let visible: SearchResultItem[] = [];
    if (scope === 'ideas') visible = matchingIdeas;
    else if (scope === 'projects') visible = matchingProjects;
    else if (scope === 'users') visible = matchingUsers;
    else {
      visible = [
        ...matchingIdeas.slice(0, 4),
        ...matchingProjects.slice(0, 3),
        ...matchingUsers.slice(0, 3),
      ];
    }

    return {
      ideas: matchingIdeas,
      projects: matchingProjects,
      users: matchingUsers,
      visible,
      totalCount: matchingIdeas.length + matchingProjects.length + matchingUsers.length,
    };
  }, [queryText, scope, ideas, allUsers]);

  useEffect(() => {
    setActiveIndex(-1);
  }, [queryText, scope]);

  const handleSelectResult = (href: string) => {
    setIsOpen(false);
    setMobileModalOpen(false);
    navigate(href);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeIndex >= 0 && activeIndex < categorized.visible.length) {
      handleSelectResult(categorized.visible[activeIndex].href);
      return;
    }
    const trimmed = queryText.trim();
    setIsOpen(false);
    setMobileModalOpen(false);
    if (scope === 'projects') {
      navigate(trimmed ? `/explore?status=built&q=${encodeURIComponent(trimmed)}` : '/showcase');
    } else if (trimmed) {
      navigate(`/explore?q=${encodeURIComponent(trimmed)}`);
    } else {
      navigate('/explore');
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((prev) =>
        categorized.visible.length === 0 ? -1 : (prev + 1) % categorized.visible.length
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIsOpen(true);
      setActiveIndex((prev) =>
        categorized.visible.length === 0
          ? -1
          : (prev - 1 + categorized.visible.length) % categorized.visible.length
      );
    }
  };

  const renderResultsPanel = () => (
    <div className="flex flex-col gap-3">
      {/* Scope Filter Tabs */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-surface-variant/30 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {(
            [
              { id: 'all', label: 'All', count: categorized.totalCount },
              { id: 'ideas', label: 'Ideas', count: categorized.ideas.length },
              { id: 'projects', label: 'Projects', count: categorized.projects.length },
              { id: 'users', label: 'Profiles', count: categorized.users.length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setScope(tab.id)}
              className={`px-2.5 py-1 rounded-lg font-code-sm text-code-sm transition-colors inline-flex items-center gap-1 ${
                scope === tab.id
                  ? 'bg-primary-container text-on-primary font-semibold'
                  : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span>{tab.label}</span>
              <span className="opacity-80">({tab.count})</span>
            </button>
          ))}
        </div>
        {hasQuery && (
          <button
            type="button"
            onClick={() => {
              setQueryText('');
              setIsOpen(false);
            }}
            className="font-code-sm text-code-sm text-on-surface-variant hover:text-on-surface"
          >
            Clear
          </button>
        )}
      </div>

      {/* Results List */}
      {categorized.visible.length === 0 ? (
        <div className="py-6 text-center flex flex-col items-center gap-1.5">
          <span
            className="material-symbols-outlined text-[24px] text-on-surface-variant"
            aria-hidden="true"
          >
            manage_search
          </span>
          <p className="font-body-sm text-body-sm text-on-surface">
            No matching ideas, projects, or profiles found for &ldquo;{queryText.trim()}&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => handleSelectResult(`/explore?q=${encodeURIComponent(queryText.trim())}`)}
            className="mt-1 font-code-sm text-code-sm text-secondary hover:underline"
          >
            Search full specification archive →
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 max-h-[360px] overflow-y-auto pr-1" role="listbox">
          {categorized.visible.map((item, idx) => {
            const isHighlighted = idx === activeIndex;
            const iconName =
              item.kind === 'idea'
                ? 'lightbulb'
                : item.kind === 'project'
                ? 'rocket_launch'
                : 'person';
            const badgeStyle =
              item.kind === 'idea'
                ? 'bg-primary-container/15 text-primary'
                : item.kind === 'project'
                ? 'bg-secondary/15 text-secondary'
                : 'bg-tertiary-container/20 text-tertiary';

            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={isHighlighted}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => handleSelectResult(item.href)}
                className={`w-full text-left p-3 rounded-xl transition-colors flex items-start gap-3 ${
                  isHighlighted
                    ? 'bg-surface-container-highest'
                    : 'hover:bg-surface-container-high'
                }`}
              >
                <span
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${badgeStyle}`}
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    {iconName}
                  </span>
                </span>

                <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-title-md text-title-md text-on-surface font-medium truncate">
                      {item.title}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded font-code-sm text-[10px] uppercase shrink-0 ${badgeStyle}`}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <span className="font-body-sm text-body-sm text-on-surface-variant truncate">
                    {item.subtitle}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Footer Action */}
      <div className="pt-2 border-t border-surface-variant/30 flex items-center justify-between font-code-sm text-code-sm text-on-surface-variant">
        <span>↑↓ to navigate · Enter to open</span>
        <button
          type="button"
          onClick={() =>
            handleSelectResult(
              queryText.trim()
                ? `/explore?q=${encodeURIComponent(queryText.trim())}`
                : '/explore'
            )
          }
          className="text-secondary hover:underline"
        >
          Explore all results →
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop & Tablet Global Search Bar */}
      <div ref={containerRef} className="relative flex-1 min-w-[180px] max-w-xs xl:max-w-sm hidden md:block">
        <form onSubmit={handleFormSubmit} role="search">
          <div className="relative flex items-center">
            <span
              className="material-symbols-outlined absolute left-3 text-on-surface-variant pointer-events-none text-[18px]"
              aria-hidden="true"
            >
              search
            </span>
            <input
              ref={inputRef}
              type="search"
              value={queryText}
              onFocus={() => {
                if (queryText.trim().length > 0) {
                  setIsOpen(true);
                }
              }}
              onChange={(e) => {
                const val = e.target.value;
                setQueryText(val);
                setIsOpen(val.trim().length > 0);
              }}
              onKeyDown={handleInputKeyDown}
              aria-label="Global search for ideas, profiles, or projects"
              aria-expanded={isOpen && hasQuery}
              aria-haspopup="listbox"
              placeholder="Search ideas, @user..."
              className="w-full h-10 bg-surface-container-high border border-surface-variant/50 rounded-lg pl-9 pr-12 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary-container focus:ring-1 focus:ring-primary-container transition-all"
            />
            <kbd className="hidden xl:inline-flex items-center px-1.5 py-0.5 rounded bg-surface-container-lowest border border-surface-variant/40 font-code-sm text-[11px] text-on-surface-variant absolute right-2 pointer-events-none">
              ⌘K
            </kbd>
          </div>
        </form>

        {/* Wide, readable dropdown popover — only shown when user has typed a search query */}
        {isOpen && hasQuery && (
          <div className="absolute left-0 w-[420px] lg:w-[480px] max-w-[92vw] top-13 z-50 bg-surface-container border border-surface-variant/50 rounded-2xl p-4 shadow-2xl">
            {renderResultsPanel()}
          </div>
        )}
      </div>

      {/* Mobile Search Trigger Button */}
      <button
        type="button"
        onClick={() => {
          setMobileModalOpen(true);
          setTimeout(() => mobileInputRef.current?.focus(), 50);
        }}
        aria-label="Open global search"
        className="md:hidden min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
      >
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
          search
        </span>
      </button>

      {/* Mobile Global Search Modal */}
      {mobileModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-surface-container-lowest/85 backdrop-blur-sm flex items-start justify-center p-4 pt-16 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Global Search"
        >
          <div className="bg-surface-container w-full max-w-lg rounded-2xl p-space-md flex flex-col gap-space-md shadow-2xl border border-surface-variant/50">
            <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
              <div className="relative flex-1 flex items-center">
                <span
                  className="material-symbols-outlined absolute left-3 text-on-surface-variant text-[18px]"
                  aria-hidden="true"
                >
                  search
                </span>
                <input
                  ref={mobileInputRef}
                  type="search"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Search ideas, @username, or projects..."
                  className="w-full h-11 bg-surface-container-high border border-surface-variant/50 rounded-lg pl-10 pr-3 font-body-sm text-body-sm text-on-surface focus:outline-none focus:border-primary-container"
                />
              </div>
              <button
                type="button"
                onClick={() => setMobileModalOpen(false)}
                aria-label="Close search"
                className="min-w-[44px] min-h-[44px] rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  close
                </span>
              </button>
            </form>
            {hasQuery ? (
              renderResultsPanel()
            ) : (
              <p className="py-4 text-center font-code-sm text-code-sm text-on-surface-variant">
                Type an idea title, tag, or @username to search.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
};
