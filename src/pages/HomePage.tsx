import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { BookmarkButton } from '../components/BookmarkButton';
import { PageMeta } from '../components/PageMeta';
import { IdeaCardSkeletonGrid } from '../components/Skeletons';
import { formatRelativeTime } from '../utils/sanitize';

export const HomePage: React.FC = () => {
  const { ideas, ideasLoading } = useApp();
  const [selectedCat, setSelectedCat] = useState<'all' | 'Software' | 'Hardware' | 'AI' | 'Web'>('all');

  const guidanceCount = useMemo(
    () => ideas.filter((i) => i.helpTrack === 'guidance').length,
    [ideas]
  );
  const builderCount = useMemo(
    () => ideas.filter((i) => i.helpTrack === 'builder').length,
    [ideas]
  );

  const catCounts = useMemo(() => {
    return {
      all: ideas.length,
      Software: ideas.filter((i) => i.category === 'Software').length,
      Hardware: ideas.filter((i) => i.category === 'Hardware').length,
      AI: ideas.filter((i) => i.category === 'AI').length,
      Web: ideas.filter((i) => i.category === 'Web').length,
    };
  }, [ideas]);

  const filteredRecentIdeas = useMemo(() => {
    const base =
      selectedCat === 'all' ? ideas : ideas.filter((i) => i.category === selectedCat);
    return base.slice(0, 4);
  }, [ideas, selectedCat]);

  return (
    <div className="flex flex-col w-full">
      <PageMeta
        title="Synapse — Connect ideas, find builders, turn sparks into reality"
        description="Synapse is a free, volunteer-run, non-profit community where anyone can post an idea, connect complementary ideas, give guidance, or volunteer to build."
      />

      {/* Ambient Glow Backdrop */}
      <div className="relative w-full overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[850px] h-[450px] bg-gradient-to-b from-primary-container/10 via-secondary/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute top-96 -left-32 w-80 h-80 bg-secondary/10 rounded-full blur-3xl pointer-events-none -z-10" />

        {/* HERO SECTION */}
        <section className="max-w-7xl mx-auto px-4 sm:px-margin pt-space-xl pb-space-xl sm:pt-24 sm:pb-28 w-full flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-space-xs bg-surface-container-high px-space-md py-1.5 rounded-full shadow-sm mb-space-lg">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="font-label-sm text-label-sm text-secondary tracking-widest uppercase font-semibold">
              100% Free · Volunteer-Run · No Ads · Non-Profit
            </span>
          </div>

          <h1 className="font-headline-xl text-headline-xl-mobile sm:text-headline-xl text-on-surface max-w-4xl tracking-tight leading-tight mb-space-md">
            Connect ideas, find builders, turn sparks into reality.
          </h1>

          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto leading-relaxed mb-space-xl">
            Synapse is a community where anyone can post an idea—software, hardware, or beyond.
            Keep complete ownership of what you create. Connect complementary ideas, give advice,
            or volunteer to build together.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-space-md w-full sm:w-auto">
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

          {/* Live Ethos Bar */}
          <div className="mt-space-xl pt-space-lg max-w-3xl w-full grid grid-cols-2 md:grid-cols-4 gap-space-md text-left">
            <div className="bg-surface-container-low p-space-md rounded-2xl">
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Idea IP Rights
              </div>
              <div className="font-headline-sm text-headline-sm text-primary font-bold mt-1">
                100% Yours
              </div>
              <div className="font-code-sm text-code-sm text-on-surface-variant mt-0.5">
                Strict zero-claim license
              </div>
            </div>
            <div className="bg-surface-container-low p-space-md rounded-2xl">
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Platform Fee
              </div>
              <div className="font-headline-sm text-headline-sm text-secondary font-bold mt-1">
                $0.00
              </div>
              <div className="font-code-sm text-code-sm text-on-surface-variant mt-0.5">
                Funded by solo maker
              </div>
            </div>
            <div className="bg-surface-container-low p-space-md rounded-2xl">
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Commitment
              </div>
              <div className="font-headline-sm text-headline-sm text-on-surface font-bold mt-1">
                Optional
              </div>
              <div className="font-code-sm text-code-sm text-on-surface-variant mt-0.5">
                Help as much as you wish
              </div>
            </div>
            <div className="bg-surface-container-low p-space-md rounded-2xl">
              <div className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Ecosystem Status
              </div>
              <div className="font-headline-sm text-headline-sm text-tertiary-container font-bold mt-1">
                Bootstrapped
              </div>
              <div className="font-code-sm text-code-sm text-on-surface-variant mt-0.5">
                {ideas.length} {ideas.length === 1 ? 'spark' : 'sparks'} live
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* INTERACTIVE HELP TRACKS BREAKDOWN */}
      <section className="w-full bg-surface-container-lowest py-space-xl sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-margin">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-space-xl gap-space-md">
            <div className="max-w-xl">
              <span className="font-label-sm text-label-sm text-secondary uppercase tracking-widest font-semibold block mb-space-xs">
                Dual Collaboration Paths
              </span>
              <h2 className="font-headline-lg text-headline-lg-mobile sm:text-headline-lg text-on-surface tracking-tight">
                Two distinct ways to seek assistance
              </h2>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
              Clear collaboration boundaries prevent misunderstandings. Every submission chooses one
              of two functional tracks.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
            {/* Track A: Needs Guidance */}
            <div className="bg-surface-container-low p-space-xl rounded-2xl flex flex-col justify-between shadow-sm relative overflow-hidden group hover:bg-surface-container transition-all">
              <div className="absolute top-0 right-0 p-space-lg pointer-events-none opacity-10">
                <span className="material-symbols-outlined text-[100px] text-tertiary">
                  lightbulb
                </span>
              </div>
              <div>
                <div className="flex items-center justify-between gap-space-sm mb-space-md">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tertiary/10 text-tertiary font-label-md text-label-md uppercase tracking-wider font-semibold">
                    <span className="material-symbols-outlined text-[16px]">school</span>
                    Track A
                  </span>
                  <span className="font-code-sm text-code-sm text-tertiary font-medium">
                    {guidanceCount} Active {guidanceCount === 1 ? 'Initiative' : 'Initiatives'}
                  </span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-space-xs">
                  Needs Guidance
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant mb-space-lg leading-relaxed">
                  For makers with technical, hardware, or research capacity who can build it
                  themselves and want architectural direction, protocol critique, or domain-specific
                  sanity checks.
                </p>
                <div className="space-y-space-sm mb-space-lg">
                  <div className="flex items-start gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span className="font-body-sm text-body-sm">
                      Architecture review, RFCs, and protocol critique
                    </span>
                  </div>
                  <div className="flex items-start gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span className="font-body-sm text-body-sm">
                      Domain expert office-hours &amp; peer sanity checks
                    </span>
                  </div>
                  <div className="flex items-start gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span className="font-body-sm text-body-sm">
                      No operational time obligation; lightweight advisory threads
                    </span>
                  </div>
                </div>
              </div>
              <div className="pt-space-md bg-surface-container-high/40 p-space-md rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <div className="w-8 h-8 rounded-full bg-tertiary/20 flex items-center justify-center text-tertiary font-semibold text-label-sm">
                    AG
                  </div>
                  <div className="flex flex-col">
                    <span className="font-title-md text-title-md text-on-surface leading-tight">
                      Advisory Guild
                    </span>
                    <span className="font-code-sm text-code-sm text-on-surface-variant">
                      Volunteers ready to review
                    </span>
                  </div>
                </div>
                <Link
                  to="/explore?track=guidance"
                  className="min-h-[44px] inline-flex items-center gap-1 font-label-md text-label-md text-tertiary hover:underline"
                >
                  Browse Guidance
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </Link>
              </div>
            </div>

            {/* Track B: Needs a Builder */}
            <div className="bg-surface-container-low p-space-xl rounded-2xl flex flex-col justify-between shadow-sm relative overflow-hidden group hover:bg-surface-container transition-all">
              <div className="absolute top-0 right-0 p-space-lg pointer-events-none opacity-10">
                <span className="material-symbols-outlined text-[100px] text-primary">
                  code_blocks
                </span>
              </div>
              <div>
                <div className="flex items-center justify-between gap-space-sm mb-space-md">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary font-label-md text-label-md uppercase tracking-wider font-semibold">
                    <span className="material-symbols-outlined text-[16px]">handshake</span>
                    Track B
                  </span>
                  <span className="font-code-sm text-code-sm text-primary font-medium">
                    {builderCount} Active {builderCount === 1 ? 'Initiative' : 'Initiatives'}
                  </span>
                </div>
                <h3 className="font-headline-md text-headline-md text-on-surface mb-space-xs">
                  Needs a Builder
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant mb-space-lg leading-relaxed">
                  For thinkers, field practitioners, and visionaries who have identified urgent
                  real-world problems but cannot build the software or hardware prototype alone.
                </p>
                <div className="space-y-space-sm mb-space-lg">
                  <div className="flex items-start gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span className="font-body-sm text-body-sm">
                      Open source prototypes, hardware CAD, firmware &amp; web apps
                    </span>
                  </div>
                  <div className="flex items-start gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span className="font-body-sm text-body-sm">
                      Explicit non-exploitative volunteer ground rules
                    </span>
                  </div>
                  <div className="flex items-start gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-[20px] shrink-0 mt-0.5">
                      check_circle
                    </span>
                    <span className="font-body-sm text-body-sm">
                      Direct author communication via open repositories &amp; channels
                    </span>
                  </div>
                </div>
              </div>
              <div className="pt-space-md bg-surface-container-high/40 p-space-md rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-label-sm">
                    VE
                  </div>
                  <div className="flex flex-col">
                    <span className="font-title-md text-title-md text-on-surface leading-tight">
                      Volunteer Etiquette
                    </span>
                    <span className="font-code-sm text-code-sm text-on-surface-variant">
                      Zero-pressure collaboration
                    </span>
                  </div>
                </div>
                <Link
                  to="/explore?track=builder"
                  className="min-h-[44px] inline-flex items-center gap-1 font-label-md text-label-md text-primary hover:underline"
                >
                  Browse Builds
                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS (3 Steps) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-margin py-space-xl sm:py-24 w-full">
        <div className="text-center max-w-2xl mx-auto mb-space-xl">
          <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest font-semibold block mb-space-xs">
            Simple Protocol
          </span>
          <h2 className="font-headline-lg text-headline-lg-mobile sm:text-headline-lg text-on-surface tracking-tight mb-space-sm">
            How Synapse Works
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant">
            No venture capital pitches, no proprietary lock-ins, and no vanity upvotes. Transparent
            collaborative momentum.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg relative">
          <div className="bg-surface-container-low p-space-lg rounded-2xl shadow-sm relative flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center text-primary font-headline-md font-bold mb-space-md">
                01
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs">
                Post your idea
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-md">
                Choose your track (Needs Guidance vs. Needs a Builder). Document the problem scope,
                current hypothesis, and specific help required. Your idea remains 100% your
                intellectual property.
              </p>
            </div>
            <div className="bg-surface-container p-space-sm rounded-lg flex items-center gap-space-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-secondary text-[18px]">
                lock_open
              </span>
              <span className="font-code-sm text-code-sm">Creator-owned license attribution</span>
            </div>
          </div>

          <div className="bg-surface-container-low p-space-lg rounded-2xl shadow-sm relative flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary font-headline-md font-bold mb-space-md">
                02
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs">
                Connect &amp; Guide
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-md">
                Volunteers cross-link overlapping ideas on the Constellation Map. Leave technical
                feedback, link existing open libraries, or validate feasibility without signing onto
                a multi-month project.
              </p>
            </div>
            <div className="bg-surface-container p-space-sm rounded-lg flex items-center gap-space-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-secondary text-[18px]">hub</span>
              <span className="font-code-sm text-code-sm">Network cross-pollination map</span>
            </div>
          </div>

          <div className="bg-surface-container-low p-space-lg rounded-2xl shadow-sm relative flex flex-col justify-between">
            <div>
              <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center text-tertiary font-headline-md font-bold mb-space-md">
                03
              </div>
              <h3 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs">
                Build &amp; Ship
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-md">
                Form autonomous micro-teams. When you build the prototype, publish documentation to
                the Synapse Showcase. Inspire the next cohort of solo makers with your shipped code
                and field notes.
              </p>
            </div>
            <div className="bg-surface-container p-space-sm rounded-lg flex items-center gap-space-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-secondary text-[18px]">
                rocket_launch
              </span>
              <span className="font-code-sm text-code-sm">Community-wide public showcase</span>
            </div>
          </div>
        </div>
      </section>

      {/* RECENT IDEAS FEED */}
      <section className="w-full bg-surface-container-lowest py-space-xl sm:py-24" id="recent-feed">
        <div className="max-w-7xl mx-auto px-4 sm:px-margin">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-space-xl gap-space-md">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-code-sm text-code-sm mb-space-xs">
                <span className="w-2 h-2 rounded-full bg-primary-container" />
                Bootstrap Seed Stage
              </div>
              <h2 className="font-headline-lg text-headline-lg-mobile sm:text-headline-lg text-on-surface tracking-tight">
                Recent Ideas Feed
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Genuine starter proposals authored by the founder and community submissions. Zero
                fabricated stats or vanity bots.
              </p>
            </div>

            {/* Category Filter Buttons */}
            <div className="flex flex-wrap items-center gap-space-xs">
              {(
                [
                  { key: 'all', label: `All (${catCounts.all})` },
                  { key: 'Software', label: `Software (${catCounts.Software})` },
                  { key: 'Hardware', label: `Hardware (${catCounts.Hardware})` },
                  { key: 'AI', label: `AI (${catCounts.AI})` },
                  { key: 'Web', label: `Web (${catCounts.Web})` },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelectedCat(item.key)}
                  className={`min-h-[44px] px-space-md rounded-lg font-label-md text-label-md transition-colors ${
                    selectedCat === item.key
                      ? 'bg-primary-container text-on-primary font-semibold'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {ideasLoading ? (
            <IdeaCardSkeletonGrid count={4} />
          ) : filteredRecentIdeas.length === 0 ? (
            <div className="bg-surface-container-low rounded-2xl p-12 text-center flex flex-col items-center gap-space-md">
              <span className="material-symbols-outlined text-[36px] text-on-surface-variant">
                lightbulb
              </span>
              <h3 className="font-headline-sm text-headline-sm text-on-surface">
                No ideas in this category yet
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
                Be the first maker to post a specification in this category.
              </p>
              <Link
                to="/post/basics"
                className="min-h-[44px] px-space-lg rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                Post your idea
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
              {filteredRecentIdeas.map((idea) => (
                <article
                  key={idea.id}
                  className="bg-surface-container-low p-space-lg rounded-2xl shadow-sm hover:bg-surface-container transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-space-sm mb-space-md">
                      <div className="flex items-center gap-space-xs flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm font-semibold uppercase">
                          {idea.category}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-label-sm text-label-sm uppercase font-semibold ${
                            idea.helpTrack === 'builder'
                              ? 'bg-primary/10 text-primary'
                              : 'bg-tertiary/10 text-tertiary'
                          }`}
                        >
                          {idea.helpTrack === 'builder' ? 'Needs a Builder' : 'Needs Guidance'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-label-sm text-label-sm capitalize">
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
                            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary/15 text-secondary font-code-sm text-[11px] font-semibold uppercase tracking-wide"
                            title="Reviewed and verified by a Synapse Administrator"
                          >
                            <span
                              className="material-symbols-outlined text-[14px]"
                              aria-hidden="true"
                            >
                              verified
                            </span>
                            <span>Admin Verified</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-space-xs">
                        <Link
                          to={`/ideas/${idea.id}/connections`}
                          className="flex items-center gap-1 text-secondary font-code-sm text-code-sm hover:underline"
                        >
                          <span className="material-symbols-outlined text-[16px]">account_tree</span>
                          <span>
                            {idea.connectionCount}{' '}
                            {idea.connectionCount === 1 ? 'connection' : 'connections'}
                          </span>
                        </Link>
                        <BookmarkButton idea={idea} variant="icon" />
                      </div>
                    </div>

                    <Link to={`/ideas/${idea.id}`} className="block">
                      <h3 className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors mb-space-xs">
                        {idea.title}
                      </h3>
                    </Link>

                    <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-md line-clamp-3">
                      {idea.summary}
                    </p>

                    {/* Constellation Preview Graphic */}
                    <div className="bg-surface-container-lowest p-space-md rounded-xl mb-space-md flex items-center justify-between gap-2">
                      <div className="flex items-center gap-space-sm">
                        <svg
                          className="text-secondary shrink-0"
                          width="40"
                          height="24"
                          viewBox="0 0 40 24"
                          fill="none"
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
                        <div className="flex flex-col">
                          <span className="font-label-sm text-label-sm text-on-surface">
                            {idea.connectionCount > 0
                              ? `Connected to ${idea.connectionCount} ${
                                  idea.connectionCount === 1 ? 'node' : 'nodes'
                                }`
                              : 'Ready for node cross-linking'}
                          </span>
                          <span className="font-code-sm text-code-sm text-on-surface-variant">
                            Tags: {idea.tags.slice(0, 3).map((t) => `#${t}`).join(', ')}
                          </span>
                        </div>
                      </div>
                      <Link
                        to={`/ideas/${idea.id}`}
                        className="font-code-sm text-code-sm text-secondary bg-secondary/10 px-2.5 py-1 rounded hover:bg-secondary/20 transition-colors shrink-0"
                      >
                        Open Spec →
                      </Link>
                    </div>
                  </div>

                  <div className="pt-space-md flex items-center justify-between border-t border-surface-variant/20">
                    {idea.isSeed ? (
                      <div className="flex items-center gap-space-xs">
                        <span className="material-symbols-outlined text-[16px] text-primary">
                          volunteer_activism
                        </span>
                        <span className="font-code-sm text-code-sm text-primary font-medium">
                          Starter idea from the founder
                        </span>
                      </div>
                    ) : (
                      <Link
                        to={`/u/${idea.authorUsername}`}
                        className="font-code-sm text-code-sm text-on-surface hover:text-primary"
                      >
                        @{idea.authorUsername}
                      </Link>
                    )}
                    <div className="font-code-sm text-code-sm text-on-surface-variant">
                      {idea.volunteerCount}{' '}
                      {idea.volunteerCount === 1 ? 'volunteer' : 'volunteers'} ·{' '}
                      {formatRelativeTime(idea.createdAt)}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          <div className="mt-space-xl flex justify-center">
            <Link
              to="/explore"
              className="min-h-[44px] px-space-lg inline-flex items-center gap-space-xs bg-surface-container-high hover:bg-surface-variant text-on-surface font-title-md text-title-md rounded-lg transition-colors"
            >
              <span>Explore all ideas and search filters</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
          </div>
        </div>
      </section>

      {/* HONEST SOLO MAKER CALL TO ACTION BANNER */}
      <section className="max-w-7xl mx-auto px-4 sm:px-margin py-space-xl sm:py-24 w-full">
        <div className="relative bg-gradient-to-r from-surface-container-low via-surface-container to-surface-container-low p-space-xl sm:p-16 rounded-2xl shadow-xl overflow-hidden">
          <div className="absolute -right-20 -bottom-20 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl flex flex-col items-start">
            <div className="inline-flex items-center gap-space-xs bg-primary/10 px-space-sm py-1 rounded-full text-primary font-code-sm text-code-sm mb-space-md font-semibold">
              <span className="material-symbols-outlined text-[16px]">fingerprint</span>
              The Synapse Commitment
            </div>
            <h2 className="font-headline-lg text-headline-lg-mobile sm:text-headline-lg text-on-surface tracking-tight mb-space-sm">
              No investor pressure, no data harvesting. Just people making things.
            </h2>
            <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed mb-space-xl">
              Synapse was created by one developer tired of idea graveyards, paywalled builder
              portals, and social platforms designed to extract engagement rather than foster
              tangible collaboration. We will never sell your contact info, gatekeep ideas behind
              subscriptions, or stake claims to your prototypes.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-space-md w-full sm:w-auto">
              <Link
                to="/post/basics"
                className="w-full sm:w-auto min-h-[48px] px-space-xl inline-flex items-center justify-center gap-space-xs bg-primary-container text-on-primary font-title-md text-title-md rounded-lg shadow-md hover:opacity-95 transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">send</span>
                <span>Publish your first idea</span>
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
