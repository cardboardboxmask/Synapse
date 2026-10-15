import React, { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  FileText,
  Tag,
  Check,
  CheckCircle2,
  Bookmark,
  ArrowRight,
  ArrowLeft,
  Edit3,
  Rocket,
  ShieldCheck,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Circle,
  Users,
  Search,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { PageMeta } from '../components/PageMeta';
import { RouteSkeleton } from '../components/Skeletons';
import { createNewIdea, ensureUserProfile } from '../firebase';
import { IdeaCategory, IdeaLicense } from '../types/synapse';
import {
  checkRateLimit,
  getLicenseLabel,
  sanitizeTag,
  validateExternalUrl,
} from '../utils/sanitize';

interface PostWizardPageProps {
  step: 1 | 2 | 3 | 4;
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
  const [publishing, setPublishing] = useState(false);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);
  const [showSimilarModal, setShowSimilarModal] = useState(false);

  // Automatic real-time similarity check against title (3+ characters)
  const titleQuery = draft.title.trim().toLowerCase();
  const similarIdeas = useMemo(() => {
    if (!titleQuery || titleQuery.length < 3) {
      return [];
    }
    const tokens = titleQuery.split(/\s+/).filter((w) => w.length >= 2);
    if (tokens.length === 0) return [];
    return ideas
      .map((idea) => {
        const hay = `${idea.title} ${idea.summary} ${idea.tags.join(' ')} ${idea.category}`.toLowerCase();
        const hits = tokens.filter((t) => hay.includes(t)).length;
        return { idea, hits };
      })
      .filter((item) => item.hits > 0)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5)
      .map((item) => item.idea);
  }, [ideas, titleQuery]);

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
      showToast('Please enter a problem statement (at least 10 characters).', 'error');
      return false;
    }
    return true;
  };

  const validateStep2 = (): boolean => {
    // Keep draft.problem in sync with summary if not explicitly entered
    if (!draft.problem.trim() && draft.summary.trim()) {
      updateDraft({ problem: draft.summary.trim() });
    }
    if (draft.problem.trim().length < 10 && draft.summary.trim().length < 10) {
      showToast('Please describe the problem or details (at least 10 characters).', 'error');
      return false;
    }
    return true;
  };

  const validateStep3 = (): boolean => {
    if (draft.helpWanted.trim().length < 5) {
      showToast('Please specify what help you need.', 'error');
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
      navigate('/post/collaborate');
    }
  };

  const handleGoToStep4 = () => {
    if (validateStep1() && validateStep2() && validateStep3()) {
      navigate('/post/review');
    }
  };

  const handlePublish = async () => {
    let activeProfile = profile;
    if (!activeProfile && user) {
      try {
        activeProfile = await ensureUserProfile(user);
      } catch {
        // fallback
      }
    }
    if (!activeProfile) {
      showToast('Profile is still initializing, please try again in a moment.', 'error');
      return;
    }
    if (!validateStep1() || !validateStep2() || !validateStep3()) return;

    const rl = checkRateLimit(`post-idea-${activeProfile.uid}`, 6000);
    if (!rl.allowed) {
      showToast(`Please wait ${rl.waitSeconds}s before publishing another idea.`, 'error');
      return;
    }

    setPublishing(true);
    try {
      const newId = await createNewIdea(draft, activeProfile);
      resetDraft();
      showToast('Your idea is live on Synapse!', 'success');
      navigate(`/ideas/${newId}?published=1`);
    } catch {
      showToast('Could not publish idea. Please check all fields and try again.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const licenseInfo = getLicenseLabel(draft.license);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-margin py-space-xl">
      <PageMeta
        title={`Post Your Idea (Step ${step} of 4) — Synapse`}
        description="Share an idea to find volunteer builders, collaborators, or advice."
      />

      {/* Top Meta Context Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-sm pb-space-md mb-space-md border-b border-surface-variant/30">
        <div className="flex items-center gap-space-sm bg-surface-container-low px-space-md py-1.5 rounded-full flex-wrap">
          <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          <span className="font-code-sm text-code-sm text-on-surface-variant">
            {lastSavedAt
              ? `Draft auto-saved in browser at ${lastSavedAt}`
              : 'Draft auto-saves continuously in browser'}{' '}
            · Signed in as @{profile?.username || user?.displayName || 'maker'}
          </span>
          {draftRestoredFromStorage && (
            <button
              type="button"
              onClick={() => {
                resetDraft();
                showToast('Draft cleared.', 'info');
              }}
              className="ml-2 font-code-sm text-code-sm text-error hover:underline"
            >
              Clear draft
            </button>
          )}
        </div>
        <div className="flex items-center gap-space-xs text-on-surface-variant">
          <FileText className="w-4 h-4 text-primary" />
          <span className="font-code-sm text-code-sm uppercase tracking-widest text-on-surface-variant">
            Step {step} of 4 · Creator Owned
          </span>
        </div>
      </div>

      {/* Stepper Navigation (Responsive 4-step) */}
      <div className="w-full bg-surface-container-low rounded-2xl p-space-md sm:p-space-lg mb-space-xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-space-md">
          {/* Step 1: Basics */}
          <button
            type="button"
            onClick={() => navigate('/post/basics')}
            className={`text-left flex items-start gap-space-sm p-space-sm sm:p-space-md rounded-xl transition-all ${
              step === 1
                ? 'bg-surface-container-high/90 ring-1 ring-primary/40'
                : 'bg-surface-container/40 opacity-80 hover:opacity-100'
            }`}
          >
            <div
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md font-headline-sm text-sm sm:text-headline-sm flex items-center justify-center shrink-0 ${
                step === 1
                  ? 'bg-primary-container text-on-primary font-bold'
                  : step > 1
                  ? 'bg-secondary text-on-secondary font-bold'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              {step > 1 ? '✓' : '1'}
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className={`font-label-sm text-[11px] uppercase tracking-wider ${
                  step === 1 ? 'text-primary font-semibold' : 'text-on-surface-variant'
                }`}
              >
                Step 1
              </span>
              <span className="font-title-md text-sm sm:text-title-md text-on-surface truncate">
                Basics
              </span>
              <span className="hidden sm:inline font-body-sm text-xs text-on-surface-variant line-clamp-1">
                Title, problem &amp; category
              </span>
            </div>
          </button>

          {/* Step 2: Details */}
          <button
            type="button"
            onClick={handleGoToStep2}
            className={`text-left flex items-start gap-space-sm p-space-sm sm:p-space-md rounded-xl transition-all ${
              step === 2
                ? 'bg-surface-container-high/90 ring-1 ring-primary/40'
                : 'bg-surface-container/40 opacity-80 hover:opacity-100'
            }`}
          >
            <div
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md font-headline-sm text-sm sm:text-headline-sm flex items-center justify-center shrink-0 ${
                step === 2
                  ? 'bg-primary-container text-on-primary font-bold'
                  : step > 2
                  ? 'bg-secondary text-on-secondary font-bold'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              {step > 2 ? '✓' : '2'}
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className={`font-label-sm text-[11px] uppercase tracking-wider ${
                  step === 2 ? 'text-primary font-semibold' : 'text-on-surface-variant'
                }`}
              >
                Step 2
              </span>
              <span className="font-title-md text-sm sm:text-title-md text-on-surface truncate">
                Details
              </span>
              <span className="hidden sm:inline font-body-sm text-xs text-on-surface-variant line-clamp-1">
                Tags, solution &amp; context
              </span>
            </div>
          </button>

          {/* Step 3: Help needed */}
          <button
            type="button"
            onClick={handleGoToStep3}
            className={`text-left flex items-start gap-space-sm p-space-sm sm:p-space-md rounded-xl transition-all ${
              step === 3
                ? 'bg-surface-container-high/90 ring-1 ring-primary/40'
                : 'bg-surface-container/40 opacity-80 hover:opacity-100'
            }`}
          >
            <div
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md font-headline-sm text-sm sm:text-headline-sm flex items-center justify-center shrink-0 ${
                step === 3
                  ? 'bg-primary-container text-on-primary font-bold'
                  : step > 3
                  ? 'bg-secondary text-on-secondary font-bold'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              {step > 3 ? '✓' : '3'}
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className={`font-label-sm text-[11px] uppercase tracking-wider ${
                  step === 3 ? 'text-primary font-semibold' : 'text-on-surface-variant'
                }`}
              >
                Step 3
              </span>
              <span className="font-title-md text-sm sm:text-title-md text-on-surface truncate">
                Help needed
              </span>
              <span className="hidden sm:inline font-body-sm text-xs text-on-surface-variant line-clamp-1">
                Track, details &amp; license
              </span>
            </div>
          </button>

          {/* Step 4: Review */}
          <button
            type="button"
            onClick={handleGoToStep4}
            className={`text-left flex items-start gap-space-sm p-space-sm sm:p-space-md rounded-xl transition-all ${
              step === 4
                ? 'bg-surface-container-high/90 ring-1 ring-primary/40'
                : 'bg-surface-container/40 opacity-80 hover:opacity-100'
            }`}
          >
            <div
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-md font-headline-sm text-sm sm:text-headline-sm flex items-center justify-center shrink-0 ${
                step === 4
                  ? 'bg-primary-container text-on-primary font-bold'
                  : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              4
            </div>
            <div className="flex flex-col min-w-0">
              <span
                className={`font-label-sm text-[11px] uppercase tracking-wider ${
                  step === 4 ? 'text-primary font-semibold' : 'text-on-surface-variant'
                }`}
              >
                Step 4
              </span>
              <span className="font-title-md text-sm sm:text-title-md text-on-surface truncate">
                Review
              </span>
              <span className="hidden sm:inline font-body-sm text-xs text-on-surface-variant line-clamp-1">
                Preview &amp; publish
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
        {/* Left 8 Columns: Active Step Form */}
        <div className="lg:col-span-8 flex flex-col gap-space-xl">
          {/* STEP 1: BASICS */}
          {step === 1 && (
            <>
              {/* Field 1: Title */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div className="flex items-baseline justify-between gap-space-sm">
                  <div>
                    <label
                      htmlFor="idea-title"
                      className="font-title-md text-title-md text-on-surface block font-medium"
                    >
                      Idea Title
                    </label>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                      A clear name stating what you want to build or explore.
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
                  placeholder="e.g. LocalMesh: Offline neighborhood emergency alert network"
                  className="w-full h-12 bg-surface-container-high rounded-lg px-space-md font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest transition-colors"
                />

                {/* Non-blocking live similarity check directly under title */}
                {draft.title.trim().length >= 3 && similarIdeas.length > 0 && (
                  <div className="flex items-center justify-between text-[13px] text-on-surface-variant bg-surface-container px-3 py-2 rounded-lg">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-secondary" />
                      <span>Similar ideas found: <strong className="text-on-surface">{similarIdeas.length}</strong></span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowSimilarModal(true)}
                      className="text-primary hover:underline font-medium text-[13px]"
                    >
                      View similar ideas
                    </button>
                  </div>
                )}
              </div>

              {/* Field 2: Problem statement */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div className="flex items-baseline justify-between gap-space-sm">
                  <div>
                    <label
                      htmlFor="idea-problem-statement"
                      className="font-title-md text-title-md text-on-surface block font-medium"
                    >
                      Problem statement (what problem, for whom)
                    </label>
                    <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                      Describe what real-world issue this solves and who experiences it.
                    </p>
                  </div>
                  <span className="font-code-sm text-code-sm text-on-surface-variant">
                    {draft.summary.length}/350
                  </span>
                </div>
                <textarea
                  id="idea-problem-statement"
                  rows={3}
                  maxLength={350}
                  value={draft.summary}
                  onChange={(e) => {
                    const val = e.target.value;
                    updateDraft({
                      summary: val,
                      problem: draft.problem && draft.problem !== draft.summary ? draft.problem : val,
                    });
                  }}
                  placeholder="What problem does this solve, and for whom?"
                  className="w-full p-3 bg-surface-container-high rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest transition-colors"
                />
              </div>

              {/* Field 3: Category chips */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <span className="font-title-md text-title-md text-on-surface block font-medium">
                    Category
                  </span>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Select the primary category for this idea.
                  </p>
                </div>

                <div className="flex flex-wrap gap-space-xs">
                  {CATEGORIES.map((catName) => {
                    const selected = draft.category === catName;
                    return (
                      <button
                        key={catName}
                        type="button"
                        onClick={() => updateDraft({ category: catName })}
                        className={`min-h-[40px] px-4 rounded-full font-label-md text-label-md transition-colors flex items-center gap-1.5 ${
                          selected
                            ? 'bg-primary-container text-on-primary font-semibold shadow-sm'
                            : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
                        }`}
                      >
                        <span>{catName}</span>
                        {selected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quality Checklist (Collapsed by default) */}
              <div className="bg-surface-container-low rounded-xl border border-surface-variant/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsChecklistOpen(!isChecklistOpen)}
                  className="w-full p-3.5 flex items-center justify-between text-left text-on-surface-variant hover:text-on-surface transition-colors font-body-sm"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-secondary" />
                    <span>Quality checklist</span>
                  </span>
                  {isChecklistOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {isChecklistOpen && (
                  <div className="p-4 pt-1 border-t border-surface-variant/20 flex flex-col gap-2 bg-surface-container/50">
                    <div className="flex items-center gap-2 text-[13px] text-on-surface">
                      {draft.title.trim().length >= 5 ? (
                        <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-on-surface-variant/40 shrink-0" />
                      )}
                      <span>Clear, problem-first title</span>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-on-surface">
                      {draft.summary.trim().length >= 10 ? (
                        <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-on-surface-variant/40 shrink-0" />
                      )}
                      <span>Clear problem statement explaining who needs it</span>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-on-surface">
                      {draft.category ? (
                        <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-on-surface-variant/40 shrink-0" />
                      )}
                      <span>Category selected</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Step 1 Actions & Idea Protection Pledge */}
              <div className="flex flex-col gap-4 pt-space-xs">
                <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-space-md">
                  <button
                    type="button"
                    onClick={saveDraftNow}
                    className="w-full sm:w-auto min-h-[44px] px-space-lg rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-title-md text-title-md flex items-center justify-center gap-space-xs transition-colors"
                  >
                    <Bookmark className="w-4 h-4" />
                    Save draft
                  </button>
                  <button
                    type="button"
                    onClick={handleGoToStep2}
                    className="w-full sm:w-auto min-h-[44px] px-space-xl bg-primary-container text-on-primary font-title-md text-title-md rounded-lg flex items-center justify-center gap-space-xs shadow-md hover:opacity-95 transition-all font-semibold"
                  >
                    <span>Continue to Step 2: Details</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Idea Protection Pledge as a single short line at bottom */}
                <p className="text-[13px] text-on-surface-variant flex items-center gap-2 pt-2 border-t border-surface-variant/20">
                  <ShieldCheck className="w-4 h-4 text-secondary shrink-0" />
                  <span>
                    <strong className="text-on-surface font-medium">Idea Protection Pledge:</strong> You own your idea. Ideas posted on Synapse remain the intellectual property of their authors.
                  </span>
                </p>
              </div>
            </>
          )}

          {/* STEP 2: DETAILS */}
          {step === 2 && (
            <>
              {/* Tags Section (Moved from Step 1) */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <span className="font-title-md text-title-md text-on-surface block font-medium">
                    Tags
                  </span>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Add tags to help builders and advisors discover your idea (e.g. react, hardware, p2p).
                  </p>
                </div>

                <div className="flex flex-col gap-space-sm">
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <Tag className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
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
                        placeholder="Add tag and press Enter"
                        className="w-full h-11 bg-surface-container-high rounded-lg pl-10 pr-space-md font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest transition-colors"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddTag(tagInput)}
                      className="min-h-[44px] px-4 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-md text-label-md shrink-0"
                    >
                      Add Tag
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-space-xs min-h-[32px]">
                    {draft.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface font-code-sm text-code-sm"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(t)}
                          aria-label={`Remove tag ${t}`}
                          className="text-on-surface-variant hover:text-error rounded-full"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {draft.tags.length === 0 && (
                      <span className="font-body-sm text-xs text-on-surface-variant/60 italic py-1">
                        No tags added yet (optional).
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Solution / Architecture Concept */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <label
                    htmlFor="idea-solution"
                    className="font-title-md text-title-md text-on-surface block font-medium"
                  >
                    Proposed Solution or Concept
                  </label>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    How do you envision this working? Share what you've thought of so far.
                  </p>
                </div>
                <textarea
                  id="idea-solution"
                  rows={5}
                  value={draft.solution}
                  onChange={(e) => updateDraft({ solution: e.target.value })}
                  placeholder="Detail the mechanism, components, prototype ideas, or open questions..."
                  className="w-full p-3 bg-surface-container-high rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest"
                />
              </div>

              {/* Prior-Art Check Note (Optional) */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="idea-existing-check"
                    className="font-title-md text-title-md text-on-surface block font-medium"
                  >
                    Existing Alternatives (Optional)
                  </label>
                  <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                    Optional
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Have you looked at existing tools or projects? How does this differ?
                </p>
                <textarea
                  id="idea-existing-check"
                  rows={2}
                  value={draft.existingCheckNote}
                  onChange={(e) => updateDraft({ existingCheckNote: e.target.value })}
                  placeholder="e.g. Existing apps require paid accounts, but this should be local-first..."
                  className="w-full p-3 bg-surface-container-high rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest"
                />
              </div>

              {/* Step 2 Navigation Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-space-md pt-space-md">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Link
                    to="/post/basics"
                    className="min-h-[44px] px-space-md rounded-lg bg-surface-container-high text-on-surface font-title-md text-title-md inline-flex items-center gap-1.5 hover:bg-surface-bright transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </Link>
                  <button
                    type="button"
                    onClick={saveDraftNow}
                    className="min-h-[44px] px-space-md rounded-lg text-on-surface-variant hover:text-on-surface font-title-md text-title-md inline-flex items-center gap-1.5"
                  >
                    <Bookmark className="w-4 h-4" />
                    Save draft
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleGoToStep3}
                  className="w-full sm:w-auto min-h-[44px] px-space-xl bg-primary-container text-on-primary font-title-md text-title-md rounded-lg flex items-center justify-center gap-space-xs shadow-md hover:opacity-95 transition-all font-semibold"
                >
                  <span>Continue to Step 3: Help needed</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* STEP 3: HELP NEEDED */}
          {step === 3 && (
            <>
              {/* Collaboration Track */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <div className="flex items-center gap-space-xs">
                    <span className="font-title-md text-title-md text-on-surface block font-medium">
                      What type of help do you need most?
                    </span>
                    <span className="font-code-sm text-code-sm px-space-xs py-0.5 rounded bg-primary/20 text-primary">
                      Required
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Choose whether you want someone to build it with you, or if you just need advice and feedback.
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
                        <span className="font-label-sm text-label-sm uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary flex items-center gap-1 font-semibold">
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
                        You have an idea, vision, or domain problem, but need an engineer, designer,
                        or maker to help build the prototype.
                      </p>
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
                        <span className="font-label-sm text-label-sm uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-tertiary-container/20 text-tertiary flex items-center gap-1 font-semibold">
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
                        You can build it yourself, but need feedback, architectural advice, or domain validation from experienced makers.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Field 2: Help Wanted Details */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <label
                    htmlFor="idea-help-wanted"
                    className="font-title-md text-title-md text-on-surface block font-medium"
                  >
                    What specific help do you need?
                  </label>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Describe what volunteers or peers can assist with (e.g. frontend code, PCB layout, user testing).
                  </p>
                </div>
                <textarea
                  id="idea-help-wanted"
                  rows={3}
                  value={draft.helpWanted}
                  onChange={(e) => updateDraft({ helpWanted: e.target.value })}
                  placeholder="e.g. Looking for a React developer to build the UI, and feedback on Bluetooth sync..."
                  className="w-full p-3 bg-surface-container-high rounded-lg font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:bg-surface-container-highest"
                />
              </div>

              {/* Field 3: License Selector */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div>
                  <span className="font-title-md text-title-md text-on-surface block font-medium">
                    Idea Ownership &amp; License
                  </span>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                    Your idea stays yours. Choose how others may reference or collaborate on your idea.
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
                        desc: 'Open idea with required author attribution.',
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
                      <div className="font-title-md text-title-md text-on-surface mb-1 font-medium">
                        {lic.title}
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        {lic.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Field 4: Optional Repository / Prototype Link */}
              <div className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-title-md text-title-md text-on-surface block font-medium">
                    Optional Repository or Prototype Link
                  </span>
                  <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                    Optional
                  </span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  If you already started a GitHub repo, Figma mockup, or demo, paste the link here.
                </p>

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
              </div>

              {/* Step 3 Navigation Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-space-md pt-space-md">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Link
                    to="/post/details"
                    className="min-h-[44px] px-space-md rounded-lg bg-surface-container-high text-on-surface font-title-md text-title-md inline-flex items-center gap-1.5 hover:bg-surface-bright transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </Link>
                  <button
                    type="button"
                    onClick={saveDraftNow}
                    className="min-h-[44px] px-space-md rounded-lg text-on-surface-variant hover:text-on-surface font-title-md text-title-md inline-flex items-center gap-1.5"
                  >
                    <Bookmark className="w-4 h-4" />
                    Save draft
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleGoToStep4}
                  className="w-full sm:w-auto min-h-[44px] px-space-xl bg-primary-container text-on-primary font-title-md text-title-md rounded-lg flex items-center justify-center gap-space-xs shadow-md hover:opacity-95 transition-all font-semibold"
                >
                  <span>Continue to Step 4: Review</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* STEP 4: REVIEW */}
          {step === 4 && (
            <>
              {/* Full Review Preview */}
              <div className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-lg shadow-xl border border-surface-variant/40">
                <div className="flex items-center justify-between border-b border-surface-variant/30 pb-space-md flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high text-on-surface font-label-sm text-label-sm uppercase font-semibold">
                      {draft.category}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-label-sm text-label-sm uppercase font-semibold ${
                        draft.helpTrack === 'builder'
                          ? 'bg-primary/15 text-primary'
                          : 'bg-tertiary/15 text-tertiary'
                      }`}
                    >
                      {draft.helpTrack === 'builder' ? 'Needs a Builder' : 'Needs Guidance'}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-secondary/10 text-secondary font-code-sm text-code-sm">
                      {licenseInfo.short}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      to="/post/basics"
                      className="min-h-[36px] px-3 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-code-sm text-code-sm inline-flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Basics
                    </Link>
                    <Link
                      to="/post/details"
                      className="min-h-[36px] px-3 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-code-sm text-code-sm inline-flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Details
                    </Link>
                    <Link
                      to="/post/collaborate"
                      className="min-h-[36px] px-3 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-code-sm text-code-sm inline-flex items-center gap-1.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Edit Help
                    </Link>
                  </div>
                </div>

                <div>
                  <h2 className="font-headline-lg text-headline-lg text-on-surface mb-2 font-bold">
                    {draft.title || 'Untitled Idea'}
                  </h2>
                  <p className="font-body-lg text-body-lg text-on-surface-variant">
                    {draft.summary || 'No summary pitch provided yet.'}
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

                {draft.problem && (
                  <div className="bg-surface-container p-space-md rounded-xl flex flex-col gap-1">
                    <span className="font-code-sm text-code-sm text-error uppercase font-semibold">
                      The Problem
                    </span>
                    <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">
                      {draft.problem}
                    </p>
                  </div>
                )}

                {draft.solution && (
                  <div className="bg-surface-container p-space-md rounded-xl flex flex-col gap-1">
                    <span className="font-code-sm text-code-sm text-secondary uppercase font-semibold">
                      Proposed Solution / Concept
                    </span>
                    <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">
                      {draft.solution}
                    </p>
                  </div>
                )}

                <div className="bg-surface-container p-space-md rounded-xl flex flex-col gap-1">
                  <span className="font-code-sm text-code-sm text-primary uppercase font-semibold">
                    Help Wanted ({draft.helpTrack === 'builder' ? 'Builder Track' : 'Guidance Track'})
                  </span>
                  <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">
                    {draft.helpWanted || 'Not specified yet.'}
                  </p>
                </div>

                {draft.existingCheckNote && (
                  <div className="bg-surface-container p-space-md rounded-xl flex flex-col gap-1">
                    <span className="font-code-sm text-code-sm text-on-surface-variant uppercase font-semibold">
                      Existing Alternatives Note
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant whitespace-pre-line">
                      {draft.existingCheckNote}
                    </p>
                  </div>
                )}

                {draft.showcaseUrl && (
                  <div className="bg-surface-container p-space-md rounded-xl flex flex-col gap-1">
                    <span className="font-code-sm text-code-sm text-secondary uppercase font-semibold">
                      Prototype / Repository Link
                    </span>
                    <p className="font-code-sm text-code-sm text-secondary break-all">
                      {draft.showcaseUrl}
                    </p>
                    {draft.showcaseCredits && (
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Credits: {draft.showcaseCredits}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-surface-container-lowest rounded-lg font-code-sm text-code-sm text-on-surface-variant">
                  <ShieldCheck className="w-5 h-5 text-secondary shrink-0" />
                  <span>{licenseInfo.full}</span>
                </div>
              </div>

              {/* Step 4 Action Buttons */}
              <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-space-md pt-space-md">
                <Link
                  to="/post/collaborate"
                  className="w-full sm:w-auto min-h-[44px] px-space-lg rounded-lg bg-surface-container-high text-on-surface font-title-md text-title-md flex items-center justify-center gap-1.5 hover:bg-surface-bright transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Link>

                <button
                  type="button"
                  disabled={publishing}
                  onClick={handlePublish}
                  className="w-full sm:w-auto min-h-[48px] px-space-xl bg-primary-container text-on-primary font-title-md text-title-md rounded-lg flex items-center justify-center gap-space-xs shadow-md hover:opacity-95 disabled:opacity-50 transition-all font-semibold"
                >
                  <Rocket className="w-5 h-5" />
                  <span>{publishing ? 'Publishing idea...' : 'Publish Idea Now'}</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right 4 Columns: Context Rail */}
        <div className="lg:col-span-4 flex flex-col gap-space-lg">
          {/* Volunteer / Builder hint - 1 line summary as requested */}
          <div className="bg-surface-container-low rounded-2xl p-space-lg shadow-md flex items-center gap-3 border border-surface-variant/30">
            <Users className="w-5 h-5 text-primary shrink-0" />
            <p className="font-body-sm text-body-sm text-on-surface">
              Builders and advisors will see your idea once it's posted.
            </p>
          </div>
        </div>
      </div>

      {/* Similar Ideas Modal (Non-blocking) */}
      {showSimilarModal && (
        <div
          className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface-container w-full max-w-xl rounded-2xl p-space-xl flex flex-col gap-space-md shadow-2xl border border-surface-variant/40 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-surface-variant/30 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-secondary" />
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Similar Ideas ({similarIdeas.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSimilarModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
              >
                ✕
              </button>
            </div>

            <p className="font-body-sm text-on-surface-variant">
              These existing ideas match words in your title. You can still post your idea if it offers a different angle or solution.
            </p>

            <div className="flex flex-col gap-3">
              {similarIdeas.map((sim) => (
                <div
                  key={sim.id}
                  className="p-3.5 rounded-xl bg-surface-container-low border border-surface-variant/30 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-code-sm text-xs text-secondary font-medium">{sim.category}</span>
                    <span className="font-label-sm text-xs text-on-surface-variant">@{sim.authorUsername}</span>
                  </div>
                  <h4 className="font-title-md text-on-surface font-semibold">{sim.title}</h4>
                  <p className="font-body-sm text-xs text-on-surface-variant line-clamp-2">{sim.summary}</p>
                  <div className="pt-2 flex justify-end">
                    <Link
                      to={`/ideas/${sim.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-label-md text-xs inline-flex items-center gap-1"
                    >
                      <span>View idea</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowSimilarModal(false)}
                className="min-h-[40px] px-5 rounded-lg bg-surface-container-high text-on-surface font-medium hover:bg-surface-bright"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
