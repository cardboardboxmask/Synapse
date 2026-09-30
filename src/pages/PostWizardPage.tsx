import React, { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { PageMeta } from '../components/PageMeta';
import { RouteSkeleton } from '../components/Skeletons';
import { createNewIdea } from '../firebase';
import { SITE_CONFIG } from '../config/siteConfig';
import { IdeaCategory, IdeaLicense } from '../types/synapse';
import {
  checkRateLimit,
  getLicenseLabel,
  sanitizeTag,
  validateExternalUrl,
} from '../utils/sanitize';

interface PostWizardPageProps {
  step: 1 | 2 | 3;
}

const CATEGORIES: IdeaCategory[] = ['Software', 'Hardware', 'AI', 'Web', 'Other'];

export const PostWizardPage: React.FC<PostWizardPageProps> = ({ step }) => {
  const {
    user,
    profile,
    authLoading,
    ideas,
    draft,
    lastSavedAt,
    draftRestoredFromStorage,
    updateDraft,
    saveDraftNow,
    resetDraft,
    showToast,
  } = useApp();

  const navigate = useNavigate();
  const location = useLocation();

  const [tagInput, setTagInput] = useState('');
  const [dedupQuery, setDedupQuery] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishedIdeaId, setPublishedIdeaId] = useState<string | null>(null);

  // Real-time de-duplication search against actual Firestore ideas
  const effectiveDedupQuery = (dedupQuery || draft.title).trim().toLowerCase();
  const similarIdeas = useMemo(() => {
    if (!effectiveDedupQuery || effectiveDedupQuery.length < 2) {
      return ideas.slice(0, 2);
    }
    const tokens = effectiveDedupQuery.split(/\s+/).filter((w) => w.length >= 2);
    return ideas
      .map((idea) => {
        const hay = `${idea.title} ${idea.summary} ${idea.tags.join(' ')} ${idea.category}`.toLowerCase();
        const hits = tokens.filter((t) => hay.includes(t)).length;
        return { idea, hits };
      })
      .filter((item) => item.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 2)
      .map((item) => item.idea);
  }, [ideas, effectiveDedupQuery]);

  if (authLoading) {
    return <RouteSkeleton />;
  }

  // Protected route: posting requires signup; redirect to /login and return afterward
  if (!user) {
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  const handleAddTag = (raw: string) => {
    const cleaned = sanitizeTag(raw);
    if (!cleaned) return;
    if (draft.tags.includes(cleaned)) {
      setTagInput('');
      return;
    }
    if (draft.tags.length >= 10) {
      showToast('Maximum 10 tags per idea.', 'info');
      return;
    }
    updateDraft({ tags: [...draft.tags, cleaned] });
    setTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    updateDraft({ tags: draft.tags.filter((t) => t !== tagToRemove) });
  };

  const validateStep1 = (): boolean => {
    if (draft.title.trim().length < 5) {
      showToast('Please enter an idea title (at least 5 characters).', 'error');
      return false;
    }
    if (draft.summary.trim().length < 10) {
      showToast('Please write a short 1–2 sentence description (at least 10 characters).', 'error');
      return false;
    }
    if (draft.tags.length === 0) {
      showToast('Please keep or add at least 1 tag so peers can discover your idea.', 'error');
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    if (draft.summary.trim().length < 10) {
      showToast('Please write a short 1–2 sentence summary (at least 10 characters).', 'error');
      return false;
    }
    if (draft.problem.trim().length < 15) {
      showToast('Please describe the problem (at least 15 characters).', 'error');
      return false;
    }
    if (draft.solution.trim().length < 15) {
      showToast('Please describe the proposed idea/solution (at least 15 characters).', 'error');
      return false;
    }
    if (draft.helpWanted.trim().length < 10) {
      showToast('Please specify what help or guidance you are looking for.', 'error');
      return false;
    }
    if (draft.showcaseUrl && draft.showcaseUrl.trim()) {
      const urlCheck = validateExternalUrl(draft.showcaseUrl);
      if (!urlCheck.valid) {
        showToast(urlCheck.error || 'Please enter a valid HTTPS repository/prototype URL.', 'error');
        return false;
      }
    }
    return true;
  };

  const handleGoToStep2 = () => {
    if (validateStep1()) {
      navigate('/post/details');
    }
  };

  const handleGoToStep3 = () => {
    if (validateStep1() && validateStep2()) {
      navigate('/post/review');
    }
  };

  const handlePublish = async () => {
    if (!profile) {
      showToast('Profile is still initializing, please try again.', 'error');
      return;
    }
    if (!validateStep1() || !validateStep2()) return;

    const rl = checkRateLimit(`post-idea-${profile.uid}`, 6000);
    if (!rl.allowed) {
      showToast(`Please wait ${rl.waitSeconds}s before publishing another idea.`, 'error');
      return;
    }

    setPublishing(true);
    try {
      const newId = await createNewIdea(draft, profile);
      resetDraft();
      setPublishedIdeaId(newId);
      showToast('Your idea is now live in the Synapse Registry!', 'success');
    } catch {
      showToast('Could not publish idea. Please check all fields and try again.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  // Published Success View
  if (publishedIdeaId) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-margin py-20">
        <PageMeta
          title="Idea Published — Synapse"
          description="Your idea specification has been published to the open Synapse registry."
        />
        <div className="bg-surface-container-low rounded-2xl p-space-xl sm:p-12 text-center flex flex-col items-center gap-space-lg shadow-xl border border-secondary/30">
          <div className="w-16 h-16 rounded-full bg-secondary/15 text-secondary flex items-center justify-center">
            <span className="material-symbols-outlined text-[36px]">rocket_launch</span>
          </div>
          <div className="flex flex-col gap-space-xs max-w-xl">
            <span className="font-code-sm text-code-sm text-secondary uppercase tracking-widest">
              Broadcast Confirmed
            </span>
            <h1 className="font-headline-lg text-headline-lg text-on-surface">
              Your spark is live on Synapse
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Your specification is now indexed in the Public Idea Nexus. It remains 100% yours
              under your chosen license.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-space-md">
            <Link
              to={`/ideas/${publishedIdeaId}`}
              className="min-h-[48px] px-space-xl rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-2 shadow-md"
            >
              <span>View Published Idea</span>
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setPublishedIdeaId(null);
                navigate('/post/basics');
              }}
              className="min-h-[48px] px-space-lg rounded-lg bg-surface-container-high text-on-surface font-title-md text-title-md inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              Post Another Idea
            </button>
          </div>
        </div>
      </div>
    );
  }

  const licenseInfo = getLicenseLabel(draft.license);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-margin py-space-xl">
      <PageMeta
        title={`Post Your Idea (Step ${step} of 3) — Synapse`}
        description="Post an open software, hardware, AI, or web specification to find volunteer builders or architectural guidance."
      />

      {/* Top Meta Context Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm pb-space-lg mb-space-lg">
        <div className="flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-xs rounded-full flex-wrap">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <span className="font-code-sm text-code-sm text-on-surface-variant">
            {lastSavedAt
              ? `Draft saved locally at ${lastSavedAt} (Schema v2)`
              : 'Draft auto-saved locally in browser (Schema v2)'}{' '}
            · Signed in as @{profile?.username || 'maker'}
          </span>
          {draftRestoredFromStorage && (
            <button
              type="button"
              onClick={() => {
                resetDraft();
                showToast('Restored draft cleared.', 'info');
              }}
              className="ml-2 font-code-sm text-code-sm text-error hover:underline"
            >
              Discard Draft
            </button>
          )}
        </div>
        <div className="flex items-center gap-space-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-[18px] text-primary">terminal</span>
          <span className="font-code-sm text-code-sm uppercase tracking-widest text-on-surface-variant">
            Step {step} of 3 · Creator Owned
          </span>
        </div>
      </div>

      {/* Stepper Navigation */}
      <div className="w-full bg-surface-container-low rounded-2xl p-space-lg mb-space-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md relative">
          {/* Step 1 */}
          <button
            type="button"
            onClick={() => navigate('/post/basics')}
            className={`text-left flex items-start gap-space-sm p-space-md rounded-xl transition-all ${
              step === 1
                ? 'bg-surface-container-high/90'
                : 'bg-surface-container/40 opacity-80 hover:opacity-100'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-md font-headline-sm text-headline-sm flex items-center justify-center shrink-0 ${
                step === 1
                  ? 'bg-primary-container text-on-primary'
                  : step > 1
                  ? 'bg-secondary text-on-secondary'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              1
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className={`font-label-sm text-label-sm uppercase tracking-wider ${
                  step === 1
                    ? 'text-primary'
                    : step > 1
                    ? 'text-secondary'
                    : 'text-on-surface-variant'
                }`}
              >
                {step === 1 ? 'In Progress' : step > 1 ? 'Completed' : 'Step 1'}
              </span>
              <span className="font-headline-sm text-headline-sm text-on-surface truncate">
                Step 1: Basics
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant line-clamp-1">
                Core hypothesis &amp; track intent
              </span>
            </div>
          </button>

          {/* Step 2 */}
          <button
            type="button"
            onClick={handleGoToStep2}
            className={`text-left flex items-start gap-space-sm p-space-md rounded-xl transition-all ${
              step === 2
                ? 'bg-surface-container-high/90'
                : 'bg-surface-container/40 opacity-80 hover:opacity-100'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-md font-headline-sm text-headline-sm flex items-center justify-center shrink-0 ${
                step === 2
                  ? 'bg-primary-container text-on-primary'
                  : step > 2
                  ? 'bg-secondary text-on-secondary'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              2
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className={`font-label-sm text-label-sm uppercase tracking-wider ${
                  step === 2
                    ? 'text-primary'
                    : step > 2
                    ? 'text-secondary'
                    : 'text-on-surface-variant'
                }`}
              >
                {step === 2 ? 'In Progress' : step > 2 ? 'Completed' : 'Upcoming'}
              </span>
              <span className="font-headline-sm text-headline-sm text-on-surface truncate">
                Step 2: Details
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant line-clamp-1">
                Problem, solution, help wanted &amp; license
              </span>
            </div>
          </button>

          {/* Step 3 */}
          <button
            type="button"
            onClick={handleGoToStep3}
            className={`text-left flex items-start gap-space-sm p-space-md rounded-xl transition-all ${
              step === 3
                ? 'bg-surface-container-high/90'
                : 'bg-surface-container/40 opacity-80 hover:opacity-100'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-md font-headline-sm text-headline-sm flex items-center justify-center shrink-0 ${
                step === 3
                  ? 'bg-primary-container text-on-primary'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              3
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className={`font-label-sm text-label-sm uppercase tracking-wider ${
                  step === 3 ? 'text-primary' : 'text-on-surface-variant'
                }`}
              >
                {step === 3 ? 'In Progress' : 'Upcoming'}
              </span>
              <span className="font-headline-sm text-headline-sm text-on-surface truncate">
                Step 3: Review &amp; Publish
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant line-clamp-1">
                Live preview &amp; broadcast
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Main Asymmetric Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl">
        {/* Left 8 Cols: Active Step Form */}
        <div className="lg:col-span-8 flex flex-col gap-space-xl">
          {step === 1 && (
            <>
              {/* Field 1: Idea Title */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div className="flex items-baseline justify-between gap-space-sm">
                  <div>
                    <label
                      htmlFor="idea-title"
                      className="font-title-md text-title-md text-on-surface block"
                    >
                      Idea Title
                    </label>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                      Express the core problem and tangible mechanism in plain terms.
                    </p>
                  </div>
                  <span
                    className={`font-code-sm text-code-sm shrink-0 ${
                      draft.title.length >= 110 ? 'text-primary' : 'text-on-surface-variant'
                    }`}
                  >
                    {draft.title.length}/120
                  </span>
                </div>
                <input
                  id="idea-title"
                  type="text"
                  maxLength={120}
                  value={draft.title}
                  onChange={(e) => updateDraft({ title: e.target.value })}
                  placeholder="e.g. LocalMesh: Offline-first neighborhood emergency network"
                  className="w-full h-12 bg-surface-container-high rounded-lg px-space-md font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest transition-colors"
                />

                <div className="pt-space-xs">
                  <div className="flex items-baseline justify-between gap-space-sm mb-1">
                    <label
                      htmlFor="idea-short-summary"
                      className="font-title-md text-title-md text-on-surface block"
                    >
                      Short Description
                    </label>
                    <span className="font-code-sm text-code-sm text-on-surface-variant">
                      {draft.summary.length}/350
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mb-2">
                    A concise 1–2 sentence overview displayed on Explore and Home cards.
                  </p>
                  <textarea
                    id="idea-short-summary"
                    rows={2}
                    maxLength={350}
                    value={draft.summary}
                    onChange={(e) => updateDraft({ summary: e.target.value })}
                    placeholder="Summarize what this idea does and why it matters in 1–2 crisp sentences..."
                    className="w-full p-3 bg-surface-container-high rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest transition-colors"
                  />
                </div>
              </div>

              {/* Field 2: Select Collaboration Track */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <div className="flex items-center gap-space-xs">
                    <span className="font-title-md text-title-md text-on-surface">
                      Select Collaboration Track
                    </span>
                    <span className="font-code-sm text-code-sm px-space-xs py-0.5 rounded bg-primary/20 text-primary">
                      Required
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                    Set clear expectations. Synapse matches you with peers based on operational
                    needs.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
                  {/* Card 1: Needs a Builder */}
                  <button
                    type="button"
                    onClick={() => updateDraft({ helpTrack: 'builder' })}
                    className={`text-left cursor-pointer rounded-2xl p-space-md transition-all relative flex flex-col justify-between ${
                      draft.helpTrack === 'builder'
                        ? 'bg-surface-container-high ring-2 ring-primary-container'
                        : 'bg-surface-container opacity-85 hover:opacity-100'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-space-sm">
                        <span className="font-label-sm text-label-sm uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Needs a Builder
                        </span>
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center ${
                            draft.helpTrack === 'builder' ? 'bg-primary' : 'bg-surface-variant'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              draft.helpTrack === 'builder'
                                ? 'bg-surface-container-lowest'
                                : 'bg-transparent'
                            }`}
                          />
                        </div>
                      </div>
                      <h4 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs">
                        Need Execution Talent
                      </h4>
                      <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                        You have an idea, vision, or domain problem, but need an engineer,
                        designer, or hardware developer to build the prototype. Volunteering is
                        voluntary and no-commitment.
                      </p>
                    </div>
                    <div className="mt-space-md pt-space-sm flex items-center gap-space-xs text-primary font-code-sm text-code-sm">
                      <span className="material-symbols-outlined text-[16px]">handyman</span>
                      <span>Active Track: Builder Search</span>
                    </div>
                  </button>

                  {/* Card 2: Needs Guidance */}
                  <button
                    type="button"
                    onClick={() => updateDraft({ helpTrack: 'guidance' })}
                    className={`text-left cursor-pointer rounded-2xl p-space-md transition-all relative flex flex-col justify-between ${
                      draft.helpTrack === 'guidance'
                        ? 'bg-surface-container-high ring-2 ring-tertiary-container'
                        : 'bg-surface-container opacity-85 hover:opacity-100'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-space-sm">
                        <span className="font-label-sm text-label-sm uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-tertiary-container/20 text-tertiary flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-tertiary" />
                          Needs Guidance
                        </span>
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center ${
                            draft.helpTrack === 'guidance'
                              ? 'bg-tertiary-container'
                              : 'bg-surface-variant'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              draft.helpTrack === 'guidance'
                                ? 'bg-surface-container-lowest'
                                : 'bg-transparent'
                            }`}
                          />
                        </div>
                      </div>
                      <h4 className="font-headline-sm text-headline-sm text-on-surface mb-space-xs">
                        Need Technical Steering
                      </h4>
                      <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                        You can build it yourself, but need feedback, architecture advice,
                        technical steering, or domain validation from experienced makers.
                      </p>
                    </div>
                    <div className="mt-space-md pt-space-sm flex items-center gap-space-xs text-tertiary font-code-sm text-code-sm">
                      <span className="material-symbols-outlined text-[16px]">explore</span>
                      <span>Advisory &amp; Peer Review</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Field 3: Category & System Tags */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <span className="font-title-md text-title-md text-on-surface block">
                    Category &amp; System Tags
                  </span>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                    Select the primary category and append targeted sub-domain tags.
                  </p>
                </div>

                {/* Primary Category Chips */}
                <div className="flex flex-wrap gap-space-xs">
                  {CATEGORIES.map((catName) => {
                    const selected = draft.category === catName;
                    return (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => updateDraft({ category: catName })}
                        className={`min-h-[38px] px-space-md rounded-full font-label-md text-label-md transition-colors flex items-center gap-1 ${
                          selected
                            ? 'bg-primary-container text-on-primary font-semibold'
                            : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        <span>{catName}</span>
                        {selected && (
                          <span className="material-symbols-outlined text-[14px]">check</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Custom Tag Input */}
                <div className="flex flex-col gap-space-sm pt-space-xs">
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="material-symbols-outlined absolute left-space-sm top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
                        label
                      </span>
                      <input
                        type="text"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ',') {
                            e.preventDefault();
                            handleAddTag(tagInput);
                          }
                        }}
                        placeholder="Add tags (e.g. esp32, python, privacy) and press Enter"
                        className="w-full h-11 bg-surface-container-high rounded-lg pl-10 pr-space-md font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest transition-colors"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddTag(tagInput)}
                      className="min-h-[44px] px-4 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-md text-label-md"
                    >
                      Add Tag
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-space-xs min-h-[32px]">
                    {draft.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-space-xs px-2.5 py-1 rounded bg-surface-container text-secondary font-code-sm text-code-sm"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(t)}
                          aria-label={`Remove tag ${t}`}
                          className="text-on-surface-variant hover:text-error transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Field 4: Synapse De-duplication Engine (Real Firestore ideas query) */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div className="flex items-start justify-between gap-space-md">
                  <div>
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-secondary text-[20px]">
                        hub
                      </span>
                      <h3 className="font-title-md text-title-md text-on-surface">
                        Synapse De-duplication Engine
                      </h3>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                      Type keywords to check if someone posted a similar idea you can connect with
                      instead of duplicating.
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-space-xs px-space-sm py-space-xs bg-secondary/10 rounded text-secondary font-code-sm text-code-sm shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                    Live Cluster Check
                  </div>
                </div>

                <div className="relative">
                  <span className="material-symbols-outlined absolute left-space-sm top-3 text-on-surface-variant text-[18px]">
                    travel_explore
                  </span>
                  <input
                    type="text"
                    value={dedupQuery}
                    onChange={(e) => setDedupQuery(e.target.value)}
                    placeholder={`Search across ${ideas.length} active registry nodes...`}
                    className="w-full h-11 bg-surface-container-high rounded-lg pl-10 pr-space-md font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-space-sm">
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                    {similarIdeas.length} Related {similarIdeas.length === 1 ? 'Node' : 'Nodes'} in
                    Registry
                  </span>
                  {similarIdeas.length === 0 ? (
                    <div className="p-space-md rounded-xl bg-surface-container text-on-surface-variant font-body-sm text-body-sm">
                      No matching ideas found—your concept looks distinct in the registry!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                      {similarIdeas.map((sim) => (
                        <div
                          key={sim.id}
                          className="bg-surface-container p-space-md rounded-xl flex flex-col justify-between hover:bg-surface-container-high transition-colors group"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-space-xs mb-space-xs">
                              <span className="font-code-sm text-code-sm text-secondary">
                                {sim.category}
                              </span>
                              <span className="font-label-sm text-label-sm text-on-surface-variant">
                                @{sim.authorUsername}
                              </span>
                            </div>
                            <h5 className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors text-base">
                              {sim.title}
                            </h5>
                            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 line-clamp-2">
                              {sim.summary}
                            </p>
                          </div>
                          <div className="mt-space-md pt-space-xs flex items-center justify-between">
                            <span className="font-code-sm text-code-sm text-on-surface-variant">
                              {sim.volunteerCount || 0} volunteers · {sim.connectionCount || 0}{' '}
                              connections
                            </span>
                            <Link
                              to={`/ideas/${sim.id}`}
                              className="font-label-md text-label-md text-primary hover:underline flex items-center gap-0.5"
                            >
                              View node
                              <span className="material-symbols-outlined text-[14px]">
                                arrow_outward
                              </span>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Navigation Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-space-md pt-space-md">
                <button
                  type="button"
                  onClick={saveDraftNow}
                  className="w-full sm:w-auto min-h-[44px] px-space-lg rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-title-md text-title-md flex items-center justify-center gap-space-xs transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">bookmark_border</span>
                  Save draft
                </button>
                <button
                  type="button"
                  onClick={handleGoToStep2}
                  className="w-full sm:w-auto min-h-[44px] px-space-xl bg-primary-container text-on-primary font-title-md text-title-md rounded-lg flex items-center justify-center gap-space-xs shadow-md hover:opacity-95 transition-all"
                >
                  <span>Continue to Step 2: Details</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {/* Summary Pitch */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <label
                    htmlFor="idea-summary"
                    className="font-title-md text-title-md text-on-surface block"
                  >
                    One-Paragraph Summary Pitch
                  </label>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                    Shown on idea cards in Explore and Home (max 300 characters).
                  </p>
                </div>
                <textarea
                  id="idea-summary"
                  rows={2}
                  maxLength={350}
                  value={draft.summary}
                  onChange={(e) => updateDraft({ summary: e.target.value })}
                  placeholder="Summarize what this idea does and why it matters in 1–2 crisp sentences..."
                  className="w-full p-3 bg-surface-container-high rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest"
                />
              </div>

              {/* The Problem & The Solution */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <label
                    htmlFor="idea-problem"
                    className="font-title-md text-title-md text-on-surface block"
                  >
                    The Problem
                  </label>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                    What concrete pain point, bottleneck, or failure mode does this solve?
                  </p>
                </div>
                <textarea
                  id="idea-problem"
                  rows={4}
                  value={draft.problem}
                  onChange={(e) => updateDraft({ problem: e.target.value })}
                  placeholder="Describe the real-world problem and who experiences it..."
                  className="w-full p-3 bg-surface-container-high rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest"
                />

                <div className="pt-space-sm">
                  <label
                    htmlFor="idea-solution"
                    className="font-title-md text-title-md text-on-surface block"
                  >
                    The Solution / Technical Idea
                  </label>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                    How should it work? Share your proposed architecture, stack, or hardware
                    concept.
                  </p>
                </div>
                <textarea
                  id="idea-solution"
                  rows={5}
                  value={draft.solution}
                  onChange={(e) => updateDraft({ solution: e.target.value })}
                  placeholder="Detail the mechanism, architecture, or prototype specification..."
                  className="w-full p-3 bg-surface-container-high rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest"
                />
              </div>

              {/* Help Wanted & Existing Check */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <label
                    htmlFor="idea-help-wanted"
                    className="font-title-md text-title-md text-on-surface block"
                  >
                    Help Wanted ({draft.helpTrack === 'builder' ? 'Builder Profile' : 'Guidance Needed'})
                  </label>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                    What specific skills, languages, hardware experience, or review are you seeking?
                  </p>
                </div>
                <textarea
                  id="idea-help-wanted"
                  rows={3}
                  value={draft.helpWanted}
                  onChange={(e) => updateDraft({ helpWanted: e.target.value })}
                  placeholder="e.g. Looking for a TypeScript + WebRTC developer or embedded C++ engineer..."
                  className="w-full p-3 bg-surface-container-high rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest"
                />

                <div className="pt-space-sm">
                  <label
                    htmlFor="idea-existing-check"
                    className="font-title-md text-title-md text-on-surface block"
                  >
                    Does This Already Exist? (Prior-Art Note)
                  </label>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                    Mention any existing tools you checked and how your idea differs.
                  </p>
                </div>
                <textarea
                  id="idea-existing-check"
                  rows={2}
                  value={draft.existingCheckNote}
                  onChange={(e) => updateDraft({ existingCheckNote: e.target.value })}
                  placeholder="e.g. Tool X exists for cloud teams, but lacks offline P2P sync..."
                  className="w-full p-3 bg-surface-container-high rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest"
                />
              </div>

              {/* License Selector */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <span className="font-title-md text-title-md text-on-surface block">
                    Idea Ownership &amp; License
                  </span>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                    Your idea stays yours. Choose how others may reference or build upon your spec.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm">
                  {(
                    [
                      {
                        key: 'all-rights-kept',
                        title: 'All Rights Kept',
                        desc: '100% creator owned. Collaborators must ask permission.',
                      },
                      {
                        key: 'cc-by',
                        title: 'CC BY 4.0',
                        desc: 'Open specification with required author attribution.',
                      },
                      {
                        key: 'mit',
                        title: 'MIT License',
                        desc: 'Permissive open-source collaboration license.',
                      },
                    ] as const
                  ).map((lic) => (
                    <button
                      key={lic.key}
                      type="button"
                      onClick={() => updateDraft({ license: lic.key as IdeaLicense })}
                      className={`text-left p-space-md rounded-xl transition-all ${
                        draft.license === lic.key
                          ? 'bg-surface-container-high ring-2 ring-primary-container'
                          : 'bg-surface-container hover:bg-surface-container-high'
                      }`}
                    >
                      <div className="font-title-md text-title-md text-on-surface mb-1">
                        {lic.title}
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {lic.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Showcase / Prototype Information */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-title-md text-title-md text-on-surface block">
                      Optional Showcase &amp; Prototype Information
                    </span>
                    <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                      Optional
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">
                    If you already have an early repository, schematic link, or contributor notes,
                    include them here (or add them later when built).
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-space-sm">
                  <div>
                    <label
                      htmlFor="idea-showcase-url"
                      className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1"
                    >
                      Repository / Prototype URL
                    </label>
                    <input
                      id="idea-showcase-url"
                      type="url"
                      value={draft.showcaseUrl || ''}
                      onChange={(e) => updateDraft({ showcaseUrl: e.target.value })}
                      placeholder="https://github.com/..."
                      className="w-full h-11 px-3 bg-surface-container-high rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="idea-showcase-credits"
                      className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1"
                    >
                      Co-Creators / Credits
                    </label>
                    <input
                      id="idea-showcase-credits"
                      type="text"
                      value={draft.showcaseCredits || ''}
                      onChange={(e) => updateDraft({ showcaseCredits: e.target.value })}
                      placeholder="e.g. @alice, @bob"
                      className="w-full h-11 px-3 bg-surface-container-high rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="idea-showcase-notes"
                    className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1"
                  >
                    Build / Prototype Notes
                  </label>
                  <textarea
                    id="idea-showcase-notes"
                    rows={2}
                    value={draft.showcaseNotes || ''}
                    onChange={(e) => updateDraft({ showcaseNotes: e.target.value })}
                    placeholder="Optional notes on current prototype progress or hardware benchmarks..."
                    className="w-full p-3 bg-surface-container-high rounded-lg font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none"
                  />
                </div>
              </div>

              {/* Step 2 Navigation Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-space-md pt-space-md">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Link
                    to="/post/basics"
                    className="min-h-[44px] px-space-md rounded-lg bg-surface-container-high text-on-surface font-title-md text-title-md inline-flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    Back
                  </Link>
                  <button
                    type="button"
                    onClick={saveDraftNow}
                    className="min-h-[44px] px-space-md rounded-lg text-on-surface-variant hover:text-on-surface font-title-md text-title-md inline-flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[18px]">bookmark_border</span>
                    Save draft
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleGoToStep3}
                  className="w-full sm:w-auto min-h-[44px] px-space-xl bg-primary-container text-on-primary font-title-md text-title-md rounded-lg flex items-center justify-center gap-space-xs shadow-md hover:opacity-95 transition-all"
                >
                  <span>Continue to Step 3: Review</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              {/* Live Specification Preview Card */}
              <div className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-lg shadow-xl border border-surface-variant/40">
                <div className="flex items-center justify-between border-b border-surface-variant/30 pb-space-md flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm uppercase">
                      {draft.category}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-label-sm text-label-sm uppercase ${
                        draft.helpTrack === 'builder'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-tertiary/15 text-tertiary'
                      }`}
                    >
                      {draft.helpTrack === 'builder' ? 'Needs a Builder' : 'Needs Guidance'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to="/post/basics"
                      className="min-h-[36px] px-3 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-code-sm text-code-sm inline-flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">edit</span>
                      Edit Basics
                    </Link>
                    <Link
                      to="/post/details"
                      className="min-h-[36px] px-3 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-code-sm text-code-sm inline-flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">edit_note</span>
                      Edit Details
                    </Link>
                  </div>
                </div>

                <div>
                  <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2">
                    {draft.title || 'Untitled Idea Specification'}
                  </h2>
                  <p className="font-body-lg text-body-lg text-on-surface-variant">
                    {draft.summary || 'No summary provided yet.'}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {draft.tags.map((t) => (
                      <span
                        key={t}
                        className="font-code-sm text-code-sm bg-surface-container-high text-secondary px-2.5 py-0.5 rounded"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-surface-container p-space-md rounded-xl flex flex-col gap-1">
                  <span className="font-code-sm text-code-sm text-error uppercase">
                    The Problem
                  </span>
                  <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">
                    {draft.problem || 'Not specified yet.'}
                  </p>
                </div>

                <div className="bg-surface-container p-space-md rounded-xl flex flex-col gap-1">
                  <span className="font-code-sm text-code-sm text-secondary uppercase">
                    The Solution / Idea
                  </span>
                  <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">
                    {draft.solution || 'Not specified yet.'}
                  </p>
                </div>

                <div className="bg-surface-container p-space-md rounded-xl flex flex-col gap-1">
                  <span className="font-code-sm text-code-sm text-primary uppercase">
                    Help Wanted
                  </span>
                  <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">
                    {draft.helpWanted || 'Not specified yet.'}
                  </p>
                </div>

                {draft.existingCheckNote && (
                  <div className="bg-surface-container p-space-md rounded-xl flex flex-col gap-1">
                    <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                      Prior-Art / Existing Tools Check
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant whitespace-pre-line">
                      {draft.existingCheckNote}
                    </p>
                  </div>
                )}

                {(draft.showcaseUrl || draft.showcaseCredits || draft.showcaseNotes) && (
                  <div className="bg-surface-container p-space-md rounded-xl flex flex-col gap-1">
                    <span className="font-code-sm text-code-sm text-secondary uppercase">
                      Optional Prototype / Showcase Info
                    </span>
                    {draft.showcaseUrl && (
                      <p className="font-code-sm text-code-sm text-secondary break-all">
                        URL: {draft.showcaseUrl}
                      </p>
                    )}
                    {draft.showcaseCredits && (
                      <p className="font-body-sm text-body-sm text-on-surface">
                        Credits: {draft.showcaseCredits}
                      </p>
                    )}
                    {draft.showcaseNotes && (
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {draft.showcaseNotes}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-surface-container-lowest rounded-lg font-code-sm text-code-sm text-on-surface-variant">
                  <span className="material-symbols-outlined text-secondary text-[20px]">
                    lock_open
                  </span>
                  <span>{licenseInfo.full}</span>
                </div>
              </div>

              {/* Step 3 Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-space-md pt-space-md">
                <Link
                  to="/post/details"
                  className="w-full sm:w-auto min-h-[44px] px-space-lg rounded-lg bg-surface-container-high text-on-surface font-title-md text-title-md flex items-center justify-center gap-1"
                >
                  <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                  Back to Step 2: Details
                </Link>

                <button
                  type="button"
                  disabled={publishing}
                  onClick={handlePublish}
                  className="w-full sm:w-auto min-h-[48px] px-space-xl bg-primary-container text-on-primary font-title-md text-title-md rounded-lg flex items-center justify-center gap-space-xs shadow-md hover:opacity-95 disabled:opacity-50 transition-all"
                >
                  <span className="material-symbols-outlined text-[20px]">rocket_launch</span>
                  <span>{publishing ? 'Publishing to Registry...' : 'Publish Idea Now'}</span>
                </button>
              </div>
            </>
          )}

          {/* Idea Protection Pledge Banner */}
          <div className="bg-surface-container-lowest p-space-md rounded-2xl flex items-start gap-space-md mt-space-sm">
            <span className="material-symbols-outlined text-on-surface-variant text-[22px] shrink-0 mt-0.5">
              verified_user
            </span>
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              <strong className="text-on-surface font-medium">Idea Protection Pledge:</strong>{' '}
              Synapse is non-profit and non-commercial. Ideas posted here remain 100% the
              intellectual property of the author under your chosen open license. No stealth
              corporate claims, no proprietary lock-in.
            </p>
          </div>
        </div>

        {/* Right 4 Cols: Realtime Intelligence Rail */}
        <div className="lg:col-span-4 flex flex-col gap-space-lg">
          {/* Topology Forecast Card */}
          <div className="bg-surface-container-low rounded-2xl p-space-lg shadow-md flex flex-col gap-space-md relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[18px]">
                  bubble_chart
                </span>
                <span className="font-title-md text-title-md text-on-surface">
                  Topology Forecast
                </span>
              </div>
              <span className="font-label-sm text-label-sm uppercase bg-surface-container px-2 py-0.5 rounded text-on-surface-variant">
                Live Preview
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              How your concept links into existing node clusters based on selected track and tags.
            </p>

            <div className="w-full h-48 bg-surface-container-lowest rounded-xl relative flex items-center justify-center overflow-hidden">
              <svg
                className="w-full h-full"
                viewBox="0 0 320 180"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <line
                  x1="160"
                  y1="90"
                  x2="60"
                  y2="45"
                  stroke="#f5a524"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  opacity="0.8"
                />
                <line
                  x1="160"
                  y1="90"
                  x2="250"
                  y2="50"
                  stroke="#44e2cd"
                  strokeWidth="1.5"
                  opacity="0.6"
                />
                <line
                  x1="160"
                  y1="90"
                  x2="190"
                  y2="145"
                  stroke="#cbceff"
                  strokeWidth="1.5"
                  strokeDasharray="2 2"
                  opacity="0.5"
                />
                <line x1="60" y1="45" x2="100" y2="130" stroke="#31353f" strokeWidth="1" />
                <line x1="250" y1="50" x2="270" y2="120" stroke="#31353f" strokeWidth="1" />
                <circle
                  cx="60"
                  cy="45"
                  r="7"
                  fill="#181c25"
                  stroke="#f5a524"
                  strokeWidth="2"
                />
                <circle
                  cx="250"
                  cy="50"
                  r="9"
                  fill="#181c25"
                  stroke="#44e2cd"
                  strokeWidth="2"
                />
                <circle
                  cx="190"
                  cy="145"
                  r="6"
                  fill="#181c25"
                  stroke="#cbceff"
                  strokeWidth="1.5"
                />
                <circle
                  cx="100"
                  cy="130"
                  r="5"
                  fill="#181c25"
                  stroke="#524434"
                  strokeWidth="1.5"
                />
                <circle
                  cx="270"
                  cy="120"
                  r="5"
                  fill="#181c25"
                  stroke="#524434"
                  strokeWidth="1.5"
                />
                <circle
                  cx="160"
                  cy="90"
                  r="11"
                  fill="#181c25"
                  stroke="#f5a524"
                  strokeWidth="2.5"
                />
                <circle cx="160" cy="90" r="4" fill="#f5a524" />
                <text
                  x="160"
                  y="118"
                  textAnchor="middle"
                  fill="#dfe2ef"
                  fontFamily="Space Grotesk"
                  fontSize="10"
                  fontWeight="600"
                >
                  {draft.title ? draft.title.slice(0, 18) : 'Your Idea'}
                </text>
                <text
                  x="60"
                  y="30"
                  textAnchor="middle"
                  fill="#ffc77f"
                  fontFamily="Space Grotesk"
                  fontSize="9"
                >
                  {draft.category}
                </text>
                <text
                  x="250"
                  y="35"
                  textAnchor="middle"
                  fill="#44e2cd"
                  fontFamily="Space Grotesk"
                  fontSize="9"
                >
                  {draft.helpTrack === 'builder' ? 'Needs Builder' : 'Needs Guidance'}
                </text>
                <text
                  x="190"
                  y="165"
                  textAnchor="middle"
                  fill="#cbceff"
                  fontFamily="Inter"
                  fontSize="8"
                >
                  {draft.tags[0] ? `#${draft.tags[0]}` : '#open-spec'}
                </text>
              </svg>
              <div className="absolute bottom-2 left-2 px-space-xs py-0.5 rounded bg-surface/80 backdrop-blur font-code-sm text-code-sm text-secondary flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                {draft.tags.length} Active Tag {draft.tags.length === 1 ? 'Vector' : 'Vectors'}
              </div>
            </div>
          </div>

          {/* Volunteer Ecosystem Card (Using hotlinked image from Stitch HTML, no fake stats) */}
          <div className="bg-surface-container-low rounded-2xl p-space-lg shadow-md flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <span className="font-title-md text-title-md text-on-surface">
                Volunteer Ecosystem
              </span>
              <span className="font-code-sm text-code-sm text-primary">Open Collaboration</span>
            </div>
            <div className="relative w-full h-40 rounded-xl overflow-hidden">
              <img
                src={SITE_CONFIG.images.makerWorkbench}
                alt="Open-hardware and software developer workbench"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/40 to-transparent flex flex-col justify-end p-space-md">
                <span className="font-label-sm text-label-sm text-primary uppercase tracking-wider">
                  Peer Makers
                </span>
                <p className="font-headline-sm text-headline-sm text-on-surface text-base">
                  Volunteer builders and advisors browse open specs by track and tag.
                </p>
              </div>
            </div>

            {/* Quality Checklist Micro-Card */}
            <div className="bg-surface-container p-space-md rounded-xl flex flex-col gap-space-xs">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Specification Quality Check
              </span>
              <div className="flex items-center gap-space-xs text-on-surface font-body-sm text-body-sm">
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    draft.title.trim().length >= 5
                      ? 'text-secondary'
                      : 'text-on-surface-variant/40'
                  }`}
                >
                  check_circle
                </span>
                <span>Concise, problem-first title</span>
              </div>
              <div className="flex items-center gap-space-xs text-on-surface font-body-sm text-body-sm">
                <span className="material-symbols-outlined text-secondary text-[16px]">
                  check_circle
                </span>
                <span>Defines whether you need execution vs guidance</span>
              </div>
              <div className="flex items-center gap-space-xs text-on-surface font-body-sm text-body-sm">
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    draft.tags.length > 0 ? 'text-secondary' : 'text-on-surface-variant/40'
                  }`}
                >
                  check_circle
                </span>
                <span>Tags assist network graph clustering</span>
              </div>
              <div className="flex items-center gap-space-xs text-on-surface font-body-sm text-body-sm">
                <span
                  className={`material-symbols-outlined text-[16px] ${
                    draft.problem.trim().length >= 15 && draft.solution.trim().length >= 15
                      ? 'text-secondary'
                      : 'text-on-surface-variant/40'
                  }`}
                >
                  check_circle
                </span>
                <span>Clear problem scope &amp; solution hypothesis</span>
              </div>
            </div>
          </div>

          {/* Open Infrastructure Notice */}
          <div className="bg-surface-container-low rounded-2xl p-space-md flex items-center gap-space-md">
            <div className="w-10 h-10 rounded-lg bg-surface-variant flex items-center justify-center shrink-0 text-primary">
              <span className="material-symbols-outlined text-[20px]">public</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-title-md text-title-md text-on-surface text-sm">
                Open Infrastructure
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                Synapse operates at cost zero for creators. Ideas stay yours.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
