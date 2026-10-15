import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { BookmarkButton } from '../components/BookmarkButton';
import { PageMeta } from '../components/PageMeta';
import { updateIdeaDetails, SOLE_ADMIN_UID } from '../firebase';
import { formatRelativeTime } from '../utils/sanitize';

export const ShowcasePage: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const { user, ideas, showToast, isAdmin } = useApp();
  const navigate = useNavigate();

  const builtIdeas = useMemo(() => ideas.filter((i) => i.status === 'built'), [ideas]);
  const myOpenIdeas = useMemo(
    () =>
      user
        ? ideas.filter(
            (i) =>
              (i.authorId === user.uid ||
                i.authorUid === user.uid ||
                (isAdmin &&
                  (i.authorId === SOLE_ADMIN_UID ||
                    i.authorUid === SOLE_ADMIN_UID ||
                    i.authorUsername === 'admin' ||
                    i.authorUsername === 'cardboardboxmask'))) &&
              i.status !== 'built'
          )
        : [],
    [ideas, user, isAdmin]
  );

  const [showMarkBuiltModal, setShowMarkBuiltModal] = useState(false);
  const [selectedIdeaId, setSelectedIdeaId] = useState('');
  const [repoUrl, setRepoUrl] = useState('');
  const [credits, setCredits] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // If viewing /showcase/:id
  const detailIdea = useMemo(
    () => (id ? ideas.find((i) => i.id === id) : undefined),
    [ideas, id]
  );

  const handleOpenMarkBuilt = () => {
    if (!user) {
      showToast('Sign in with Google to publish a finished build to Showcase.', 'info');
      navigate('/login?returnTo=%2Fshowcase');
      return;
    }
    if (myOpenIdeas.length === 0) {
      showToast('Post an idea first, or manage an existing idea you authored.', 'info');
      navigate('/post/basics');
      return;
    }
    setSelectedIdeaId(myOpenIdeas[0].id);
    setShowMarkBuiltModal(true);
  };

  const handleMarkBuiltSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIdeaId) return;
    setSaving(true);
    try {
      await updateIdeaDetails(selectedIdeaId, {
        status: 'built',
        showcaseUrl: repoUrl,
        showcaseCredits: credits,
        showcaseNotes: notes,
      });
      setShowMarkBuiltModal(false);
      showToast('Idea marked as Built and added to the Showcase!', 'success');
    } catch {
      showToast('Could not update idea.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (id && detailIdea) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-margin py-space-xl flex flex-col gap-space-lg">
        <PageMeta
          title={`${detailIdea.title} — Built Showcase on Synapse`}
          description={detailIdea.summary}
        />
        <Link
          to="/showcase"
          className="font-code-sm text-code-sm text-secondary hover:underline inline-flex items-center gap-1"
        >
          ← Back to Showcase
        </Link>
        <div className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-md">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full bg-tertiary/20 text-tertiary font-code-sm text-code-sm w-fit uppercase">
              Shipped Build
            </span>
            {detailIdea.adminVerified && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-secondary/15 text-secondary font-code-sm text-code-sm font-semibold uppercase">
                <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                  verified
                </span>
                <span>Admin Verified</span>
              </span>
            )}
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">
            {detailIdea.title}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">
            {detailIdea.showcaseNotes || detailIdea.summary}
          </p>
          {detailIdea.showcaseCredits && (
            <div className="p-space-md rounded-xl bg-surface-container">
              <span className="font-code-sm text-code-sm text-primary uppercase block">
                Contributor Credits
              </span>
              <p className="font-body-md text-body-md text-on-surface mt-1">
                {detailIdea.showcaseCredits}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-3 pt-2">
            {detailIdea.showcaseUrl && (
              <a
                href={detailIdea.showcaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-5 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-2"
              >
                <span>Open Project Repository / Demo</span>
                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
              </a>
            )}
            <Link
              to={`/ideas/${detailIdea.id}`}
              className="min-h-[44px] px-5 rounded-lg bg-surface-container-high text-on-surface font-title-md text-title-md inline-flex items-center gap-2"
            >
              View Original Spec
            </Link>
            <BookmarkButton idea={detailIdea} variant="button" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-margin py-space-xl flex flex-col gap-space-xl">
      <PageMeta
        title="Community Showcase — Shipped Builds on Synapse"
        description="Finished open-source prototypes and community builds with contributor credit."
      />

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
        <div>
          <span className="font-code-sm text-code-sm text-tertiary uppercase tracking-wider block mb-1">
            Shipped Prototypes &amp; Contributor Credits
          </span>
          <h1 className="font-headline-lg text-headline-lg-mobile sm:text-headline-lg text-on-surface">
            Synapse Showcase
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-1">
            When an idea moves from Open to Built, its author can link the finished repository or
            prototype and credit the volunteers who helped build it.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenMarkBuilt}
          className="min-h-[48px] px-space-xl rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-2 self-start md:self-auto"
        >
          <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
          <span>Mark an Idea as Built</span>
        </button>
      </div>

      {builtIdeas.length === 0 ? (
        <div className="bg-surface-container-low rounded-2xl p-12 text-center flex flex-col items-center gap-space-md">
          <div className="w-16 h-16 rounded-full bg-surface-container-highest text-tertiary flex items-center justify-center">
            <span className="material-symbols-outlined text-[32px]">rocket_launch</span>
          </div>
          <h2 className="font-headline-md text-headline-md text-on-surface">
            No ideas marked Built yet
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-md leading-relaxed">
            Browse ideas that need a builder, or mark one of your own ideas as Built once a prototype ships!
          </p>
          <div className="flex flex-wrap justify-center gap-space-md">
            <Link
              to="/explore?track=builder"
              className="min-h-[44px] px-6 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-2"
            >
              Browse Ideas Needing Builders
            </Link>
            <button
              type="button"
              onClick={handleOpenMarkBuilt}
              className="min-h-[44px] px-6 rounded-lg bg-surface-container-high text-on-surface font-title-md text-title-md inline-flex items-center gap-2"
            >
              Submit a Finished Build
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-lg">
          {builtIdeas.map((idea) => (
            <article
              key={idea.id}
              className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col justify-between gap-space-md"
            >
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-tertiary/20 text-tertiary font-label-sm text-label-sm uppercase">
                      Built
                    </span>
                    {idea.adminVerified && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary/15 text-secondary font-code-sm text-[11px] font-semibold uppercase">
                        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                          verified
                        </span>
                        <span>Admin Verified</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-code-sm text-code-sm text-on-surface-variant">
                      {formatRelativeTime(idea.updatedAt)}
                    </span>
                    <BookmarkButton idea={idea} variant="icon" />
                  </div>
                </div>
                <Link to={`/showcase/${idea.id}`}>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface hover:text-primary">
                    {idea.title}
                  </h3>
                </Link>
                <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-3">
                  {idea.showcaseNotes || idea.summary}
                </p>
                {idea.showcaseCredits && (
                  <div className="mt-2 p-2.5 rounded-lg bg-surface-container font-code-sm text-code-sm text-primary">
                    Credits: {idea.showcaseCredits}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-space-sm border-t border-surface-variant/20">
                <Link
                  to={`/u/${idea.authorUsername}`}
                  className="font-code-sm text-code-sm text-on-surface-variant hover:text-on-surface"
                >
                  @{idea.authorUsername}
                </Link>
                <Link
                  to={`/showcase/${idea.id}`}
                  className="font-title-md text-title-md text-secondary hover:underline"
                >
                  View Showcase →
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {showMarkBuiltModal && (
        <div
          className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface-container w-full max-w-lg rounded-2xl p-space-xl flex flex-col gap-space-md shadow-2xl">
            <h3 className="font-headline-sm text-headline-sm text-on-surface">
              Mark Your Idea as Built
            </h3>
            <form onSubmit={handleMarkBuiltSubmit} className="flex flex-col gap-space-md">
              <div>
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                  Select Your Idea
                </label>
                <select
                  value={selectedIdeaId}
                  onChange={(e) => setSelectedIdeaId(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface"
                >
                  {myOpenIdeas.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                  Repository or Live Prototype URL
                </label>
                <input
                  type="url"
                  required
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/..."
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface"
                />
              </div>
              <div>
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                  Contributor Credits
                </label>
                <input
                  type="text"
                  required
                  value={credits}
                  onChange={(e) => setCredits(e.target.value)}
                  placeholder="e.g. Built by @maker1 and @maker2"
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface"
                />
              </div>
              <div>
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                  Build Field Notes
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What did you ship and what did you learn?"
                  className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowMarkBuiltModal(false)}
                  className="min-h-[44px] px-4 rounded-lg text-on-surface-variant"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-6 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md"
                >
                  {saving ? 'Publishing...' : 'Publish to Showcase'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
