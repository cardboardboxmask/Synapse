import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  addResponseWithTransaction,
  connectIdeasWithTransaction,
  db,
  deleteConnectionWithTransaction,
  deleteIdea,
  deleteResponseWithTransaction,
  markIdeaLooksNewWithTransaction,
  subscribeToIdeaRevisions,
  toggleIdeaAdminVerified,
  updateConnectionStatus,
  updateIdeaDetails,
  updateResponseByOwner,
  updateVolunteerStatusByOwner,
  volunteerForIdeaWithTransaction,
  withdrawVolunteerWithTransaction,
  SOLE_ADMIN_UID,
} from '../firebase';
import { useApp } from '../context/AppContext';
import { BookmarkButton } from '../components/BookmarkButton';
import { PageMeta } from '../components/PageMeta';
import { RouteSkeleton } from '../components/Skeletons';
import { SITE_CONFIG } from '../config/siteConfig';
import {
  HelpTrack,
  IdeaCategory,
  IdeaLicense,
  IdeaResponse,
  IdeaRevision,
  IdeaStatus,
  ResponseType,
  Volunteer,
  VolunteerStatus,
} from '../types/synapse';
import {
  checkRateLimit,
  formatRelativeTime,
  getLicenseLabel,
  sanitizeTag,
  validateExternalUrl,
} from '../utils/sanitize';

interface IdeaDetailPageProps {
  tab: 'overview' | 'responses' | 'volunteers' | 'connections' | 'edit';
}

