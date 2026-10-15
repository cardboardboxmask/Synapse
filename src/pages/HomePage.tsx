import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { BookmarkButton } from '../components/BookmarkButton';
import { PageMeta } from '../components/PageMeta';
import { IdeaCardSkeletonGrid } from '../components/Skeletons';
import { formatRelativeTime } from '../utils/sanitize';

export const HomePage: React.FC = () => {
  const { ideas, ideasLoading } = useApp();
  const [selectedCat, setSelectedCat] = useState<string>('all');

  const catCounts = useMemo(() => {
    return {
      all: ideas.length,
      Software: ideas.filter((i) => i.category === 'Software').length,
      Hardware: ideas.filter((i) => i.category === 'Hardware').length,
      AI: ideas.filter((i) => i.category === 'AI').length,
      Web: ideas.filter((i) => i.category === 'Web').length,
      Other: ideas.filter((i) => i.category === 'Other').length,
    };
  }, [ideas]);

  // Only show category filter chips if that category has at least 1 idea (never show (0))
  const visibleCategories = useMemo(() => {
    const list: { key: string; label: string }[] = [];
    if (catCounts.all > 0) {
      list.push({ key: 'all', label: `All (${catCounts.all})` });
    }
    if (catCounts.Software > 0) {
      list.push({ key: 'Software', label: `Software (${catCounts.Software})` });
    }
    if (catCounts.Hardware > 0) {
      list.push({ key: 'Hardware', label: `Hardware (${catCounts.Hardware})` });
    }
    if (catCounts.AI > 0) {
      list.push({ key: 'AI', label: `AI (${catCounts.AI})` });
    }
    if (catCounts.Web > 0) {
      list.push({ key: 'Web', label: `Web (${catCounts.Web})` });
    }
    if (catCounts.Other > 0) {
      list.push({ key: 'Other', label: `Other (${catCounts.Other})` });
    }
    return list;
  }, [catCounts]);

  const filteredRecentIdeas = useMemo(() => {
    const base =
      selectedCat === 'all' ? ideas : ideas.filter((i) => i.category === selectedCat);
    return base.slice(0, 4);
  }, [ideas, selectedCat]);

  return (
    <div className="flex flex-col w-full">
      <PageMeta
        title="Synapse — Connect ideas, collaborate with builders"
        description="Have an idea but can't build it? Post it here. Builders can pick it up, improve it, or help you make it real."
      />

      {/* Ambient Glow Backdrop */}
      <div className="relative w-full overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[850px] h-[450px] bg-gradient-to-b from-primary-container/10 via-secondary/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute top-96 -left-32 w-80 h-80 bg-secondary/10 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* 1. HERO SECTION */}
        <section className="max-w-7xl mx-auto px-4 sm:px-margin pt-4 pb-space-lg sm:pt-20 sm:pb-20 w-full flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-space-xs bg-surface-container-high px-space-md py-1 rounded-full shadow-sm mb-space-sm sm:mb-space-md">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="font-label-sm text-label-sm text-secondary tracking-widest uppercase font-semibold">
              100% Free · Volunteer-Run · No Ads · Non-Profit
            </span>
          </div>

          <h1 className="font-headline-xl text-headline-xl-mobile sm:text-headline-xl text-on-surface max-w-4xl tracking-tight leading-tight mb-space-xs sm:mb-space-sm">
            Connect ideas, collaborate with builders, build together.
          </h1>

          <p className="font-body-md sm:font-body-lg text-body-md sm:text-body-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed mb-space-md sm:mb-space-lg">
            Have an idea but can't build it? Post it here. Builders can pick it up, improve it, or help you make it real.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-space-sm sm:gap-space-md w-full sm:w-auto">
            <Link
              to="/post/basics"
              className="w-full sm:w-auto min-h-[48px] px-space-xl inline-flex items-center justify-center gap-space-xs bg-primary-container text-on-primary font-title-md text-title-md rounded-lg shadow-md hover:opacity-95 transition-all"
            >
              <span className="material-symbols-outlined text-[20px]">add_circle</span>
              <span>Post your idea</span>
            </Link>
            <Link
              to="/explore"
              className="w-full sm:w-auto min-h-[48px] px-space-xl inline-flex items-center justify-center gap-space-xs bg-surface-container-high text-on-surface font-title-md text-title-md rounded-lg shadow-sm hover:bg-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">explore</span>
              <span>Explore community ideas</span>
            </Link>
          </div>

          {/* Friendly encouragement line */}
          <p className="text-[13px] text-on-surface-variant/90 font-body-sm mt-3.5">
            Can't build? Post it anyway. That's what this is for.
          </p>

          {/* Live Ethos Bar */}
          <div className="mt-space-lg pt-space-md max-w-3xl w-full grid grid-cols-2 md:grid-cols-4 gap-space-md text-left">
            <div className="bg-surface-container-low p-space-md rounded-2xl">
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Idea IP Rights
              </div>
              <div className="font-headline-sm text-headline-sm text-primary font-bold mt-1">
                100% Yours
              </div>
              <div className="text-[13px] text-on-surface-variant/90 mt-1 leading-snug">
                Ideas are shared openly so people can help. You remain the author and owner.
              </div>
            </div>
            <div className="bg-surface-container-low p-space-md rounded-2xl">
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Platform Fee
              </div>
              <div className="font-headline-sm text-headline-sm text-secondary font-bold mt-1">
                $0.00
              </div>
              <div className="text-[13px] text-on-surface-variant/90 mt-1">
                Free and non-profit
              </div>
            </div>
            <div className="bg-surface-container-low p-space-md rounded-2xl">
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Commitment
              </div>
              <div className="font-headline-sm text-headline-sm text-on-surface font-bold mt-1">
                Optional
              </div>
              <div className="text-[13px] text-on-surface-variant/90 mt-1">
                Help as much as you wish
              </div>
            </div>
            <div className="bg-surface-container-low p-space-md rounded-2xl">
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Ecosystem
              </div>
              <div className="font-headline-sm text-headline-sm text-tertiary-container font-bold mt-1">
                Community-built
              </div>
              <div className="text-[13px] text-on-surface-variant/90 mt-1">
                {ideas.length > 0
                  ? `${ideas.length} ${ideas.length === 1 ? 'idea' : 'ideas'} live`
                  : 'Be the first to post'}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 2. RECENT IDEAS FEED (Moved right after Hero) */}
      <section className="w-full bg-surface-container-lowest py-space-xl sm:py-20" id="recent-feed">
        <div className="max-w-7xl mx-auto px-4 sm:px-margin">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-space-xl gap-space-md">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-code-sm text-[13px] mb-space-xs">
                <span className="w-2 h-2 rounded-full bg-primary-container" />
                Live Community Registry
              </div>
              <h2 className="font-headline-lg text-headline-lg-mobile sm:text-headline-lg text-on-surface tracking-tight">
                Recent Ideas Feed
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Open ideas shared directly by community members. Transparent, collaborative, and free.
              </p>
            </div>

            {/* Category Filter Buttons - ONLY show categories with at least 1 idea */}
            {visibleCategories.length > 1 && (
              <div className="flex flex-wrap items-center gap-space-xs">
                {visibleCategories.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedCat(item.key)}
                    className={`min-h-[44px] px-space-md rounded-lg text-[13px] font-label-md transition-colors ${
                      selectedCat === item.key
                        ? 'bg-primary-container text-on-primary font-semibold'
                        : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {ideasLoading ? (
            <IdeaCardSkeletonGrid count={4} />
          ) : filteredRecentIdeas.length === 0 ? (
            /* Friendly Empty State Card */
            <div className="bg-surface-container-low rounded-2xl p-10 sm:p-14 text-center flex flex-col items-center gap-space-md border border-surface-variant/30">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-[32px]">lightbulb</span>
              </div>
              <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">
                Post the next idea
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-md leading-relaxed">
                Have a concept, a problem that frustrates you, or an app you wish existed? Post it here and let builders help you make it real.
              </p>
              <Link
                to="/post/basics"
                className="min-h-[48px] px-space-xl rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-2 shadow-md hover:opacity-95 transition-opacity"
              >
                <span className="material-symbols-outlined text-[20px]">add_circle</span>
                <span>Post the next idea</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
              {filteredRecentIdeas.map((idea) => {
                const oneLineProblem = idea.problem
                  ? idea.problem.split('\n')[0].slice(0, 140)
                  : '';

                return (
                  <article
                    key={idea.id}
                    className="bg-surface-container-low p-space-lg sm:p-space-xl rounded-2xl shadow-sm hover:bg-surface-container transition-all flex flex-col justify-between group border border-surface-variant/30"
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-space-sm mb-space-md">
                        <div className="flex items-center gap-space-xs flex-wrap">
                          <span className="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface text-[13px] font-semibold uppercase tracking-wide">
                            {idea.category}
                          </span>
                          <span
                            className={`px-2.5 py-1 rounded-full text-[13px] uppercase font-semibold ${
                              idea.helpTrack === 'builder'
                                ? 'bg-primary/10 text-primary'
                                : 'bg-tertiary/10 text-tertiary'
                            }`}
                          >
                            {idea.helpTrack === 'builder' ? 'Needs a Builder' : 'Needs Guidance'}
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-highest text-on-surface text-[13px] capitalize">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                idea.status === 'open'
                                  ? 'bg-primary-container'
                                  : idea.status === 'in-progress'
                                  ? 'bg-secondary'
                                  : 'bg-tertiary'
                              }`}
                            />
                            {idea.status.replace('-', ' ')}
                          </span>
                          {idea.adminVerified && (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary/15 text-secondary text-[13px] font-semibold uppercase tracking-wide"
                              title="Reviewed and verified by a Synapse Administrator"
                            >
                              <span
                                className="material-symbols-outlined text-[14px]"
                                aria-hidden="true"
                              >
                                verified
                              </span>
                              <span>Verified</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-space-xs">
                          <BookmarkButton idea={idea} variant="icon" />
                        </div>
                      </div>

                      {/* Title */}
                      <Link to={`/ideas/${idea.id}`} className="block">
                        <h3 className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors mb-2 font-semibold">
                          {idea.title}
                        </h3>
                      </Link>

                      {/* One-line problem statement (if present) */}
                      {oneLineProblem && (
                        <div className="mb-2 text-[13px] text-error-container/90 bg-error/10 px-2.5 py-1 rounded-md inline-block max-w-full truncate">
                          <span className="font-semibold text-error mr-1">Problem:</span>
                          <span className="text-on-surface-variant">{oneLineProblem}</span>
                        </div>
                      )}

                      {/* Summary */}
                      <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-md line-clamp-3">
                        {idea.summary}
                      </p>

                      {/* What help do you need? (if present) */}
                      {idea.helpWanted && (
                        <div className="mb-space-md p-2.5 rounded-lg bg-surface-container text-[13px] text-on-surface-variant flex items-start gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">
                            help
                          </span>
                          <p className="line-clamp-2">
                            <strong className="text-on-surface">Help needed:</strong> {idea.helpWanted}
                          </p>
                        </div>
                      )}

                      {/* Connection / Idea Map Preview Bar */}
                      <div className="bg-surface-container-lowest p-space-md rounded-xl mb-space-md flex items-center justify-between gap-3">
                        <div className="flex items-center gap-space-sm min-w-0">
                          <svg
                            className="text-secondary shrink-0"
                            width="32"
                            height="20"
                            viewBox="0 0 40 24"
                            fill="none"
                            aria-hidden="true"
                          >
                            <circle cx="8" cy="12" r="4" fill="currentColor" />
                            <circle cx="32" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
                            <circle cx="30" cy="18" r="3" stroke="currentColor" strokeWidth="1.5" />
                            <line
                              x1="12"
                              y1="12"
                              x2="29"
                              y2="7"
                              stroke="currentColor"
                              strokeWidth="1.2"
                              strokeDasharray="2 2"
                            />
                            <line
                              x1="12"
                              y1="12"
                              x2="27"
                              y2="17"
                              stroke="currentColor"
                              strokeWidth="1.2"
                            />
                          </svg>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] text-on-surface font-medium truncate">
                              {idea.connectionCount > 0
                                ? `${idea.connectionCount} ${
                                    idea.connectionCount === 1 ? 'connection' : 'connections'
                                  }`
                                : 'Open to connections'}
                            </span>
                            {idea.tags && idea.tags.length > 0 && (
                              <span className="text-[13px] text-on-surface-variant truncate">
                                {idea.tags.slice(0, 3).map((t) => `#${t}`).join(' ')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* View idea button */}
                        <Link
                          to={`/ideas/${idea.id}`}
                          className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-primary-container text-on-primary font-title-md text-[13px] font-semibold hover:opacity-95 transition-opacity inline-flex items-center gap-1 shrink-0"
                        >
                          <span>View idea</span>
                          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                        </Link>
                      </div>
                    </div>

                    {/* Card Footer: author, friendly counts, time */}
                    <div className="pt-space-md flex items-center justify-between border-t border-surface-variant/20 text-[13px]">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to={`/u/${idea.authorUsername}`}
                          className="text-[13px] text-on-surface font-medium hover:text-primary transition-colors"
                        >
                          @{idea.authorUsername}
                        </Link>
                        {(idea.authorUsername === 'admin' || idea.authorUsername === 'cardboardboxmask') && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary font-bold uppercase tracking-wider">
                            Admin
                          </span>
                        )}
                      </div>
                      <div className="text-[13px] text-on-surface-variant flex items-center gap-2">
                        <span>
                          {idea.volunteerCount > 0
                            ? `${idea.volunteerCount} ${
                                idea.volunteerCount === 1 ? 'volunteer' : 'volunteers'
                              }`
                            : 'Be the first to help'}
                        </span>
                        <span>·</span>
                        <span>{formatRelativeTime(idea.createdAt)}</span>
                      </div>
                    </div>
                  </article>
                );
              })}

              {/* If fewer than 3 ideas exist, show a friendly empty-state card alongside them */}
              {filteredRecentIdeas.length < 3 && (
                <div className="bg-surface-container-low/80 border-2 border-dashed border-surface-variant/60 p-space-lg sm:p-space-xl rounded-2xl flex flex-col items-center justify-center text-center gap-space-md min-h-[260px]">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[24px]">add_circle</span>
                  </div>
                  <div>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold mb-1">
                      Post the next idea
                    </h3>
                    <p className="text-[13px] text-on-surface-variant max-w-xs mx-auto">
                      Got an idea in mind? Share it with the community and let someone help bring it to life.
                    </p>
                  </div>
                  <Link
                    to="/post/basics"
                    className="min-h-[44px] px-space-lg rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-1.5 shadow-sm hover:opacity-95 transition-opacity"
                  >
                    <span>Post the next idea</span>
                    <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                  </Link>
                </div>
              )}
            </div>
          )}

          <div className="mt-space-xl flex justify-center">
            <Link
              to="/explore"
              className="min-h-[44px] px-space-lg inline-flex items-center gap-space-xs bg-surface-container-high hover:bg-surface-variant text-on-surface font-title-md text-title-md rounded-lg transition-colors"
            >
              <span>Explore all ideas</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>
        </div>
      </section>

      {/* 3. HOW SYNAPSE WORKS (3 Steps) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-margin py-space-xl sm:py-20 w-full">
        <div className="text-center max-w-2xl mx-auto mb-space-xl">
          <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest font-semibold block mb-space-xs">
            Simple &amp; Open
          </span>
          <h2 className="font-headline-lg text-headline-lg-mobile sm:text-headline-lg text-on-surface tracking-tight mb-space-sm">
            How Synapse Works
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            No pitches, no lock-ins, and no gatekeepers. Transparent collaboration for anyone with an idea.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg relative">
          <div className="bg-surface-container-low p-space-lg rounded-2xl shadow-sm relative flex flex-col justify-between border border-surface-variant/30">
            <div>
              <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center text-primary font-headline-md font-bold mb-space-md">
                01
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs">
                Post your idea
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-md">
                Choose your track (Needs Guidance vs. Needs a Builder). Describe what problem you're solving and what help you need. Ideas are shared openly so people can help. You remain the author and owner.
              </p>
            </div>
            <div className="bg-surface-container p-space-sm rounded-lg flex items-center gap-space-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-secondary text-[18px]">
                lock_open
              </span>
              <span className="text-[13px]">Creator-owned license attribution</span>
            </div>
          </div>

          <div className="bg-surface-container-low p-space-lg rounded-2xl shadow-sm relative flex flex-col justify-between border border-surface-variant/30">
            <div>
              <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary font-headline-md font-bold mb-space-md">
                02
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs">
                Connect &amp; Guide
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-md">
                Volunteers connect related ideas on the Idea Map. Leave feedback on plans or designs, link open tools, or check feasibility without committing to a full build.
              </p>
            </div>
            <div
              className="bg-surface-container p-space-sm rounded-lg flex items-center gap-space-xs text-on-surface-variant"
              title="See how related ideas connect"
            >
              <span className="material-symbols-outlined text-secondary text-[18px]">hub</span>
              <span className="text-[13px]">Idea Map · See how related ideas connect</span>
            </div>
          </div>

          <div className="bg-surface-container-low p-space-lg rounded-2xl shadow-sm relative flex flex-col justify-between border border-surface-variant/30">
            <div>
              <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center text-tertiary font-headline-md font-bold mb-space-md">
                03
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs">
                Build &amp; Ship
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-md">
                Form small teams. When you make the prototype or first version, publish documentation to the Showcase to inspire other community members.
              </p>
            </div>
            <div className="bg-surface-container p-space-sm rounded-lg flex items-center gap-space-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-secondary text-[18px]">
                rocket_launch
              </span>
              <span className="text-[13px]">Community-wide public showcase</span>
            </div>
          </div>
        </div>
      </section>

      {/* 4. TWO WAYS TO GET HELP (Interactive Tracks) */}
      <section className="w-full bg-surface-container-lowest py-space-xl sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-margin">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-space-xl gap-space-md">
            <div className="max-w-xl">
              <span className="font-label-sm text-label-sm text-secondary uppercase tracking-widest font-semibold block mb-space-xs">
                Collaboration Paths
              </span>
              <h2 className="font-headline-lg text-headline-lg-mobile sm:text-headline-lg text-on-surface tracking-tight">
                Two ways to get help
              </h2>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
              Clear boundaries make collaboration easy. Choose whether you want feedback on your approach or someone to build it with you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
            {/* Card 1: Needs Guidance */}
            <div className="bg-surface-container-low p-space-xl rounded-2xl flex flex-col justify-between shadow-sm relative overflow-hidden group hover:bg-surface-container transition-all border border-surface-variant/30">
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-space-xs font-semibold">
                  Needs Guidance
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant mb-space-lg leading-relaxed">
                  For people who plan to build it themselves and want feedback on their plan, design, or approach.
                </p>
                <div className="space-y-space-sm mb-space-lg">
                  <div className="flex items-start gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span className="text-[14px]">
                      Feedback on your plan, design, or approach
                    </span>
                  </div>
                  <div className="flex items-start gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span className="text-[14px]">
                      Sanity checks and guidance from experienced builders
                    </span>
                  </div>
                  <div className="flex items-start gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span className="text-[14px]">
                      Lightweight discussions with no ongoing obligation
                    </span>
                  </div>
                </div>
              </div>

              {/* One clear button */}
              <div className="pt-space-md">
                <Link
                  to="/explore?track=guidance"
                  className="w-full min-h-[46px] rounded-xl bg-tertiary/15 text-tertiary hover:bg-tertiary/25 font-title-md text-title-md flex items-center justify-center gap-2 transition-colors"
                >
                  <span>Find guidance</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </Link>
              </div>
            </div>

            {/* Card 2: Needs a Builder */}
            <div className="bg-surface-container-low p-space-xl rounded-2xl flex flex-col justify-between shadow-sm relative overflow-hidden group hover:bg-surface-container transition-all border border-surface-variant/30">
              <div>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-space-xs font-semibold">
                  Needs a Builder
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant mb-space-lg leading-relaxed">
                  For people with great ideas or domain knowledge who need a software or hardware builder to help make it real.
                </p>
                <div className="space-y-space-sm mb-space-lg">
                  <div className="flex items-start gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span className="text-[14px]">
                      Web apps, mobile apps, hardware CAD, firmware, or prototypes
                    </span>
                  </div>
                  <div className="flex items-start gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span className="text-[14px]">
                      Clear, friendly volunteer ground rules
                    </span>
                  </div>
                  <div className="flex items-start gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span className="text-[14px]">
                      Direct collaboration with the idea author
                    </span>
                  </div>
                </div>
              </div>

              {/* One clear button */}
              <div className="pt-space-md">
                <Link
                  to="/explore?track=builder"
                  className="w-full min-h-[46px] rounded-xl bg-primary-container text-on-primary font-title-md text-title-md flex items-center justify-center gap-2 hover:opacity-95 transition-opacity shadow-sm"
                >
                  <span>Find something to build</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. COMMITMENT SECTION */}
      <section className="max-w-7xl mx-auto px-4 sm:px-margin py-space-xl sm:py-20 w-full">
        <div className="relative bg-gradient-to-r from-surface-container-low via-surface-container to-surface-container-low p-space-xl sm:p-14 rounded-2xl shadow-xl overflow-hidden border border-surface-variant/30">
          <div className="absolute -right-20 -bottom-20 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl flex flex-col items-start">
            <div className="inline-flex items-center gap-space-xs bg-primary/10 px-space-sm py-1 rounded-full text-primary font-code-sm text-[13px] mb-space-md font-semibold">
              <span className="material-symbols-outlined text-[16px]">fingerprint</span>
              The Synapse Commitment
            </div>
            <h2 className="font-headline-lg text-headline-lg-mobile sm:text-headline-lg text-on-surface tracking-tight mb-space-sm">
              No investor pressure, no data harvesting. Just people making things.
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed mb-space-xl">
              Synapse was created by one developer tired of idea graveyards, paywalled builder
              portals, and social platforms designed to extract engagement rather than foster
              tangible collaboration. Ideas are shared openly so people can help. You remain the
              author and owner.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-space-md w-full sm:w-auto">
              <Link
                to="/post/basics"
                className="w-full sm:w-auto min-h-[48px] px-space-xl inline-flex items-center justify-center gap-space-xs bg-primary-container text-on-primary font-title-md text-title-md rounded-lg shadow-md hover:opacity-95 transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">send</span>
                <span>Post your idea</span>
              </Link>
              <Link
                to="/about"
                className="w-full sm:w-auto min-h-[48px] px-space-xl inline-flex items-center justify-center gap-space-xs bg-surface-container-high text-on-surface font-title-md text-title-md rounded-lg shadow-sm hover:bg-surface-variant transition-colors"
              >
                <span>Read Solo Maker Manifesto</span>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