export const IdeaDetailPage: React.FC<IdeaDetailPageProps> = ({ tab }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    profile,
    isAdmin,
    ideas,
    ideasLoading,
    connections,
    showToast,
    openReportModal,
    requestConfirm,
  } = useApp();

  const idea = useMemo(() => ideas.find((i) => i.id === id), [ideas, id]);

  const [responses, setResponses] = useState<IdeaResponse[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [revisions, setRevisions] = useState<IdeaRevision[]>([]);

  // Volunteer Modal / Form State
  const [showVolunteerModal, setShowVolunteerModal] = useState(false);
  const [volRole, setVolRole] = useState('Software / Firmware Builder');
  const [volMessage, setVolMessage] = useState('');
  const [volSubmitting, setVolSubmitting] = useState(false);

  // Connect Idea Modal State
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [selectedConnectIdeaId, setSelectedConnectIdeaId] = useState('');
  const [connectReason, setConnectReason] = useState('');
  const [connectSubmitting, setConnectSubmitting] = useState(false);
  const [justPostedDismissed, setJustPostedDismissed] = useState(false);

  const isJustPosted = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('justPosted') === '1' || params.get('created') === 'true';
  }, [location.search]);

  // Community Check ("Does this already exist?") State
  const [showSimilarForm, setShowSimilarForm] = useState(false);
  const [similarContent, setSimilarContent] = useState('');
  const [similarUrl, setSimilarUrl] = useState('');
  const [similarSubmitting, setSimilarSubmitting] = useState(false);
  const [votedLooksNew, setVotedLooksNew] = useState(false);

  // Responses Page Form State
  const [respType, setRespType] = useState<ResponseType>('guidance');
  const [respContent, setRespContent] = useState('');
  const [respUrl, setRespUrl] = useState('');
  const [respSubmitting, setRespSubmitting] = useState(false);
  const [editingRespId, setEditingRespId] = useState<string | null>(null);
  const [editingRespContent, setEditingRespContent] = useState('');
  const [editingRespUrl, setEditingRespUrl] = useState('');

  // Showcase / Status Update Form on Volunteers tab (for Owner)
  const [showcaseUrlInput, setShowcaseUrlInput] = useState('');
  const [showcaseCreditsInput, setShowcaseCreditsInput] = useState('');
  const [showcaseNotesInput, setShowcaseNotesInput] = useState('');

  // Edit Idea Form State
  const [editTitle, setEditTitle] = useState('');
  const [editSummary, setEditSummary] = useState('');
  const [editProblem, setEditProblem] = useState('');
  const [editSolution, setEditSolution] = useState('');
  const [editHelpWanted, setEditHelpWanted] = useState('');
  const [editCheckNote, setEditCheckNote] = useState('');
  const [editCategory, setEditCategory] = useState<IdeaCategory>('Software');
  const [editTrack, setEditTrack] = useState<HelpTrack>('builder');
  const [editStatus, setEditStatus] = useState<IdeaStatus>('open');
  const [editLicense, setEditLicense] = useState<IdeaLicense>('mit');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Subscribe to responses and volunteers for this idea
  useEffect(() => {
    if (!id) return;
    const respQuery = query(
      collection(db, 'ideas', id, 'responses'),
      orderBy('createdAt', 'desc')
    );
    const unsubResp = onSnapshot(respQuery, (snap) => {
      setResponses(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<IdeaResponse, 'id'>),
        }))
      );
    });

    const volQuery = query(
      collection(db, 'ideas', id, 'volunteers'),
      orderBy('createdAt', 'desc')
    );
    const unsubVol = onSnapshot(volQuery, (snap) => {
      setVolunteers(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Volunteer, 'id'>),
        }))
      );
    });

    const unsubRev = subscribeToIdeaRevisions(id, setRevisions);

    return () => {
      unsubResp();
      unsubVol();
      unsubRev();
    };
  }, [id]);

  // Populate edit form when idea loads
  useEffect(() => {
    if (idea) {
      setEditTitle(idea.title);
      setEditSummary(idea.summary);
      setEditProblem(idea.problem);
      setEditSolution(idea.solution);
      setEditHelpWanted(idea.helpWanted);
      setEditCheckNote(idea.existingCheckNote || '');
      setEditCategory(idea.category);
      setEditTrack(idea.helpTrack);
      setEditStatus(idea.status);
      setEditLicense(idea.license);
      setEditTags(idea.tags);
      setShowcaseUrlInput(idea.showcaseUrl || '');
      setShowcaseCreditsInput(idea.showcaseCredits || '');
      setShowcaseNotesInput(idea.showcaseNotes || '');
    }
  }, [idea]);

  const myVolunteerRecord = useMemo(
    () => (user ? volunteers.find((v) => v.userId === user.uid) : undefined),
    [volunteers, user]
  );

  // User's own ideas for "This connects with my idea" picker (plus fallback to other ideas if user wants to link)
  const myOwnIdeas = useMemo(() => {
    if (!user || !idea) return [];
    return ideas.filter((i) => i.authorId === user.uid && i.id !== idea.id);
  }, [ideas, user, idea]);

  const otherAvailableIdeas = useMemo(() => {
    if (!idea) return [];
    return ideas.filter((i) => i.id !== idea.id);
  }, [ideas, idea]);

  useEffect(() => {
    if (myOwnIdeas.length > 0 && !selectedConnectIdeaId) {
      setSelectedConnectIdeaId(myOwnIdeas[0].id);
    } else if (myOwnIdeas.length === 0 && otherAvailableIdeas.length > 0 && !selectedConnectIdeaId) {
      setSelectedConnectIdeaId(otherAvailableIdeas[0].id);
    }
  }, [myOwnIdeas, otherAvailableIdeas, selectedConnectIdeaId]);

  const ideaConnections = useMemo(() => {
    if (!idea) return [];
    return connections.filter((c) => c.ideaA === idea.id || c.ideaB === idea.id);
  }, [connections, idea]);

  if (ideasLoading) {
    return <RouteSkeleton />;
  }

  if (!idea) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-margin py-20 text-center flex flex-col items-center gap-space-md">
        <PageMeta title="Idea Not Found — Synapse" description="This specification was not found." />
        <div className="w-16 h-16 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
          <span className="material-symbols-outlined text-[32px]">search_off</span>
        </div>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          Specification Node Not Found
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
          The requested idea ID does not exist in the registry or was removed by its author.
        </p>
        <Link
          to="/explore"
          className="min-h-[44px] px-space-lg rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to Explore Registry
        </Link>
      </div>
    );
  }

  const isOwner = Boolean(
    user &&
      (user.uid === idea.authorId ||
        user.uid === idea.authorUid ||
        (isAdmin &&
          (idea.authorId === SOLE_ADMIN_UID ||
            idea.authorUid === SOLE_ADMIN_UID ||
            idea.authorUsername === 'admin' ||
            idea.authorUsername === 'cardboardboxmask')))
  );
  const licenseInfo = getLicenseLabel(idea.license);
  const permalinkUrl = `${window.location.origin}/ideas/${idea.id}`;

  const requireAuth = (): boolean => {
    if (!user || !profile) {
      showToast('Please sign in with Google to participate.', 'info');
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname)}`);
      return false;
    }
    return true;
  };

  // Toggle Volunteer handler
  const handlePrimaryVolunteerClick = async () => {
    if (!requireAuth() || !user) return;
    if (myVolunteerRecord) {
      requestConfirm({
        title: 'Withdraw Volunteer Offer?',
        message: 'Are you sure you want to withdraw your offer to help on this idea?',
        confirmLabel: 'Withdraw Offer',
        destructive: true,
        onConfirm: async () => {
          await withdrawVolunteerWithTransaction(idea.id, user.uid);
          showToast('Your volunteer offer was withdrawn.', 'info');
        },
      });
    } else {
      setShowVolunteerModal(true);
    }
  };

  const handleSubmitVolunteer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !profile) return;
    if (volMessage.trim().length < 5) {
      showToast('Please write a short note on how you can help.', 'error');
      return;
    }
    const rl = checkRateLimit(`vol-${profile.uid}`, 4000);
    if (!rl.allowed) {
      showToast(`Please wait ${rl.waitSeconds}s before submitting.`, 'error');
      return;
    }
    setVolSubmitting(true);
    try {
      await volunteerForIdeaWithTransaction({
        ideaId: idea.id,
        ideaTitle: idea.title,
        ideaAuthorId: idea.authorId,
        role: volRole,
        message: volMessage,
        user: profile,
      });
      setVolMessage('');
      setShowVolunteerModal(false);
      showToast('You offered to help! Your status is now active.', 'success');
    } catch {
      showToast('Could not submit volunteer offer.', 'error');
    } finally {
      setVolSubmitting(false);
    }
  };

  const handleSubmitConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !profile) return;
    const targetIdea = ideas.find((i) => i.id === selectedConnectIdeaId);
    if (!targetIdea) {
      showToast('Please select an idea to link.', 'error');
      return;
    }
    if (connectReason.trim().length < 5) {
      showToast('Please describe how these two ideas complement each other.', 'error');
      return;
    }
    const rl = checkRateLimit(`conn-${profile.uid}`, 4000);
    if (!rl.allowed) {
      showToast(`Please wait ${rl.waitSeconds}s before linking again.`, 'error');
      return;
    }
    setConnectSubmitting(true);
    try {
      await connectIdeasWithTransaction({
        ideaA: idea,
        ideaB: targetIdea,
        reason: connectReason,
        actor: profile,
      });
      setConnectReason('');
      setShowConnectModal(false);
      showToast('Ideas connected!', 'success');
    } catch {
      showToast('Could not link ideas.', 'error');
    } finally {
      setConnectSubmitting(false);
    }
  };

  const handleVoteLooksNew = async () => {
    if (!requireAuth() || !user) return;
    if (votedLooksNew) {
      showToast('You already marked this idea as looking new.', 'info');
      return;
    }
    try {
      await markIdeaLooksNewWithTransaction(idea.id);
      setVotedLooksNew(true);
      showToast('Recorded: Looks like a new concept!', 'success');
    } catch {
      showToast('Could not record community check.', 'error');
    }
  };

  const handleSubmitSimilarCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !profile) return;
    if (similarContent.trim().length < 5) {
      showToast('Please describe the similar project or existing library.', 'error');
      return;
    }
    if (similarUrl.trim()) {
      const urlCheck = validateExternalUrl(similarUrl);
      if (!urlCheck.valid) {
        showToast(urlCheck.error || 'Invalid reference URL.', 'error');
        return;
      }
    }
    setSimilarSubmitting(true);
    try {
      await addResponseWithTransaction({
        ideaId: idea.id,
        ideaTitle: idea.title,
        ideaAuthorId: idea.authorId,
        type: 'similar-check',
        content: similarContent,
        referenceUrl: similarUrl,
        author: profile,
      });
      setSimilarContent('');
      setSimilarUrl('');
      setShowSimilarForm(false);
      showToast('Existing project note added to Community Check!', 'success');
    } catch {
      showToast('Could not submit note.', 'error');
    } finally {
      setSimilarSubmitting(false);
    }
  };

  const handleCreateResponse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth() || !profile) return;
    if (respContent.trim().length < 3) {
      showToast('Response cannot be empty.', 'error');
      return;
    }
    if (respUrl.trim()) {
      const urlCheck = validateExternalUrl(respUrl);
      if (!urlCheck.valid) {
        showToast(urlCheck.error || 'Invalid reference URL.', 'error');
        return;
      }
    }
    const rl = checkRateLimit(`resp-${profile.uid}`, 4000);
    if (!rl.allowed) {
      showToast(`Please wait ${rl.waitSeconds}s before posting again.`, 'error');
      return;
    }
    setRespSubmitting(true);
    try {
      await addResponseWithTransaction({
        ideaId: idea.id,
        ideaTitle: idea.title,
        ideaAuthorId: idea.authorId,
        type: respType,
        content: respContent,
        referenceUrl: respUrl,
        author: profile,
      });
      setRespContent('');
      setRespUrl('');
      showToast('Response posted!', 'success');
    } catch {
      showToast('Failed to post response.', 'error');
    } finally {
      setRespSubmitting(false);
    }
  };

  const handleSaveEditResponse = async (responseId: string) => {
    if (editingRespContent.trim().length < 3) {
      showToast('Response content is too short.', 'error');
      return;
    }
    try {
      await updateResponseByOwner({
        ideaId: idea.id,
        responseId,
        content: editingRespContent,
        referenceUrl: editingRespUrl,
      });
      setEditingRespId(null);
      showToast('Response updated.', 'success');
    } catch {
      showToast('Could not update response.', 'error');
    }
  };

  const handleDeleteResponse = (responseId: string) => {
    requestConfirm({
      title: 'Delete Response?',
      message: 'This will permanently remove your response from this idea.',
      confirmLabel: 'Delete Response',
      destructive: true,
      onConfirm: async () => {
        await deleteResponseWithTransaction(idea.id, responseId);
        showToast('Response deleted.', 'info');
      },
    });
  };

  const handleVolunteerStatusDecision = async (
    volunteerUserId: string,
    nextStatus: VolunteerStatus
  ) => {
    if (!profile || !isOwner) return;
    try {
      await updateVolunteerStatusByOwner({
        ideaId: idea.id,
        ideaTitle: idea.title,
        volunteerUserId,
        status: nextStatus,
        owner: profile,
      });
      showToast(`Volunteer marked as ${nextStatus}.`, 'success');
    } catch {
      showToast('Could not update volunteer status.', 'error');
    }
  };

  const handleOwnerStatusChange = async (newStatus: IdeaStatus) => {
    if (!isOwner && !isAdmin) return;
    if (newStatus === 'built' && showcaseUrlInput.trim()) {
      const urlCheck = validateExternalUrl(showcaseUrlInput);
      if (!urlCheck.valid) {
        showToast(urlCheck.error || 'Invalid showcase URL.', 'error');
        return;
      }
    }
    try {
      await updateIdeaDetails(
        idea.id,
        {
          status: newStatus,
          ...(newStatus === 'built'
            ? {
                showcaseUrl: showcaseUrlInput,
                showcaseCredits: showcaseCreditsInput,
                showcaseNotes: showcaseNotesInput,
              }
            : {}),
        },
        { isAdmin, editorName: profile?.username }
      );
      showToast(`Idea lifecycle status updated to "${newStatus}".`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update status.';
      showToast(msg, 'error');
    }
  };

  const handleSaveIdeaEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner && !isAdmin) return;
    if (editTitle.trim().length < 5 || editSummary.trim().length < 10) {
      showToast('Title and summary must be filled out.', 'error');
      return;
    }
    if (showcaseUrlInput.trim()) {
      const urlCheck = validateExternalUrl(showcaseUrlInput);
      if (!urlCheck.valid) {
        showToast(urlCheck.error || 'Invalid showcase URL.', 'error');
        return;
      }
    }
    setEditSaving(true);
    try {
      await updateIdeaDetails(
        idea.id,
        {
          title: editTitle,
          summary: editSummary,
          problem: editProblem,
          solution: editSolution,
          helpWanted: editHelpWanted,
          existingCheckNote: editCheckNote,
          category: editCategory,
          tags: editTags,
          helpTrack: editTrack,
          status: editStatus,
          license: editLicense,
          showcaseUrl: showcaseUrlInput,
          showcaseCredits: showcaseCreditsInput,
          showcaseNotes: showcaseNotesInput,
        },
        { isAdmin, editorName: profile?.username }
      );
      showToast('Idea specification updated!', 'success');
      navigate(`/ideas/${idea.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save changes.';
      showToast(msg, 'error');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteIdea = () => {
    requestConfirm({
      title: 'Delete Idea Specification?',
      message:
        'This action cannot be undone. Your idea specification will be permanently deleted from the registry.',
      confirmLabel: 'Delete Permanently',
      destructive: true,
      onConfirm: async () => {
        await deleteIdea(idea.id);
        showToast('Idea deleted.', 'info');
        navigate('/explore');
      },
    });
  };

  const copyPermalink = () => {
    navigator.clipboard
      .writeText(permalinkUrl)
      .then(() => showToast('Direct permalink copied to clipboard!', 'success'))
      .catch(() => showToast('Failed to copy link.', 'error'));
  };

  const similarChecks = responses.filter((r) => r.type === 'similar-check');

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-margin py-space-xl flex flex-col gap-space-xl">
      <PageMeta
        title={`${idea.title} — Synapse`}
        description={idea.summary}
      />

      {/* Just-Posted Share Celebration Banner */}
      {isJustPosted && !justPostedDismissed && (
        <section
          aria-label="Idea publication confirmation"
          className="p-space-lg rounded-2xl bg-secondary/15 border-2 border-secondary/40 flex flex-col md:flex-row md:items-center justify-between gap-space-md shadow-lg animate-fade-in"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">verified</span>
            </div>
            <div className="flex flex-col gap-1">
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                🎉 Your idea is live on Synapse!
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Your specification is published to the public registry. Share this direct link with collaborators, co-founders, and builders.
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <input
                  type="text"
                  readOnly
                  aria-label="Direct shareable link to this idea"
                  value={permalinkUrl}
                  className="h-10 px-3 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-code-sm border border-outline-variant/30 w-72 sm:w-96 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={copyPermalink}
                  className="min-h-[40px] px-4 rounded-lg bg-secondary text-on-secondary font-title-md text-title-md font-semibold hover:opacity-95 transition-opacity flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">content_copy</span>
                  Copy Share Link
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start md:self-center shrink-0">
            <button
              type="button"
              onClick={() => setJustPostedDismissed(true)}
              className="min-h-[40px] px-3 rounded-lg text-on-surface-variant hover:text-on-surface font-label-md text-label-md"
            >
              Dismiss
            </button>
          </div>
        </section>
      )}

      {/* Top Meta Hierarchy: Breadcrumbs & Badges */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-space-xs font-code-sm text-code-sm text-on-surface-variant/80 flex-wrap"
        >
          <Link to="/explore" className="hover:text-primary transition-colors">
            Explore
          </Link>
          <span>/</span>
          <Link
            to={`/explore?cat=${idea.category.toLowerCase()}`}
            className="hover:text-primary transition-colors"
          >
            {idea.category}
          </Link>
          <span>/</span>
          <span className="text-on-surface truncate max-w-xs">{idea.title}</span>
        </nav>

        <div className="flex items-center gap-space-sm flex-wrap">
          {idea.adminVerified && (
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/15 text-secondary font-code-sm text-code-sm font-semibold uppercase tracking-wider"
              title="Reviewed and verified by a Synapse Administrator"
            >
              <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                verified
              </span>
              Admin Verified
            </span>
          )}
          {isAdmin && profile && (
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(idea.adminVerified)}
              onClick={async () => {
                try {
                  const next = !idea.adminVerified;
                  await toggleIdeaAdminVerified({
                    idea,
                    verified: next,
                    admin: profile,
                  });
                  showToast(
                    next
                      ? 'Granted "Admin Verified" badge to this specification.'
                      : 'Revoked "Admin Verified" badge from this specification.',
                    'success'
                  );
                } catch (err) {
                  showToast(
                    err instanceof Error ? err.message : 'Could not update verification status.',
                    'error'
                  );
                }
              }}
              className={`min-h-[34px] px-3 rounded-full font-code-sm text-code-sm inline-flex items-center gap-1.5 transition-colors ${
                idea.adminVerified
                  ? 'bg-secondary text-on-secondary font-semibold'
                  : 'bg-surface-container-high text-primary hover:text-on-surface border border-primary/40'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                {idea.adminVerified ? 'verified' : 'admin_panel_settings'}
              </span>
              <span>{idea.adminVerified ? 'Admin Verified ✓ (Revoke)' : 'Grant Admin Verified'}</span>
            </button>
          )}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-secondary font-label-sm text-label-sm uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
            {idea.category} Spec
          </span>
        </div>
      </div>

      {/* Main Header Card & Kinetic Horizon */}
      <div className="relative bg-surface-container-low rounded-2xl p-space-lg sm:p-space-xl overflow-hidden shadow-xl">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary-container/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col gap-space-lg">
          {/* Status Stepper & Help Track Pill */}
          <div className="flex flex-wrap items-center justify-between gap-space-md pb-space-sm border-b border-surface-variant/30">
            <div className="flex items-center gap-space-sm font-code-sm text-code-sm flex-wrap">
              <span
                className={`flex items-center gap-2 px-3 py-1 rounded-full ${
                  idea.status === 'open'
                    ? 'text-primary font-semibold bg-surface-container-highest'
                    : 'text-on-surface-variant/60'
                }`}
              >
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    idea.status === 'open'
                      ? 'bg-primary-container shadow-[0_0_8px_#f5a524]'
                      : 'bg-surface-variant'
                  }`}
                />
                Open (Active Call)
              </span>
              <span className="text-on-surface-variant/40">—</span>
              <span
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${
                  idea.status === 'in-progress'
                    ? 'text-secondary font-semibold bg-surface-container-highest'
                    : 'text-on-surface-variant/60'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    idea.status === 'in-progress' ? 'bg-secondary' : 'bg-surface-variant'
                  }`}
                />
                In Progress
              </span>
              <span className="text-on-surface-variant/40">—</span>
              <span
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${
                  idea.status === 'built'
                    ? 'text-tertiary font-semibold bg-surface-container-highest'
                    : 'text-on-surface-variant/60'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    idea.status === 'built' ? 'bg-tertiary' : 'bg-surface-variant'
                  }`}
                />
                Built
              </span>
            </div>

            <div
              className={`flex items-center gap-space-xs px-3 py-1 rounded-full font-label-md text-label-md uppercase tracking-wide ${
                idea.helpTrack === 'builder'
                  ? 'bg-primary-container/15 text-primary'
                  : 'bg-tertiary-container/20 text-tertiary'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {idea.helpTrack === 'builder' ? 'handyman' : 'school'}
              </span>
              {idea.helpTrack === 'builder' ? 'NEEDS A BUILDER' : 'NEEDS GUIDANCE'}
            </div>
          </div>

          {/* Headline & Summary */}
          <div className="flex flex-col gap-space-xs max-w-4xl">
            <h1 className="font-headline-xl text-headline-lg-mobile sm:text-headline-xl tracking-tight text-on-surface">
              {idea.title}
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">{idea.summary}</p>
            <div className="flex flex-wrap gap-1.5 pt-2">
              {idea.tags.map((t) => (
                <Link
                  key={t}
                  to={`/explore?q=${encodeURIComponent(t)}`}
                  className="font-code-sm text-code-sm bg-surface-container-high hover:bg-surface-bright text-on-surface-variant px-2.5 py-0.5 rounded transition-colors"
                >
                  #{t}
                </Link>
              ))}
            </div>
          </div>

          {/* IP & Sovereignty Banner */}
          <div className="flex items-center gap-space-sm px-space-md py-space-sm bg-surface-container-lowest rounded-lg font-code-sm text-code-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-secondary text-[20px]">lock_open</span>
            <span>
              <strong className="text-on-surface font-medium">{licenseInfo.short}</strong> · Your
              idea stays yours. Synapse claims no IP, rights, or equity stake.
            </span>
          </div>

          {/* Primary Action Cluster */}
          <div className="flex flex-wrap items-center justify-between gap-space-md pt-space-xs">
            <div className="flex items-center gap-space-md flex-wrap">
              <button
                type="button"
                onClick={handlePrimaryVolunteerClick}
                className={`min-h-[44px] px-6 rounded-lg font-title-md text-title-md flex items-center justify-center gap-2 transition-all shadow-md ${
                  myVolunteerRecord
                    ? 'bg-secondary text-on-secondary'
                    : 'bg-primary-container text-on-primary hover:opacity-95'
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">
                  {myVolunteerRecord ? 'how_to_reg' : 'group_add'}
                </span>
                <span>{myVolunteerRecord ? 'You offered to help' : 'I can help build this'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (requireAuth()) setShowConnectModal(true);
                }}
                className="min-h-[44px] px-5 rounded-lg bg-surface-container-high text-secondary font-title-md text-title-md flex items-center justify-center gap-2 hover:bg-surface-bright transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-[20px]">hub</span>
                <span>This connects with my idea</span>
              </button>
            </div>

            <div className="flex items-center gap-space-xs flex-wrap">
              <BookmarkButton idea={idea} variant="button" />

              <Link
                to={`/ideas/${idea.id}/responses`}
                className="min-h-[44px] px-3.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-title-md text-title-md flex items-center gap-1.5 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">chat_bubble</span>
                <span>Respond</span>
              </Link>

              {(isOwner || isAdmin) && (
                <>
                  <Link
                    to={`/ideas/${idea.id}/edit`}
                    className="min-h-[44px] px-3.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-title-md text-title-md flex items-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">edit</span>
                    <span>Edit</span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleDeleteIdea}
                    className="min-h-[44px] px-3.5 rounded-lg bg-surface-container hover:bg-error-container text-on-surface-variant hover:text-on-error-container font-title-md text-title-md flex items-center gap-1.5 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                    <span>Delete</span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={copyPermalink}
                className="min-h-[44px] px-3.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-title-md text-title-md flex items-center gap-1.5 transition-colors"
                title="Copy permalink"
              >
                <span className="material-symbols-outlined text-[18px]">share</span>
                <span className="hidden sm:inline">Share</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  openReportModal({
                    targetType: 'idea',
                    targetId: idea.id,
                    targetTitle: idea.title,
                  })
                }
                className="min-h-[44px] px-3.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-error font-title-md text-title-md flex items-center gap-1.5 transition-colors"
                title="Report content"
              >
                <span className="material-symbols-outlined text-[18px]">flag</span>
                <span className="hidden sm:inline">Report</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sub-navigation Route Tabs */}
      <div
        className="flex items-center gap-space-lg border-b border-surface-variant/40 font-title-md text-title-md overflow-x-auto"
        role="tablist"
      >
        <Link
          to={`/ideas/${idea.id}`}
          role="tab"
          aria-selected={tab === 'overview'}
          className={`min-h-[44px] py-space-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
            tab === 'overview'
              ? 'text-primary font-semibold border-b-2 border-primary-container'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">description</span>
          Overview
        </Link>

        <Link
          to={`/ideas/${idea.id}/responses`}
          role="tab"
          aria-selected={tab === 'responses'}
          className={`min-h-[44px] py-space-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
            tab === 'responses'
              ? 'text-primary font-semibold border-b-2 border-primary-container'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">chat_bubble</span>
          Responses
          <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-code-sm text-code-sm">
            {idea.responseCount || 0}
          </span>
        </Link>

        <Link
          to={`/ideas/${idea.id}/volunteers`}
          role="tab"
          aria-selected={tab === 'volunteers'}
          className={`min-h-[44px] py-space-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
            tab === 'volunteers'
              ? 'text-primary font-semibold border-b-2 border-primary-container'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">group</span>
          Volunteers
          <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-code-sm text-code-sm">
            {idea.volunteerCount || 0}
          </span>
        </Link>

        <Link
          to={`/ideas/${idea.id}/connections`}
          role="tab"
          aria-selected={tab === 'connections'}
          className={`min-h-[44px] py-space-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
            tab === 'connections'
              ? 'text-primary font-semibold border-b-2 border-primary-container'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">schema</span>
          Connections
          <span className="px-2 py-0.5 rounded-full bg-secondary-container/20 text-secondary font-code-sm text-code-sm">
            {idea.connectionCount || 0}
          </span>
        </Link>

        {(isOwner || isAdmin) && (
          <Link
            to={`/ideas/${idea.id}/edit`}
            role="tab"
            aria-selected={tab === 'edit'}
            className={`min-h-[44px] py-space-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
              tab === 'edit'
                ? 'text-primary font-semibold border-b-2 border-primary-container'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">edit_note</span>
            Edit Spec
          </Link>
        )}
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
        {/* Left Main Content Column (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-space-xl">
          {tab === 'overview' && (
            <>
              {/* THE PROBLEM */}
              <section className="bg-surface-container rounded-2xl p-space-xl flex flex-col gap-space-md shadow-sm">
                <div className="flex items-center gap-space-sm text-error">
                  <span className="material-symbols-outlined text-[22px]">crisis_alert</span>
                  <h2 className="font-headline-sm text-headline-sm uppercase tracking-wide">
                    The Problem
                  </h2>
                </div>
                <p className="font-body-lg text-body-lg text-on-surface leading-relaxed whitespace-pre-line">
                  {idea.problem}
                </p>
              </section>

              {/* THE SOLUTION / IDEA */}
              <section className="bg-surface-container rounded-2xl p-space-xl flex flex-col gap-space-lg shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-space-sm text-secondary">
                    <span className="material-symbols-outlined text-[22px]">lightbulb</span>
                    <h2 className="font-headline-sm text-headline-sm uppercase tracking-wide">
                      The Solution / Idea
                    </h2>
                  </div>
                  <span className="font-code-sm text-code-sm text-secondary bg-surface-container-lowest px-2.5 py-1 rounded">
                    Protocol Spec · {licenseInfo.short}
                  </span>
                </div>

                <p className="font-body-lg text-body-lg text-on-surface leading-relaxed whitespace-pre-line">
                  {idea.solution}
                </p>
              </section>

              {/* HELP WANTED / BUILDER PROFILE */}
              <section className="bg-surface-container rounded-2xl p-space-xl flex flex-col gap-space-md shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-space-sm text-primary">
                    <span className="material-symbols-outlined text-[22px]">engineering</span>
                    <h2 className="font-headline-sm text-headline-sm uppercase tracking-wide">
                      Help Wanted /{' '}
                      {idea.helpTrack === 'builder' ? 'Builder Profile' : 'Guidance Scope'}
                    </h2>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full bg-primary-container/20 text-primary font-label-sm text-label-sm uppercase">
                    {idea.helpTrack === 'builder' ? 'Builder Track' : 'Guidance Track'}
                  </span>
                </div>
                <p className="font-body-lg text-body-lg text-on-surface leading-relaxed whitespace-pre-line">
                  {idea.helpWanted}
                </p>
              </section>

              {/* COMMUNITY CHECK: DOES THIS ALREADY EXIST? */}
              <section className="bg-surface-container rounded-2xl p-space-xl flex flex-col gap-space-md shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-space-sm text-on-surface">
                    <span className="material-symbols-outlined text-[22px]">compare_arrows</span>
                    <h2 className="font-headline-sm text-headline-sm uppercase tracking-wide">
                      Community Check: Does this already exist?
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 font-code-sm text-code-sm text-on-surface-variant">
                    <span>Similar flagged: {idea.communityCheckSimilar || 0}</span>
                    <span>·</span>
                    <span className="text-secondary">
                      Looks new: {idea.communityCheckNew || 0}
                    </span>
                  </div>
                </div>

                {idea.existingCheckNote && (
                  <div className="bg-surface-container-high rounded-xl p-space-md flex flex-col gap-space-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-space-xs">
                        <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center font-code-sm text-code-sm text-on-primary font-bold">
                          @
                        </div>
                        <span className="font-title-md text-title-md text-on-surface">
                          {idea.authorUsername} note
                        </span>
                      </div>
                      <span className="font-code-sm text-code-sm text-on-surface-variant">
                        Author Prior-Art Note
                      </span>
                    </div>
                    <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                      “{idea.existingCheckNote}”
                    </p>
                  </div>
                )}

                {/* Community Check Action Buttons */}
                <div className="flex flex-wrap items-center gap-space-sm pt-space-xs">
                  <button
                    type="button"
                    onClick={() => {
                      if (requireAuth()) setShowSimilarForm((prev) => !prev);
                    }}
                    className="min-h-[44px] px-4 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-title-md text-title-md inline-flex items-center gap-2 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px] text-primary">
                      find_replace
                    </span>
                    <span>Found something similar ({idea.communityCheckSimilar || 0})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleVoteLooksNew}
                    className={`min-h-[44px] px-4 rounded-lg font-title-md text-title-md inline-flex items-center gap-2 transition-colors ${
                      votedLooksNew
                        ? 'bg-secondary text-on-secondary'
                        : 'bg-surface-container-high hover:bg-surface-bright text-secondary'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                    <span>Looks new ({idea.communityCheckNew || 0})</span>
                  </button>
                </div>

                {showSimilarForm && (
                  <form
                    onSubmit={handleSubmitSimilarCheck}
                    className="bg-surface-container-low p-space-md rounded-xl flex flex-col gap-space-sm border border-surface-variant/40"
                  >
                    <label className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                      Share an existing project, library, or prior art
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={similarContent}
                      onChange={(e) => setSimilarContent(e.target.value)}
                      placeholder="Explain what already exists and how this idea might use or differ from it..."
                      className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm focus:outline-none"
                    />
                    <input
                      type="url"
                      value={similarUrl}
                      onChange={(e) => setSimilarUrl(e.target.value)}
                      placeholder="Optional URL (e.g., https://github.com/...)"
                      className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowSimilarForm(false)}
                        className="min-h-[44px] px-4 rounded-lg text-on-surface-variant hover:text-on-surface font-title-md text-title-md"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={similarSubmitting}
                        className="min-h-[44px] px-5 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md"
                      >
                        {similarSubmitting ? 'Posting...' : 'Post Similar Project Note'}
                      </button>
                    </div>
                  </form>
                )}

                {similarChecks.length > 0 && (
                  <div className="flex flex-col gap-space-xs pt-space-sm">
                    <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                      Community Prior-Art Notes ({similarChecks.length})
                    </span>
                    {similarChecks.map((sc) => (
                      <div
                        key={sc.id}
                        className="p-space-md rounded-lg bg-surface-container-low flex flex-col gap-1"
                      >
                        <div className="flex items-center justify-between text-xs text-on-surface-variant">
                          <span className="font-semibold text-on-surface">
                            @{sc.authorUsername}
                          </span>
                          <span>{formatRelativeTime(sc.createdAt)}</span>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface-variant">
                          {sc.content}
                        </p>
                        {sc.referenceUrl && (
                          <a
                            href={sc.referenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-code-sm text-code-sm text-secondary hover:underline inline-flex items-center gap-1 mt-1"
                          >
                            {sc.referenceUrl}
                            <span className="material-symbols-outlined text-[14px]">
                              open_in_new
                            </span>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {/* TAB 2: RESPONSES PAGE (/ideas/:id/responses) */}
          {tab === 'responses' && (
            <div className="flex flex-col gap-space-lg">
              <div className="bg-surface-container rounded-2xl p-space-xl flex flex-col gap-space-md shadow-sm">
                <h2 className="font-headline-sm text-headline-sm text-on-surface">
                  Post a Response
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Share architectural guidance, offer to help build a component, or propose a
                  connection.
                </p>

                {user ? (
                  <form onSubmit={handleCreateResponse} className="flex flex-col gap-space-md">
                    <div>
                      <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-2">
                        Response Type
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        {(
                          [
                            { key: 'guidance', label: 'Guidance', icon: 'school' },
                            { key: 'offer-to-build', label: 'Offer to build', icon: 'handyman' },
                            { key: 'connection', label: 'Connection suggestion', icon: 'hub' },
                            {
                              key: 'similar-check',
                              label: 'Similar existing work',
                              icon: 'find_replace',
                            },
                          ] as const
                        ).map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setRespType(item.key)}
                            className={`min-h-[44px] px-3 rounded-lg font-label-md text-label-md flex items-center justify-center gap-2 transition-colors ${
                              respType === item.key
                                ? 'bg-primary-container text-on-primary font-semibold'
                                : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[18px]">
                              {item.icon}
                            </span>
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="response-content"
                        className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1"
                      >
                        Your Response
                      </label>
                      <textarea
                        id="response-content"
                        rows={4}
                        required
                        value={respContent}
                        onChange={(e) => setRespContent(e.target.value)}
                        placeholder="Write constructive technical feedback, architecture guidance, or how you'd like to collaborate..."
                        className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface font-body-md text-body-md placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary-container"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="response-url"
                        className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1"
                      >
                        Reference Link (Optional)
                      </label>
                      <input
                        id="response-url"
                        type="url"
                        value={respUrl}
                        onChange={(e) => setRespUrl(e.target.value)}
                        placeholder="https://github.com/..."
                        className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm focus:outline-none"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={respSubmitting}
                        className="min-h-[44px] px-6 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md hover:opacity-95 disabled:opacity-50"
                      >
                        {respSubmitting ? 'Posting...' : 'Publish Response'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="bg-surface-container-low p-space-lg rounded-xl flex flex-col sm:flex-row items-center justify-between gap-space-md">
                    <p className="font-body-md text-body-md text-on-surface-variant">
                      Sign in with Google to post guidance, offer to build, or share links.
                    </p>
                    <Link
                      to={`/login?returnTo=${encodeURIComponent(location.pathname)}`}
                      className="min-h-[44px] px-5 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-2 shrink-0"
                    >
                      Sign in to Respond
                    </Link>
                  </div>
                )}
              </div>

              {/* Responses List */}
              {responses.length === 0 ? (
                <div className="bg-surface-container-low rounded-2xl p-12 text-center flex flex-col items-center gap-space-sm">
                  <span className="material-symbols-outlined text-[36px] text-on-surface-variant/60">
                    forum
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">
                    0 responses yet
                  </h3>
                  <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
                    Be the first peer to offer architectural guidance, link a library, or offer to
                    build.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-space-md">
                  {responses.map((resp) => {
                    const isRespOwner = Boolean(user && user.uid === resp.authorId);
                    const isEditing = editingRespId === resp.id;
                    return (
                      <article
                        key={resp.id}
                        className="bg-surface-container rounded-2xl p-space-lg flex flex-col gap-space-sm"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Link
                              to={`/u/${resp.authorUsername}`}
                              className="font-title-md text-title-md text-on-surface hover:text-primary"
                            >
                              @{resp.authorUsername}
                            </Link>
                            <span
                              className={`px-2.5 py-0.5 rounded-full font-label-sm text-label-sm uppercase ${
                                resp.type === 'offer-to-build'
                                  ? 'bg-primary/15 text-primary'
                                  : resp.type === 'connection'
                                  ? 'bg-secondary/15 text-secondary'
                                  : 'bg-tertiary/15 text-tertiary'
                              }`}
                            >
                              {resp.type.replace(/-/g, ' ')}
                            </span>
                          </div>
                          <span className="font-code-sm text-code-sm text-on-surface-variant">
                            {formatRelativeTime(resp.createdAt)}
                          </span>
                        </div>

                        {isEditing ? (
                          <div className="flex flex-col gap-2 pt-2">
                            <textarea
                              rows={3}
                              value={editingRespContent}
                              onChange={(e) => setEditingRespContent(e.target.value)}
                              className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface font-body-md text-body-md"
                            />
                            <input
                              type="url"
                              value={editingRespUrl}
                              onChange={(e) => setEditingRespUrl(e.target.value)}
                              placeholder="Optional reference URL"
                              className="w-full h-10 px-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingRespId(null)}
                                className="min-h-[40px] px-4 rounded-lg text-on-surface-variant hover:text-on-surface font-label-md text-label-md"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveEditResponse(resp.id)}
                                className="min-h-[40px] px-4 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">
                              {resp.content}
                            </p>
                            {resp.referenceUrl && (
                              <a
                                href={resp.referenceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-code-sm text-code-sm text-secondary hover:underline inline-flex items-center gap-1 w-fit"
                              >
                                {resp.referenceUrl}
                                <span className="material-symbols-outlined text-[14px]">
                                  open_in_new
                                </span>
                              </a>
                            )}
                          </>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-variant/20">
                          {isRespOwner && !isEditing && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRespId(resp.id);
                                setEditingRespContent(resp.content);
                                setEditingRespUrl(resp.referenceUrl || '');
                              }}
                              className="min-h-[36px] px-3 rounded text-on-surface-variant hover:text-on-surface font-code-sm text-code-sm inline-flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[15px]">edit</span>
                              Edit
                            </button>
                          )}
                          {(isRespOwner || isAdmin) && !isEditing && (
                            <button
                              type="button"
                              onClick={() => handleDeleteResponse(resp.id)}
                              className="min-h-[36px] px-3 rounded text-on-surface-variant hover:text-error font-code-sm text-code-sm inline-flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[15px]">
                                delete
                              </span>
                              Delete
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              openReportModal({
                                targetType: 'response',
                                targetId: resp.id,
                                targetTitle: `Response by @${resp.authorUsername}`,
                              })
                            }
                            className="min-h-[36px] px-3 rounded text-on-surface-variant hover:text-error font-code-sm text-code-sm inline-flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[15px]">flag</span>
                            Report
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VOLUNTEERS PAGE (/ideas/:id/volunteers) */}
          {tab === 'volunteers' && (
            <div className="flex flex-col gap-space-lg">
              {/* Owner Lifecycle Status & Volunteer Management Control */}
              {isOwner && (
                <div className="bg-surface-container rounded-2xl p-space-xl flex flex-col gap-space-md border border-primary-container/30">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <h2 className="font-headline-sm text-headline-sm text-on-surface">
                      Poster Controls: Idea Status &amp; Showcase
                    </h2>
                    <span className="font-code-sm text-code-sm text-primary uppercase">
                      Owner Dashboard
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Update this idea’s lifecycle status as volunteers join or when the prototype is
                    built.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['open', 'in-progress', 'built'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleOwnerStatusChange(st)}
                        className={`min-h-[44px] px-4 rounded-lg font-title-md text-title-md capitalize transition-colors ${
                          idea.status === st
                            ? 'bg-primary-container text-on-primary font-semibold'
                            : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        Mark {st.replace('-', ' ')}
                      </button>
                    ))}
                  </div>

                  {idea.status === 'built' && (
                    <div className="pt-space-sm flex flex-col gap-space-sm border-t border-surface-variant/30">
                      <span className="font-code-sm text-code-sm text-secondary uppercase">
                        Showcase Details (Published on /showcase)
                      </span>
                      <input
                        type="url"
                        value={showcaseUrlInput}
                        onChange={(e) => setShowcaseUrlInput(e.target.value)}
                        placeholder="Repository or live prototype URL (https://...)"
                        className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                      />
                      <input
                        type="text"
                        value={showcaseCreditsInput}
                        onChange={(e) => setShowcaseCreditsInput(e.target.value)}
                        placeholder="Contributor credits (e.g. @alice, @bob)"
                        className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                      />
                      <textarea
                        rows={2}
                        value={showcaseNotesInput}
                        onChange={(e) => setShowcaseNotesInput(e.target.value)}
                        placeholder="Field notes or build summary..."
                        className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                      />
                      <button
                        type="button"
                        onClick={() => handleOwnerStatusChange('built')}
                        className="min-h-[44px] px-5 rounded-lg bg-secondary text-on-secondary font-title-md text-title-md self-end"
                      >
                        Save Showcase Credits
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Volunteer Roster */}
              {volunteers.length === 0 ? (
                <div className="bg-surface-container-low rounded-2xl p-12 text-center flex flex-col items-center gap-space-md">
                  <span className="material-symbols-outlined text-[36px] text-on-surface-variant/60">
                    person_search
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">
                    0 active volunteers
                  </h3>
                  <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
                    Volunteering is optional, free, and no-commitment. Step up to help build or
                    guide this specification.
                  </p>
                  <button
                    type="button"
                    onClick={handlePrimaryVolunteerClick}
                    className="min-h-[44px] px-6 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">handyman</span>
                    I can help build this
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-space-md">
                  {volunteers.map((vol) => (
                    <div
                      key={vol.id}
                      className="bg-surface-container rounded-2xl p-space-lg flex flex-col gap-space-sm"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/u/${vol.userUsername}`}
                            className="font-title-md text-title-md text-on-surface hover:text-primary"
                          >
                            @{vol.userUsername}
                          </Link>
                          <span className="font-code-sm text-code-sm text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                            {vol.role}
                          </span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-code-sm text-code-sm uppercase ${
                            vol.status === 'accepted'
                              ? 'bg-secondary/20 text-secondary'
                              : vol.status === 'declined'
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-surface-container-highest text-on-surface-variant'
                          }`}
                        >
                          {vol.status}
                        </span>
                      </div>

                      <p className="font-body-md text-body-md text-on-surface-variant">
                        {vol.message}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-surface-variant/20 text-xs text-on-surface-variant flex-wrap gap-2">
                        <span>Offered {formatRelativeTime(vol.createdAt)}</span>
                        <div className="flex items-center gap-2">
                          {user?.uid === vol.userId && (
                            <button
                              type="button"
                              onClick={handlePrimaryVolunteerClick}
                              className="min-h-[36px] px-3 rounded bg-surface-container-highest text-on-surface-variant hover:text-error font-label-md text-label-md"
                            >
                              Withdraw Offer
                            </button>
                          )}
                          {isOwner && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  handleVolunteerStatusDecision(vol.userId, 'accepted')
                                }
                                className="min-h-[36px] px-3 rounded bg-secondary text-on-secondary font-label-md text-label-md"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleVolunteerStatusDecision(vol.userId, 'declined')
                                }
                                className="min-h-[36px] px-3 rounded bg-surface-container-highest text-on-surface-variant hover:text-error font-label-md text-label-md"
                              >
                                Decline
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: CONNECTIONS PAGE (/ideas/:id/connections) */}
          {tab === 'connections' && (
            <div className="flex flex-col gap-space-lg">
              <div className="bg-surface-container rounded-2xl p-space-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md">
                <div>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface">
                    Connected Ideas {ideaConnections.length > 0 && `(${ideaConnections.length})`}
                  </h2>
                  <p className="font-body-sm text-[13px] text-on-surface-variant">
                    Related ideas connected by community members.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (requireAuth()) setShowConnectModal(true);
                  }}
                  className="min-h-[44px] px-5 rounded-lg bg-secondary text-on-secondary font-title-md text-title-md inline-flex items-center gap-2 shrink-0 font-medium"
                >
                  <span className="material-symbols-outlined text-[18px]">hub</span>
                  Connect an idea
                </button>
              </div>

              {ideaConnections.length === 0 ? (
                <div className="bg-surface-container-low rounded-2xl p-12 text-center flex flex-col items-center gap-space-md">
                  <span className="material-symbols-outlined text-[36px] text-secondary">hub</span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">
                    No connected ideas yet
                  </h3>
                  <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
                    Have a related idea? Connect your idea to show how they fit together on the Idea Map.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (requireAuth()) setShowConnectModal(true);
                    }}
                    className="min-h-[44px] px-6 rounded-lg bg-surface-container-high text-secondary hover:bg-surface-bright font-title-md text-title-md inline-flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px]">add_link</span>
                    Link an Idea
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-space-md">
                  {ideaConnections.map((conn) => {
                    const otherId = conn.ideaA === idea.id ? conn.ideaB : conn.ideaA;
                    const otherTitle = conn.ideaA === idea.id ? conn.ideaBTitle : conn.ideaATitle;
                    const otherIdeaObj = ideas.find((i) => i.id === otherId);
                    const authorAId =
                      conn.ideaAAuthorId ||
                      (conn.ideaA === idea.id ? idea.authorId : otherIdeaObj?.authorId);
                    const authorBId =
                      conn.ideaBAuthorId ||
                      (conn.ideaB === idea.id ? idea.authorId : otherIdeaObj?.authorId);
                    const isConnectedMaker = Boolean(
                      user &&
                        (user.uid === conn.createdBy ||
                          (authorAId && user.uid === authorAId) ||
                          (authorBId && user.uid === authorBId))
                    );
                    const canManageConn = Boolean(user && (isAdmin || isConnectedMaker));
                    return (
                      <div
                        key={conn.id}
                        className="bg-surface-container rounded-2xl p-space-lg flex flex-col gap-space-sm border-l-4 border-secondary"
                      >
                        <div className="flex items-center justify-between text-xs font-code-sm flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded uppercase ${
                                conn.status === 'active'
                                  ? 'bg-secondary/15 text-secondary'
                                  : conn.status === 'declined'
                                  ? 'bg-error-container text-on-error-container'
                                  : 'bg-surface-container-highest text-on-surface-variant'
                              }`}
                            >
                              Status: {conn.status}
                            </span>
                            {canManageConn && (
                              <span className="px-2 py-0.5 rounded bg-primary-container/15 text-primary uppercase">
                                {isAdmin && !isConnectedMaker ? 'Admin Control' : 'Connected Maker'}
                              </span>
                            )}
                          </div>
                          <span className="text-on-surface-variant">
                            Linked by: {conn.createdByName} · {formatRelativeTime(conn.createdAt)}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div className="bg-surface-container-low p-2.5 rounded-xl">
                            <span className="font-code-sm text-code-sm text-on-surface-variant uppercase block">
                              Source Idea
                            </span>
                            <Link
                              to={`/ideas/${conn.ideaA}`}
                              className="font-title-md text-title-md text-on-surface hover:text-primary line-clamp-1"
                            >
                              {conn.ideaATitle}
                            </Link>
                          </div>
                          <div className="bg-surface-container-low p-2.5 rounded-xl">
                            <span className="font-code-sm text-code-sm text-secondary uppercase block">
                              Connected Idea
                            </span>
                            <Link
                              to={`/ideas/${otherId}`}
                              className="font-title-md text-title-md text-on-surface hover:text-primary line-clamp-1"
                            >
                              {otherTitle}
                            </Link>
                          </div>
                        </div>

                        <div>
                          <span className="font-code-sm text-code-sm text-on-surface-variant uppercase block">
                            Connection Reason
                          </span>
                          <p className="font-body-md text-body-md text-on-surface mt-0.5">
                            {conn.reason}
                          </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-variant/20 font-code-sm text-code-sm">
                          {canManageConn ? (
                            <>
                              {conn.status !== 'active' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateConnectionStatus(conn.id, 'active')
                                      .then(() => showToast('Connection marked active.', 'success'))
                                      .catch((err) =>
                                        showToast(
                                          err instanceof Error
                                            ? err.message
                                            : 'Could not update connection.',
                                          'error'
                                        )
                                      )
                                  }
                                  className="px-2.5 py-1 rounded bg-secondary/20 text-secondary hover:bg-secondary hover:text-on-secondary transition-colors"
                                >
                                  Mark Active
                                </button>
                              )}
                              {conn.status !== 'declined' && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateConnectionStatus(conn.id, 'declined')
                                      .then(() => showToast('Connection declined.', 'info'))
                                      .catch((err) =>
                                        showToast(
                                          err instanceof Error
                                            ? err.message
                                            : 'Could not decline connection.',
                                          'error'
                                        )
                                      )
                                  }
                                  className="px-2.5 py-1 rounded bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors"
                                >
                                  Decline
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  requestConfirm({
                                    title: 'Remove Connection?',
                                    message: `Remove the connection between "${conn.ideaATitle}" and "${conn.ideaBTitle}"? Only an Admin or the connected makers can remove it.`,
                                    confirmLabel: 'Remove Connection',
                                    destructive: true,
                                    onConfirm: async () => {
                                      try {
                                        await deleteConnectionWithTransaction(conn);
                                        showToast('Connection removed.', 'info');
                                      } catch (err) {
                                        showToast(
                                          err instanceof Error
                                            ? err.message
                                            : 'Could not remove connection.',
                                          'error'
                                        );
                                      }
                                    },
                                  })
                                }
                                className="px-2.5 py-1 rounded bg-surface-container-highest text-on-surface-variant hover:text-error transition-colors"
                              >
                                Remove
                              </button>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-on-surface-variant/70">
                              <span className="material-symbols-outlined text-[14px]">lock</span>
                              Protected · Admin &amp; connected makers only
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: EDIT PAGE (/ideas/:id/edit) */}
          {tab === 'edit' && (
            <div className="bg-surface-container rounded-2xl p-space-xl flex flex-col gap-space-md">
              <h2 className="font-headline-md text-headline-md text-on-surface">
                Edit Specification
              </h2>
              {!isOwner && !isAdmin ? (
                <p className="text-error font-body-md">
                  Only the author of this idea can edit its specification.
                </p>
              ) : (
                <form onSubmit={handleSaveIdeaEdit} className="flex flex-col gap-space-md">
                  <div>
                    <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                      Title
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
                    <div>
                      <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                        Category
                      </label>
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as IdeaCategory)}
                        className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface"
                      >
                        <option value="Software">Software</option>
                        <option value="Hardware">Hardware</option>
                        <option value="AI">AI</option>
                        <option value="Web">Web</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                        Help Track
                      </label>
                      <select
                        value={editTrack}
                        onChange={(e) => setEditTrack(e.target.value as HelpTrack)}
                        className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface"
                      >
                        <option value="builder">Needs a Builder</option>
                        <option value="guidance">Needs Guidance</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                        Status
                      </label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as IdeaStatus)}
                        className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface"
                      >
                        <option value="open">Open</option>
                        <option value="in-progress">In Progress</option>
                        <option value="built">Built</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                      Summary Pitch
                    </label>
                    <textarea
                      rows={2}
                      required
                      value={editSummary}
                      onChange={(e) => setEditSummary(e.target.value)}
                      className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface"
                    />
                  </div>
                  <div>
                    <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                      The Problem
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={editProblem}
                      onChange={(e) => setEditProblem(e.target.value)}
                      className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface"
                    />
                  </div>
                  <div>
                    <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                      The Solution / Idea
                    </label>
                    <textarea
                      rows={4}
                      required
                      value={editSolution}
                      onChange={(e) => setEditSolution(e.target.value)}
                      className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface"
                    />
                  </div>
                  <div>
                    <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                      Help Wanted
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={editHelpWanted}
                      onChange={(e) => setEditHelpWanted(e.target.value)}
                      className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface"
                    />
                  </div>
                  <div>
                    <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                      Tags
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={editTagInput}
                        onChange={(e) => setEditTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const t = sanitizeTag(editTagInput);
                            if (t && !editTags.includes(t)) {
                              setEditTags([...editTags, t]);
                            }
                            setEditTagInput('');
                          }
                        }}
                        placeholder="Add tag and press Enter"
                        className="flex-1 h-10 px-3 rounded-lg bg-surface-container-high text-on-surface"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {editTags.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-low text-secondary font-code-sm text-code-sm"
                        >
                          #{t}
                          <button
                            type="button"
                            onClick={() => setEditTags(editTags.filter((x) => x !== t))}
                            className="hover:text-error"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-end gap-space-sm pt-2">
                    <Link
                      to={`/ideas/${idea.id}`}
                      className="min-h-[44px] px-4 rounded-lg text-on-surface-variant hover:text-on-surface inline-flex items-center"
                    >
                      Cancel
                    </Link>
                    <button
                      type="submit"
                      disabled={editSaving}
                      className="min-h-[44px] px-6 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md"
                    >
                      {editSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}

              {/* Content Revision History Log */}
              <div className="pt-space-lg border-t border-surface-variant/30 flex flex-col gap-space-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-title-md text-title-md font-semibold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-secondary">
                      history
                    </span>
                    Specification Revision History ({revisions.length})
                  </h3>
                  <span className="font-code-sm text-code-sm text-on-surface-variant">
                    Immutable edit trail
                  </span>
                </div>
                {revisions.length === 0 ? (
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    No subsequent revisions recorded since initial specification publication.
                  </p>
                ) : (
                  <div className="flex flex-col gap-space-xs max-h-72 overflow-y-auto pr-1">
                    {revisions.map((rev) => (
                      <div
                        key={rev.id}
                        className="p-space-sm rounded-xl bg-surface-container-low flex flex-col gap-1 border border-outline-variant/10"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="font-code-sm text-code-sm text-primary font-semibold">
                            Edited by @{rev.editorName}
                          </span>
                          <span className="font-code-sm text-code-sm text-on-surface-variant">
                            {formatRelativeTime(rev.createdAt)}
                          </span>
                        </div>
                        <p className="font-body-sm text-body-sm text-on-surface">
                          Modified fields: {rev.changedFields.join(', ')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar (4 cols) */}
        <aside className="lg:col-span-4 flex flex-col gap-space-xl">
          {/* Poster Profile Card (no fake verified badges) */}
          <div className="bg-surface-container rounded-2xl p-space-lg flex flex-col gap-space-md shadow-sm">
            <div className="flex items-center gap-space-md">
              <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-on-primary font-headline-sm text-headline-sm font-bold shrink-0">
                {idea.authorUsername.slice(0, 1).toUpperCase()}
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Link
                    to={`/u/${idea.authorUsername}`}
                    className="font-headline-sm text-headline-sm text-on-surface hover:text-primary truncate transition-colors"
                  >
                    @{idea.authorUsername}
                  </Link>
                  {(idea.authorUsername === 'admin' || idea.authorUsername === 'cardboardboxmask') && (
                    <span className="px-2 py-0.5 rounded text-[11px] bg-primary/10 text-primary font-bold uppercase tracking-wider">
                      Platform Admin
                    </span>
                  )}
                </div>
                <span className="font-code-sm text-code-sm text-on-surface-variant">
                  {idea.authorName}
                </span>
              </div>
            </div>
            {idea.existingCheckNote && (
              <div className="p-space-sm bg-surface-container-low rounded-lg font-body-sm text-body-sm text-on-surface-variant leading-normal">
                “{idea.existingCheckNote}”
              </div>
            )}
            <div className="flex items-center justify-between pt-space-xs border-t border-surface-variant/30 font-code-sm text-code-sm text-on-surface-variant">
              <span>Posted {formatRelativeTime(idea.createdAt)}</span>
              <span className="text-secondary font-medium">100% Open Access</span>
            </div>
          </div>

          {/* Volunteers Live Status Card */}
          <div className="bg-surface-container rounded-2xl p-space-lg flex flex-col gap-space-md shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-title-md text-title-md text-on-surface font-semibold">
                Active Volunteers
              </span>
              <span
                className={`px-2 py-0.5 rounded-full font-code-sm text-code-sm ${
                  idea.volunteerCount > 0
                    ? 'bg-secondary-container/20 text-secondary'
                    : 'bg-surface-container-highest text-on-surface-variant'
                }`}
              >
                {idea.volunteerCount || 0} active
              </span>
            </div>

            {myVolunteerRecord ? (
              <div className="flex flex-col items-center justify-center p-space-lg text-center bg-primary-container/10 rounded-xl gap-space-xs">
                <span className="material-symbols-outlined text-[32px] text-primary">
                  how_to_reg
                </span>
                <p className="font-title-md text-title-md text-primary font-semibold">
                  You offered to help!
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Status: <strong className="capitalize">{myVolunteerRecord.status}</strong>. View
                  all volunteers or withdraw anytime.
                </p>
                <Link
                  to={`/ideas/${idea.id}/volunteers`}
                  className="mt-2 font-code-sm text-code-sm text-secondary hover:underline"
                >
                  Open Volunteers Tab →
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-space-lg text-center bg-surface-container-low rounded-xl gap-space-xs">
                <span className="material-symbols-outlined text-[32px] text-on-surface-variant/50">
                  person_search
                </span>
                <p className="font-body-md text-body-md text-on-surface font-medium">
                  {idea.volunteerCount || 0} active{' '}
                  {idea.volunteerCount === 1 ? 'volunteer' : 'volunteers'}.
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Volunteer to help build or steer the technical direction.
                </p>
                <button
                  type="button"
                  onClick={handlePrimaryVolunteerClick}
                  className="mt-space-sm min-h-[44px] w-full bg-primary-container text-on-primary font-title-md text-title-md rounded-lg hover:opacity-95 transition-colors flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">handyman</span>
                  Step Up to Build
                </button>
              </div>
            )}
          </div>

          {/* Connected Ideas Preview */}
          <div className="bg-surface-container rounded-2xl p-space-lg flex flex-col gap-space-md shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs text-secondary">
                <span className="material-symbols-outlined text-[20px]">hub</span>
                <span className="font-title-md text-title-md font-semibold text-on-surface">
                  Connected Ideas ({ideaConnections.length})
                </span>
              </div>
              <Link
                to="/connections"
                title="See how related ideas connect"
                className="font-code-sm text-[13px] text-secondary hover:underline"
              >
                Idea Map →
              </Link>
            </div>

            {ideaConnections.length === 0 ? (
              <div className="p-space-md rounded-xl bg-surface-container-low text-center flex flex-col gap-2">
                <p className="font-body-sm text-[13px] text-on-surface-variant">
                  No connected ideas yet. Connect a related idea to show how they fit together.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (requireAuth()) setShowConnectModal(true);
                  }}
                  className="min-h-[40px] px-3 rounded-lg bg-surface-container-high text-secondary font-code-sm text-[13px] hover:bg-surface-bright"
                >
                  + Connect an idea
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-space-sm">
                {ideaConnections.slice(0, 3).map((conn) => {
                  const otherId = conn.ideaA === idea.id ? conn.ideaB : conn.ideaA;
                  const otherTitle = conn.ideaA === idea.id ? conn.ideaBTitle : conn.ideaATitle;
                  return (
                    <Link
                      key={conn.id}
                      to={`/ideas/${otherId}`}
                      className="p-space-md rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors flex flex-col gap-space-xs group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-label-sm text-label-sm uppercase text-primary tracking-wider">
                          Linked Spec
                        </span>
                        <span className="font-code-sm text-code-sm text-secondary flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                          Connected
                        </span>
                      </div>
                      <h4 className="font-headline-sm text-headline-sm text-on-surface group-hover:text-primary transition-colors">
                        {otherTitle}
                      </h4>
                      <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
                        {conn.reason}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Direct Permalink Card */}
          <div className="bg-surface-container rounded-2xl p-space-md flex flex-col gap-space-sm shadow-sm">
            <span className="font-code-sm text-code-sm text-on-surface-variant uppercase tracking-wider">
              Idea Direct Permalink
            </span>
            <div className="flex items-center gap-space-xs">
              <input
                type="text"
                readOnly
                aria-label="Idea direct permalink"
                value={permalinkUrl}
                className="w-full h-11 px-3 bg-surface-container-high rounded-lg text-on-surface font-code-sm text-code-sm select-all focus:outline-none"
              />
              <button
                type="button"
                onClick={copyPermalink}
                title="Copy to clipboard"
                aria-label="Copy permalink to clipboard"
                className="min-h-[44px] min-w-[44px] px-3 bg-surface-container-highest hover:bg-surface-bright text-on-surface rounded-lg flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">content_copy</span>
              </button>
            </div>
          </div>
        </aside>
      </div>

      {/* Volunteer Offer Modal */}
      {showVolunteerModal && (
        <div
          className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vol-modal-title"
        >
          <div className="bg-surface-container w-full max-w-lg rounded-2xl p-space-xl flex flex-col gap-space-md shadow-2xl border border-surface-variant/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined text-[24px]">handyman</span>
                <h3 id="vol-modal-title" className="font-headline-sm text-headline-sm text-on-surface">
                  Offer to Help on This Idea
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowVolunteerModal(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Volunteering on Synapse is free, non-binding, and collaborative. Let the author know
              how you can help.
            </p>
            <form onSubmit={handleSubmitVolunteer} className="flex flex-col gap-space-md">
              <div>
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                  Your Role / Area
                </label>
                <input
                  type="text"
                  required
                  value={volRole}
                  onChange={(e) => setVolRole(e.target.value)}
                  placeholder="e.g. Full-stack TypeScript, Embedded Rust, PCB Layout, Architecture Review"
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                />
              </div>
              <div>
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                  How would you like to help?
                </label>
                <textarea
                  rows={3}
                  required
                  value={volMessage}
                  onChange={(e) => setVolMessage(e.target.value)}
                  placeholder="Share relevant experience, weekly availability, or which module you want to tackle..."
                  className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                />
              </div>
              <div className="flex justify-end gap-space-sm">
                <button
                  type="button"
                  onClick={() => setShowVolunteerModal(false)}
                  className="min-h-[44px] px-4 rounded-lg text-on-surface-variant hover:text-on-surface font-title-md text-title-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={volSubmitting}
                  className="min-h-[44px] px-6 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md font-semibold"
                >
                  {volSubmitting ? 'Submitting...' : 'Submit Offer to Help'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Connect Idea Modal ("This connects with my idea") */}
      {showConnectModal && (
        <div
          className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="connect-modal-title"
        >
          <div className="bg-surface-container w-full max-w-lg rounded-2xl p-space-xl flex flex-col gap-space-lg shadow-2xl border border-surface-variant/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-secondary text-[24px]">hub</span>
                <h3
                  id="connect-modal-title"
                  className="font-headline-sm text-headline-sm text-on-surface"
                >
                  Connect Your Idea
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConnectModal(false)}
                className="w-11 h-11 flex items-center justify-center text-on-surface-variant hover:text-on-surface rounded-lg"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              Connecting ideas helps people discover related work, share ideas, and build together on the Idea Map.
            </p>

            <form onSubmit={handleSubmitConnection} className="flex flex-col gap-space-md">
              <div className="flex flex-col gap-space-xs">
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                  {myOwnIdeas.length > 0
                    ? 'Select one of your posted ideas (or another registry spec)'
                    : 'Select an idea from the registry to connect'}
                </label>
                <select
                  value={selectedConnectIdeaId}
                  onChange={(e) => setSelectedConnectIdeaId(e.target.value)}
                  className="w-full h-11 px-3 bg-surface-container-high rounded-lg text-on-surface font-body-md text-body-md focus:outline-none"
                >
                  {myOwnIdeas.length > 0 && (
                    <optgroup label="Your Posted Ideas">
                      {myOwnIdeas.map((myIdea) => (
                        <option key={myIdea.id} value={myIdea.id}>
                          {myIdea.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Community Ideas">
                    {otherAvailableIdeas
                      .filter((o) => !myOwnIdeas.some((m) => m.id === o.id))
                      .map((other) => (
                        <option key={other.id} value={other.id}>
                          {other.title}
                        </option>
                      ))}
                  </optgroup>
                </select>
                {myOwnIdeas.length === 0 && (
                  <span className="font-code-sm text-code-sm text-on-surface-variant">
                    Want to link your own idea?{' '}
                    <Link to="/post/basics" className="text-primary hover:underline">
                      Post your idea first →
                    </Link>
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-space-xs">
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                  Connection Reason / Cross-Pollination
                </label>
                <textarea
                  rows={3}
                  required
                  value={connectReason}
                  onChange={(e) => setConnectReason(e.target.value)}
                  placeholder="How do these two projects complement each other?"
                  className="w-full p-3 bg-surface-container-high rounded-lg text-on-surface font-body-md text-body-md placeholder:text-on-surface-variant/50 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-space-sm pt-space-xs">
                <button
                  type="button"
                  onClick={() => setShowConnectModal(false)}
                  className="min-h-[44px] px-4 rounded-lg text-on-surface-variant hover:text-on-surface font-title-md text-title-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connectSubmitting}
                  className="min-h-[44px] px-6 rounded-lg bg-secondary text-on-secondary font-title-md text-title-md font-semibold hover:opacity-90"
                >
                  {connectSubmitting ? 'Linking...' : 'Submit Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
