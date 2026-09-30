import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import { BookmarkButton } from '../components/BookmarkButton';
import { PageMeta } from '../components/PageMeta';
import { RouteSkeleton } from '../components/Skeletons';
import {
  changeUsernameWithTransaction,
  db,
  deleteUserAccountLifecycle,
  isUsernameAvailable,
  reloadAuthUser,
  removeBookmark,
  resendVerificationEmail,
  signInWithEmail,
  signInWithGoogle,
  signOutUser,
  signUpWithEmail,
  updateUserProfile,
} from '../firebase';
import { UserProfile, Volunteer } from '../types/synapse';
import { AVATAR_UPLOAD_POLICY, validateMediaFileSignature } from '../utils/mediaPolicy';
import {
  checkRateLimit,
  formatRelativeTime,
  validateExternalUrl,
  validateUsername,
} from '../utils/sanitize';

export const LoginPage: React.FC = () => {
  const { user, authReady, showToast } = useApp();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [emailMode, setEmailMode] = useState<'none' | 'signin' | 'signup'>('none');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState('');

  const rawReturnTo = searchParams.get('returnTo');
  const returnTo =
    rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
      ? rawReturnTo
      : '/profile';

  useEffect(() => {
    if (authReady && user) {
      navigate(returnTo, { replace: true });
    }
  }, [user, authReady, navigate, returnTo]);

  if (!authReady) return <RouteSkeleton />;

  const handleGoogleSignIn = async () => {
    setSigningIn(true);
    setAuthError(null);
    try {
      const signedIn = await signInWithGoogle();
      if (signedIn) {
        showToast('Signed in with Google.', 'success');
        navigate(returnTo, { replace: true });
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please check your connection and try again.';
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setSigningIn(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || passwordInput.length < 6) {
      setAuthError('Please enter a valid email and a password of at least 6 characters.');
      return;
    }
    setSigningIn(true);
    setAuthError(null);
    try {
      if (emailMode === 'signup') {
        await signUpWithEmail(emailInput, passwordInput, nameInput);
        showToast(
          'Account created! A verification link has been sent to your email address.',
          'success'
        );
      } else {
        await signInWithEmail(emailInput, passwordInput);
        showToast('Signed in.', 'success');
      }
      navigate(returnTo, { replace: true });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Email authentication failed. Please try again.';
      setAuthError(msg);
      showToast(msg, 'error');
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 sm:px-margin py-20">
      <PageMeta
        title="Sign In — Synapse"
        description="Sign in with Google to post ideas, connect specs, bookmark ideas, or volunteer to build on Synapse."
      />
      <div className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col items-center text-center gap-space-lg shadow-xl border border-surface-variant/40">
        <div className="w-14 h-14 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
          <span className="material-symbols-outlined text-[30px]">lock_open</span>
        </div>

        <div className="flex flex-col gap-space-xs">
          <h1 className="font-headline-md text-headline-md text-on-surface">
            Sign in to Synapse
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Browsing is always public. Sign in with Google to post an idea, save bookmarks to your
            profile, link specifications, or volunteer to build.
          </p>
        </div>

        {authError && (
          <div className="w-full p-3 rounded-xl bg-error-container text-on-error-container font-code-sm text-code-sm text-left">
            {authError}
          </div>
        )}

        <button
          type="button"
          disabled={signingIn}
          onClick={handleGoogleSignIn}
          className="w-full min-h-[48px] px-space-lg rounded-lg bg-primary-container text-on-primary font-title-md text-title-md flex items-center justify-center gap-3 shadow-md hover:opacity-95 transition-opacity disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[20px]">login</span>
          <span>{signingIn ? 'Connecting with Google...' : 'Continue with Google'}</span>
        </button>

        {/* Optional Email & Password Sign-In / Sign-Up with Email Verification */}
        <div className="w-full pt-2">
          {emailMode === 'none' ? (
            <button
              type="button"
              onClick={() => setEmailMode('signin')}
              className="w-full min-h-[44px] px-4 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface font-code-sm text-code-sm transition-colors"
            >
              Or sign in with Email &amp; Password
            </button>
          ) : (
            <form
              onSubmit={handleEmailSubmit}
              className="w-full bg-surface-container rounded-xl p-4 flex flex-col gap-3 text-left border border-surface-variant/40"
            >
              <div className="flex items-center justify-between">
                <span className="font-code-sm text-code-sm text-primary uppercase">
                  {emailMode === 'signup' ? 'Create Maker Account' : 'Email Sign-In'}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setEmailMode(emailMode === 'signin' ? 'signup' : 'signin')
                  }
                  className="font-code-sm text-code-sm text-secondary hover:underline"
                >
                  {emailMode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
                </button>
              </div>

              {emailMode === 'signup' && (
                <div>
                  <label
                    htmlFor="login-display-name"
                    className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1"
                  >
                    Display Name
                  </label>
                  <input
                    id="login-display-name"
                    type="text"
                    required
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Ada Lovelace"
                    className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="login-email-input"
                  className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1"
                >
                  Email Address
                </label>
                <input
                  id="login-email-input"
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="maker@example.org"
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password-input"
                  className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1"
                >
                  Password
                </label>
                <input
                  id="login-password-input"
                  type="password"
                  required
                  minLength={6}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                />
              </div>

              <button
                type="submit"
                disabled={signingIn}
                className="min-h-[44px] px-4 rounded-lg bg-secondary text-on-secondary font-title-md text-title-md font-semibold"
              >
                {signingIn
                  ? 'Please wait...'
                  : emailMode === 'signup'
                  ? 'Create Account & Send Verification Link'
                  : 'Sign In with Email'}
              </button>
            </form>
          )}
        </div>

        <div className="w-full pt-space-md border-t border-surface-variant/30 text-left space-y-2 font-code-sm text-code-sm text-on-surface-variant">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[16px]">
              check_circle
            </span>
            <span>No passwords to manage, zero marketing emails</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[16px]">
              check_circle
            </span>
            <span>Your posted ideas remain 100% yours</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ProfilePage: React.FC = () => {
  const {
    user,
    profile,
    isAdmin,
    reports,
    authReady,
    ideas,
    connections,
    savedBookmarks,
    saveBookmarkNote,
    refreshProfile,
    openConfirm,
    showToast,
  } = useApp();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Username change state
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [changingUsername, setChangingUsername] = useState(false);

  // Account deletion options
  const [deleteUnengagedIdeas, setDeleteUnengagedIdeas] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [myVolunteering, setMyVolunteering] = useState<Volunteer[]>([]);
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [bookmarkNoteDraft, setBookmarkNoteDraft] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [emailVerifiedState, setEmailVerifiedState] = useState<boolean>(
    Boolean(user?.emailVerified)
  );
  const [resendingVerification, setResendingVerification] = useState(false);

  useEffect(() => {
    setEmailVerifiedState(Boolean(user?.emailVerified));
  }, [user?.emailVerified]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName);
      setBio(profile.bio || '');
      setAvatarUrl(profile.avatarUrl || '');
      setUsernameInput(profile.username || '');
      setUsernameStatus('idle');
      setUsernameError(null);
    }
  }, [profile]);

  // Live username validation & availability check
  useEffect(() => {
    if (!profile || !user) return;
    const trimmed = usernameInput.trim().toLowerCase();
    if (!trimmed || trimmed === profile.username.toLowerCase()) {
      setUsernameStatus('idle');
      setUsernameError(null);
      return;
    }

    const validation = validateUsername(trimmed);
    if (!validation.valid) {
      setUsernameStatus('invalid');
      setUsernameError(validation.error || 'Invalid username.');
      return;
    }

    let cancelled = false;
    setUsernameStatus('checking');
    setUsernameError(null);

    const timer = setTimeout(async () => {
      try {
        const available = await isUsernameAvailable(validation.normalized, user.uid);
        if (!cancelled) {
          if (available) {
            setUsernameStatus('available');
            setUsernameError(null);
          } else {
            setUsernameStatus('taken');
            setUsernameError(`@${validation.normalized} is already claimed by another maker.`);
          }
        }
      } catch {
        if (!cancelled) {
          setUsernameStatus('idle');
        }
      }
    }, 320);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [usernameInput, profile, user]);

  // Load user's volunteer offers across ideas
  useEffect(() => {
    if (!user) return;
    let active = true;
    async function fetchVolunteering() {
      const results: Volunteer[] = [];
      for (const idea of ideas) {
        try {
          const q = query(
            collection(db, 'ideas', idea.id, 'volunteers'),
            where('userId', '==', user!.uid)
          );
          const snap = await getDocs(q);
          snap.forEach((d) =>
            results.push({ id: d.id, ...(d.data() as Omit<Volunteer, 'id'>) })
          );
        } catch {
          // ignore
        }
      }
      if (active) setMyVolunteering(results);
    }
    fetchVolunteering();
    return () => {
      active = false;
    };
  }, [user, ideas]);

  const myIdeas = useMemo(
    () => (user ? ideas.filter((i) => i.authorId === user.uid) : []),
    [ideas, user]
  );

  const myConnections = useMemo(
    () => (user ? connections.filter((c) => c.createdBy === user.uid) : []),
    [connections, user]
  );

  const resolvedBookmarks = useMemo(() => {
    return savedBookmarks.map((b) => {
      const liveIdea = ideas.find((i) => i.id === b.ideaId);
      return {
        bookmark: b,
        liveIdea,
      };
    });
  }, [savedBookmarks, ideas]);

  if (!authReady) return <RouteSkeleton />;
  if (!user) {
    return <Navigate to="/login?returnTo=%2Fprofile" replace />;
  }

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const check = await validateMediaFileSignature(file, AVATAR_UPLOAD_POLICY);
    if (!check.valid) {
      showToast(check.error || 'Invalid image file.', 'error');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
        showToast('Avatar image verified (magic-byte check passed). Click Save Profile to apply.', 'info');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      showToast('Display name cannot be empty.', 'error');
      return;
    }
    if (avatarUrl && !avatarUrl.startsWith('data:image/')) {
      const urlCheck = validateExternalUrl(avatarUrl);
      if (!urlCheck.valid) {
        showToast(urlCheck.error || 'Invalid avatar URL.', 'error');
        return;
      }
    }
    setSaving(true);
    try {
      await updateUserProfile(user.uid, { displayName, bio, avatarUrl });
      await refreshProfile();
      showToast('Profile updated!', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update profile.';
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const validation = validateUsername(usernameInput);
    if (!validation.valid) {
      showToast(validation.error || 'Invalid username.', 'error');
      return;
    }
    if (validation.normalized === profile.username) {
      showToast('You are already using this username.', 'info');
      return;
    }
    setChangingUsername(true);
    try {
      const nextHandle = await changeUsernameWithTransaction({
        uid: user.uid,
        currentUsername: profile.username,
        newUsername: validation.normalized,
        actorName: profile.displayName,
      });
      await refreshProfile();
      showToast(`Username updated to @${nextHandle}!`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not change username.';
      showToast(msg, 'error');
    } finally {
      setChangingUsername(false);
    }
  };

  const handleRemoveBookmark = async (ideaId: string, title: string) => {
    try {
      await removeBookmark(user.uid, ideaId);
      showToast(`Removed "${title}" from saved ideas.`, 'info');
    } catch {
      showToast('Could not remove bookmark.', 'error');
    }
  };

  const handleStartEditNote = (ideaId: string, currentNote?: string) => {
    setEditingBookmarkId(ideaId);
    setBookmarkNoteDraft(currentNote || '');
  };

  const handleSaveBookmarkNote = async (ideaId: string) => {
    setSavingNote(true);
    try {
      await saveBookmarkNote(ideaId, bookmarkNoteDraft);
      setEditingBookmarkId(null);
    } finally {
      setSavingNote(false);
    }
  };

  const handleSignOut = async () => {
    await signOutUser();
    showToast('Signed out.', 'info');
    navigate('/');
  };

  const handleRequestAccountDeletion = () => {
    if (!profile) return;
    openConfirm({
      title: 'Delete Your Synapse Account?',
      message:
        'Your private data (saved bookmarks, personal notes, notification inbox, and @username reservation) will be permanently purged immediately. Public community contributions with collaborative history will be anonymized to @deleted-member so other makers do not lose shared context.',
      confirmLabel: 'Delete Account & Purge Private Data',
      destructive: true,
      onConfirm: async () => {
        setDeletingAccount(true);
        try {
          await deleteUserAccountLifecycle({
            uid: user.uid,
            profile,
            deleteAuthoredIdeasWithoutEngagement: deleteUnengagedIdeas,
          });
          showToast('Your account and private data have been deleted.', 'info');
          navigate('/');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Could not complete account deletion.';
          showToast(msg, 'error');
        } finally {
          setDeletingAccount(false);
        }
      },
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-margin py-space-xl flex flex-col gap-space-xl">
      <PageMeta
        title={`${profile?.displayName || 'Maker'} Profile — Synapse`}
        description="Manage your Synapse maker profile, unique @username handle, saved idea bookmarks, posted ideas, volunteering offers, and data lifecycle."
      />

      {/* Admin Control Panel Quick Launch Banner (Mobile & Desktop) */}
      {isAdmin && (
        <div className="bg-surface-container-low border border-primary/40 rounded-2xl p-space-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md shadow-md">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl bg-primary-container/20 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
                admin_panel_settings
              </span>
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-title-md text-title-md text-on-surface font-semibold">
                  Synapse Admin Control Panel
                </h2>
                <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary font-code-sm text-[11px] uppercase font-semibold">
                  Verified Admin
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                Review moderation reports ({reports.filter((r) => r.status === 'open').length}{' '}
                open), grant &ldquo;Admin Verified&rdquo; badges to ideas, manage user suspensions,
                and inspect audit logs.
              </p>
            </div>
          </div>
          <Link
            to="/admin"
            className="min-h-[44px] px-5 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md font-semibold inline-flex items-center justify-center gap-2 shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              dashboard
            </span>
            <span>Open Admin Panel</span>
          </Link>
        </div>
      )}

      {/* Email Verification Banner when user.emailVerified is false */}
      {!emailVerifiedState && (
        <div
          role="region"
          aria-label="Email verification required"
          className="bg-surface-container-low border-l-4 border-primary rounded-2xl p-space-lg flex flex-col sm:flex-row sm:items-center justify-between gap-space-md"
        >
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-primary text-[24px] mt-0.5">
              mark_email_unread
            </span>
            <div>
              <h2 className="font-title-md text-title-md text-on-surface font-semibold">
                Verify your email address ({user.email || 'unverified'})
              </h2>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                Please verify your email link to confirm account ownership. Once verified, click
                &ldquo;Refresh Verification Status&rdquo;.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              disabled={resendingVerification}
              onClick={async () => {
                const rl = checkRateLimit(`verify-email-${user.uid}`, 30000);
                if (!rl.allowed) {
                  showToast(
                    `Please wait ${rl.waitSeconds}s before requesting another link.`,
                    'info'
                  );
                  return;
                }
                setResendingVerification(true);
                try {
                  await resendVerificationEmail();
                  showToast(`Verification link sent to ${user.email}.`, 'success');
                } catch (err) {
                  showToast(
                    err instanceof Error ? err.message : 'Could not resend verification email.',
                    'error'
                  );
                } finally {
                  setResendingVerification(false);
                }
              }}
              className="min-h-[44px] px-4 rounded-lg bg-primary-container text-on-primary font-code-sm text-code-sm font-semibold"
            >
              {resendingVerification ? 'Sending...' : 'Resend Verification Link'}
            </button>
            <button
              type="button"
              onClick={async () => {
                const verified = await reloadAuthUser();
                setEmailVerifiedState(verified);
                if (verified) {
                  showToast('Email address verified!', 'success');
                } else {
                  showToast('Email is still marked unverified. Check your inbox.', 'info');
                }
              }}
              className="min-h-[44px] px-4 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-code-sm"
            >
              Refresh Verification Status
            </button>
          </div>
        </div>
      )}

      {/* Profile Header & Edit Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
        <div className="lg:col-span-5 flex flex-col gap-space-lg">
          <div className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-md shadow-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-md">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={profile?.displayName || 'Maker avatar'}
                    className="w-14 h-14 rounded-full object-cover border border-surface-variant"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-primary text-on-primary font-headline-md text-headline-md font-bold flex items-center justify-center">
                    {(profile?.displayName || 'M').slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div>
                  <h1 className="font-headline-md text-headline-md text-on-surface">
                    {profile?.displayName || user.displayName}
                  </h1>
                  <p className="font-code-sm text-code-sm text-secondary">
                    @{profile?.username || 'maker'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-[44px] px-4 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface font-title-md text-title-md flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                Sign Out
              </button>
            </div>

            {/* Maker Quick Activity Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
              <a
                href="#saved-bookmarks"
                className="bg-surface-container p-3 rounded-xl flex flex-col hover:bg-surface-container-high transition-colors"
              >
                <span className="font-code-sm text-code-sm text-on-surface-variant">Saved</span>
                <span className="font-headline-sm text-headline-sm text-primary font-bold">
                  {savedBookmarks.length}
                </span>
              </a>
              <a
                href="#my-ideas"
                className="bg-surface-container p-3 rounded-xl flex flex-col hover:bg-surface-container-high transition-colors"
              >
                <span className="font-code-sm text-code-sm text-on-surface-variant">Posted</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                  {myIdeas.length}
                </span>
              </a>
              <a
                href="#my-volunteering"
                className="bg-surface-container p-3 rounded-xl flex flex-col hover:bg-surface-container-high transition-colors"
              >
                <span className="font-code-sm text-code-sm text-on-surface-variant">Helping</span>
                <span className="font-headline-sm text-headline-sm text-secondary font-bold">
                  {myVolunteering.length}
                </span>
              </a>
              <a
                href="#my-connections"
                className="bg-surface-container p-3 rounded-xl flex flex-col hover:bg-surface-container-high transition-colors"
              >
                <span className="font-code-sm text-code-sm text-on-surface-variant">Linked</span>
                <span className="font-headline-sm text-headline-sm text-tertiary font-bold">
                  {myConnections.length}
                </span>
              </a>
            </div>

            <form onSubmit={handleSaveProfile} className="flex flex-col gap-space-sm pt-space-sm">
              <div>
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                  Edit Display Name
                </label>
                <input
                  type="text"
                  maxLength={80}
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                />
              </div>
              <div>
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                  Maker Bio / Skills
                </label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm"
                />
              </div>
              <div>
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                  Avatar Image (HTTPS URL or Verified Image Upload ≤ 2 MB)
                </label>
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={avatarUrl.startsWith('data:image/') ? '' : avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.png"
                    className="w-full h-10 px-3 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-code-sm"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <label className="min-h-[36px] px-3 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface font-code-sm text-code-sm inline-flex items-center gap-1.5 cursor-pointer">
                      <span className="material-symbols-outlined text-[16px]">upload_file</span>
                      <span>Upload PNG/JPG/WebP</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={handleAvatarFileSelect}
                        className="hidden"
                      />
                    </label>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl('')}
                        className="font-code-sm text-code-sm text-on-surface-variant hover:text-error"
                      >
                        Clear avatar
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <Link
                  to={`/u/${profile?.username || 'maker'}`}
                  className="font-code-sm text-code-sm text-secondary hover:underline"
                >
                  View public profile →
                </Link>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-5 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md"
                >
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>

          {/* Unique Username Management Card */}
          <div className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-sm border border-surface-variant/30">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[20px]">
                alternate_email
              </span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">
                Unique Maker Handle
              </h2>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Usernames are normalized lowercase, globally unique in Firestore (
              <code>usernames/&#123;handle&#125;</code>), and protected against reserved system
              names.
            </p>
            <form onSubmit={handleChangeUsername} className="flex flex-col gap-space-sm pt-1">
              <div className="relative">
                <input
                  type="text"
                  maxLength={28}
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value.toLowerCase())}
                  aria-label="New username"
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-code-sm"
                />
              </div>
              {usernameStatus === 'checking' && (
                <span className="font-code-sm text-code-sm text-on-surface-variant">
                  Checking availability in registry...
                </span>
              )}
              {usernameStatus === 'available' && (
                <span className="font-code-sm text-code-sm text-secondary">
                  ✓ @{usernameInput.trim().toLowerCase()} is available
                </span>
              )}
              {(usernameStatus === 'taken' || usernameStatus === 'invalid') && usernameError && (
                <span className="font-code-sm text-code-sm text-error">{usernameError}</span>
              )}
              <button
                type="submit"
                disabled={
                  changingUsername ||
                  usernameStatus === 'taken' ||
                  usernameStatus === 'invalid' ||
                  usernameStatus === 'checking' ||
                  usernameInput.trim().toLowerCase() === (profile?.username || '')
                }
                className="min-h-[42px] px-4 rounded-lg bg-surface-container-highest hover:bg-surface-bright text-on-surface font-title-md text-title-md disabled:opacity-50 self-end"
              >
                {changingUsername ? 'Claiming Handle...' : 'Update @username'}
              </button>
            </form>
          </div>

          {/* Account Deletion & Data Lifecycle Card */}
          <div className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-sm border border-error/30">
            <div className="flex items-center gap-2 text-error">
              <span className="material-symbols-outlined text-[20px]">shield_person</span>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">
                Account &amp; Data Lifecycle
              </h2>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Deleting your account immediately purges all <strong>private data</strong> (saved
              bookmarks, personal notes, notifications, and handle reservation). To protect
              collaborators, <strong>public ideas and technical responses</strong> with community
              activity are soft-anonymized to <code>@deleted-member</code>.
            </p>
            <label className="flex items-start gap-2.5 pt-1 font-body-sm text-body-sm text-on-surface cursor-pointer">
              <input
                type="checkbox"
                checked={deleteUnengagedIdeas}
                onChange={(e) => setDeleteUnengagedIdeas(e.target.checked)}
                className="mt-1 accent-primary"
              />
              <span>
                Also permanently delete my authored ideas that have 0 responses and 0 volunteers
              </span>
            </label>
            <button
              type="button"
              disabled={deletingAccount}
              onClick={handleRequestAccountDeletion}
              className="mt-2 min-h-[42px] px-4 rounded-lg bg-error-container text-on-error-container font-title-md text-title-md hover:opacity-90 disabled:opacity-50 self-start"
            >
              {deletingAccount ? 'Deleting Account...' : 'Delete Account & Purge Private Data'}
            </button>
          </div>
        </div>

        {/* Right Column: Saved Ideas (Bookmarks), My Ideas, Volunteering, Connections */}
        <div className="lg:col-span-7 flex flex-col gap-space-lg">
          {/* Saved Ideas / Bookmarks */}
          <section
            id="saved-bookmarks"
            className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-md border border-surface-variant/30"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">
                  bookmarks
                </span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">
                  Saved Ideas ({savedBookmarks.length})
                </h2>
              </div>
              <Link
                to="/explore"
                className="min-h-[38px] px-3.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-secondary font-code-sm text-code-sm inline-flex items-center gap-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">explore</span>
                Discover Ideas
              </Link>
            </div>

            {resolvedBookmarks.length === 0 ? (
              <div className="p-space-lg rounded-xl bg-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
                <div className="flex flex-col gap-1">
                  <p className="font-title-md text-title-md text-on-surface">
                    No bookmarked specifications yet
                  </p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    Click the bookmark icon on any idea card or specification page to save
                    interesting concepts here for quick access.
                  </p>
                </div>
                <Link
                  to="/explore"
                  className="min-h-[40px] px-4 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md inline-flex items-center justify-center gap-1 shrink-0"
                >
                  Browse Registry →
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-space-sm">
                {resolvedBookmarks.map(({ bookmark, liveIdea }) => {
                  const title = liveIdea?.title || bookmark.ideaTitle;
                  const summary = liveIdea?.summary || bookmark.ideaSummary;
                  const category = liveIdea?.category || bookmark.ideaCategory;
                  const helpTrack = liveIdea?.helpTrack || bookmark.ideaHelpTrack;
                  const isEditingNote = editingBookmarkId === bookmark.ideaId;
                  const isDeletedTarget = !liveIdea;

                  return (
                    <div
                      key={bookmark.id}
                      className="p-space-md rounded-xl bg-surface-container flex flex-col gap-space-sm border border-surface-variant/20 hover:border-surface-variant/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-space-md">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface font-code-sm text-[11px] uppercase">
                              {category}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full font-code-sm text-[11px] uppercase ${
                                helpTrack === 'builder'
                                  ? 'bg-primary/15 text-primary'
                                  : 'bg-tertiary/15 text-tertiary'
                              }`}
                            >
                              {helpTrack === 'builder' ? 'Needs Builder' : 'Needs Guidance'}
                            </span>
                            {liveIdea ? (
                              <span className="px-2 py-0.5 rounded-full bg-surface-container-high text-on-surface-variant font-code-sm text-[11px] capitalize">
                                {liveIdea.status.replace('-', ' ')}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-code-sm text-[11px] uppercase">
                                Specification Removed
                              </span>
                            )}
                            <span className="font-code-sm text-code-sm text-on-surface-variant/80">
                              · Saved {formatRelativeTime(bookmark.createdAt)}
                            </span>
                          </div>

                          {isDeletedTarget ? (
                            <span className="font-title-md text-title-md text-on-surface-variant line-through mt-0.5">
                              {title}
                            </span>
                          ) : (
                            <Link
                              to={`/ideas/${bookmark.ideaId}`}
                              className="font-title-md text-title-md text-on-surface hover:text-primary transition-colors mt-0.5"
                            >
                              {title}
                            </Link>
                          )}
                          <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
                            {isDeletedTarget
                              ? 'This idea was removed by its author or moderation. You can remove this saved bookmark whenever you like.'
                              : summary}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {!isDeletedTarget && (
                            <Link
                              to={`/ideas/${bookmark.ideaId}`}
                              className="min-h-[36px] px-3 rounded-lg bg-surface-container-high hover:bg-surface-bright text-secondary font-code-sm text-code-sm inline-flex items-center gap-1 transition-colors"
                            >
                              Open
                              <span className="material-symbols-outlined text-[15px]">
                                arrow_forward
                              </span>
                            </Link>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveBookmark(bookmark.ideaId, title)}
                            title="Remove from saved ideas"
                            aria-label={`Remove ${title} from saved ideas`}
                            className="min-w-[36px] min-h-[36px] px-2 rounded-lg bg-surface-container-high hover:bg-error-container text-on-surface-variant hover:text-on-error-container flex items-center justify-center gap-1 transition-colors font-code-sm text-code-sm"
                          >
                            <span className="material-symbols-outlined text-[17px]">
                              bookmark_remove
                            </span>
                            {isDeletedTarget && <span>Clear</span>}
                          </button>
                        </div>
                      </div>

                      {/* Personal Quick-Access Note */}
                      {isEditingNote ? (
                        <div className="pt-2 border-t border-surface-variant/20 flex flex-col gap-2">
                          <input
                            type="text"
                            maxLength={500}
                            value={bookmarkNoteDraft}
                            onChange={(e) => setBookmarkNoteDraft(e.target.value)}
                            placeholder="Add a personal note (e.g., why you saved this or how you might help)..."
                            className="w-full h-10 px-3 rounded-lg bg-surface-container-highest text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary-container"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingBookmarkId(null)}
                              className="min-h-[32px] px-3 rounded-lg text-on-surface-variant font-code-sm text-code-sm hover:text-on-surface"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={savingNote}
                              onClick={() => handleSaveBookmarkNote(bookmark.ideaId)}
                              className="min-h-[32px] px-3.5 rounded-lg bg-primary-container text-on-primary font-code-sm text-code-sm"
                            >
                              {savingNote ? 'Saving...' : 'Save Note'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-1.5 border-t border-surface-variant/20 flex items-center justify-between gap-2">
                          {bookmark.note ? (
                            <p className="font-code-sm text-code-sm text-on-surface-variant flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[15px] text-primary">
                                sticky_note_2
                              </span>
                              <span>{bookmark.note}</span>
                            </p>
                          ) : (
                            <span className="font-code-sm text-code-sm text-on-surface-variant/60">
                              {liveIdea
                                ? `${liveIdea.volunteerCount} volunteers · ${liveIdea.responseCount} responses · ${liveIdea.connectionCount} connections`
                                : 'Target idea no longer active'}
                            </span>
                          )}
                          {!isDeletedTarget && (
                            <button
                              type="button"
                              onClick={() => handleStartEditNote(bookmark.ideaId, bookmark.note)}
                              className="font-code-sm text-code-sm text-secondary hover:underline inline-flex items-center gap-1 shrink-0"
                            >
                              <span className="material-symbols-outlined text-[14px]">edit_note</span>
                              {bookmark.note ? 'Edit note' : 'Add personal note'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* My Ideas */}
          <section
            id="my-ideas"
            className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-md"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-headline-sm text-on-surface">
                My Ideas ({myIdeas.length})
              </h2>
              <Link
                to="/post/basics"
                className="min-h-[40px] px-4 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md inline-flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Post Idea
              </Link>
            </div>
            {myIdeas.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                You haven’t posted any ideas yet. Share your first specification whenever you’re
                ready.
              </p>
            ) : (
              <div className="flex flex-col gap-space-sm">
                {myIdeas.map((idea) => (
                  <div
                    key={idea.id}
                    className="p-space-md rounded-xl bg-surface-container flex items-center justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/ideas/${idea.id}`}
                          className="font-title-md text-title-md text-on-surface hover:text-primary"
                        >
                          {idea.title}
                        </Link>
                        {idea.adminVerified && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/15 text-secondary font-code-sm text-[10px] font-semibold uppercase">
                            <span
                              className="material-symbols-outlined text-[13px]"
                              aria-hidden="true"
                            >
                              verified
                            </span>
                            Admin Verified
                          </span>
                        )}
                      </div>
                      <div className="font-code-sm text-code-sm text-on-surface-variant mt-0.5">
                        Status: {idea.status} · {idea.volunteerCount} volunteers ·{' '}
                        {idea.responseCount} responses
                      </div>
                    </div>
                    <Link
                      to={`/ideas/${idea.id}/edit`}
                      className="min-h-[38px] px-3 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-code-sm inline-flex items-center"
                    >
                      Edit
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* My Volunteering */}
          <section
            id="my-volunteering"
            className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-md"
          >
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              My Volunteering ({myVolunteering.length})
            </h2>
            {myVolunteering.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  You haven’t volunteered on any ideas yet.
                </p>
                <Link
                  to="/explore?track=builder"
                  className="font-code-sm text-code-sm text-primary hover:underline w-fit"
                >
                  Browse ideas seeking builders →
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-space-sm">
                {myVolunteering.map((vol) => {
                  const targetExists = ideas.some((i) => i.id === vol.ideaId);
                  return (
                    <div
                      key={`${vol.ideaId}-${vol.id}`}
                      className="p-space-md rounded-xl bg-surface-container flex items-center justify-between gap-2"
                    >
                      <div>
                        {targetExists ? (
                          <Link
                            to={`/ideas/${vol.ideaId}/volunteers`}
                            className="font-title-md text-title-md text-on-surface hover:text-primary"
                          >
                            {vol.ideaTitle}
                          </Link>
                        ) : (
                          <span className="font-title-md text-title-md text-on-surface-variant line-through">
                            {vol.ideaTitle} (Removed)
                          </span>
                        )}
                        <div className="font-code-sm text-code-sm text-on-surface-variant">
                          Role: {vol.role} · Offered {formatRelativeTime(vol.createdAt)}
                        </div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full bg-surface-container-highest font-code-sm text-code-sm capitalize">
                        {vol.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* My Connections */}
          <section
            id="my-connections"
            className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-md"
          >
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              My Linked Connections ({myConnections.length})
            </h2>
            {myConnections.length === 0 ? (
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                No cross-linked ideas yet. Connect complementary specs on any idea page or the
                Constellation Map.
              </p>
            ) : (
              <div className="flex flex-col gap-space-sm">
                {myConnections.map((c) => {
                  const aExists = ideas.some((i) => i.id === c.ideaA);
                  const bExists = ideas.some((i) => i.id === c.ideaB);
                  return (
                    <div
                      key={c.id}
                      className="p-space-md rounded-xl bg-surface-container flex flex-col gap-1"
                    >
                      <div className="font-title-md text-title-md text-on-surface">
                        {aExists ? (
                          <Link to={`/ideas/${c.ideaA}`} className="hover:text-primary">
                            {c.ideaATitle}
                          </Link>
                        ) : (
                          <span className="text-on-surface-variant line-through">
                            {c.ideaATitle}
                          </span>
                        )}{' '}
                        <span className="text-secondary">↔</span>{' '}
                        {bExists ? (
                          <Link to={`/ideas/${c.ideaB}`} className="hover:text-primary">
                            {c.ideaBTitle}
                          </Link>
                        ) : (
                          <span className="text-on-surface-variant line-through">
                            {c.ideaBTitle}
                          </span>
                        )}
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant">{c.reason}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export const PublicUserProfilePage: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const { ideas, connections, openReportModal } = useApp();
  const [fetchedProfile, setFetchedProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (!username) return;
    if (username === 'founder') {
      setFetchedProfile({
        uid: 'founder',
        displayName: 'Solo Maker & Curator',
        username: 'founder',
        bio: 'Builder of Synapse. Authoring open starter specifications for the community.',
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
      });
      return;
    }
    if (username === 'deleted-member') {
      setFetchedProfile({
        uid: 'deleted-member',
        displayName: 'Former Community Member',
        username: 'deleted-member',
        bio: 'This account was deleted by its owner. Public specifications with community activity remain preserved.',
        accountStatus: 'deleted',
        createdAt: '2026-09-24T00:00:00.000Z',
        updatedAt: '2026-09-24T00:00:00.000Z',
      });
      return;
    }
    const q = query(collection(db, 'users'), where('username', '==', username.toLowerCase()));
    getDocs(q)
      .then((snap) => {
        if (!snap.empty) {
          setFetchedProfile(snap.docs[0].data() as UserProfile);
        }
      })
      .catch(() => {});
  }, [username]);

  const userIdeas = useMemo(
    () => ideas.filter((i) => i.authorUsername.toLowerCase() === (username || '').toLowerCase()),
    [ideas, username]
  );

  const userConnections = useMemo(() => {
    if (!fetchedProfile) return [];
    return connections.filter((c) => c.createdBy === fetchedProfile.uid);
  }, [connections, fetchedProfile]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-margin py-space-xl flex flex-col gap-space-xl">
      <PageMeta
        title={`@${username} — Maker Profile on Synapse`}
        description={`View ideas and specifications posted by @${username} on Synapse.`}
      />

      <div className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col sm:flex-row sm:items-center justify-between gap-space-lg">
        <div className="flex items-center gap-space-lg">
          {fetchedProfile?.avatarUrl ? (
            <img
              src={fetchedProfile.avatarUrl}
              alt={fetchedProfile.displayName}
              className="w-16 h-16 rounded-full object-cover border border-surface-variant shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-primary text-on-primary font-headline-md text-headline-md font-bold flex items-center justify-center shrink-0">
              {(username || 'M').slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-headline-lg text-headline-lg text-on-surface">
                {fetchedProfile?.displayName || `@${username}`}
              </h1>
              {(fetchedProfile?.suspended || fetchedProfile?.accountStatus === 'disabled') && (
                <span className="px-2.5 py-0.5 rounded-full bg-error-container text-on-error-container font-code-sm text-code-sm uppercase font-semibold">
                  Suspended Account
                </span>
              )}
            </div>
            <span className="font-code-sm text-code-sm text-secondary">@{username}</span>
            {fetchedProfile?.bio && (
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                {fetchedProfile.bio}
              </p>
            )}
          </div>
        </div>

        {username && username !== 'founder' && username !== 'deleted-member' && (
          <button
            type="button"
            onClick={() =>
              openReportModal({
                targetType: 'user',
                targetId: username,
                targetTitle: `Maker Profile @${username}`,
              })
            }
            className="min-h-[40px] px-3.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-error font-code-sm text-code-sm inline-flex items-center gap-1.5 self-start sm:self-auto"
          >
            <span className="material-symbols-outlined text-[16px]">flag</span>
            <span>Report Profile</span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-space-md">
        <h2 className="font-headline-sm text-headline-sm text-on-surface">
          Published Specifications ({userIdeas.length})
        </h2>
        {userIdeas.length === 0 ? (
          <div className="bg-surface-container-low rounded-2xl p-10 text-center text-on-surface-variant">
            No public specifications published by @{username} yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {userIdeas.map((idea) => (
              <div
                key={idea.id}
                className="bg-surface-container-low hover:bg-surface-container p-space-lg rounded-2xl flex flex-col justify-between gap-space-md transition-colors"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-code-sm text-code-sm text-primary uppercase">
                        {idea.category} ·{' '}
                        {idea.helpTrack === 'builder' ? 'Needs a Builder' : 'Needs Guidance'}
                      </span>
                      {idea.adminVerified && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/15 text-secondary font-code-sm text-[10px] font-semibold uppercase">
                          <span
                            className="material-symbols-outlined text-[13px]"
                            aria-hidden="true"
                          >
                            verified
                          </span>
                          Admin Verified
                        </span>
                      )}
                    </div>
                    <BookmarkButton idea={idea} variant="icon" />
                  </div>
                  <Link to={`/ideas/${idea.id}`}>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface hover:text-primary mt-1 transition-colors">
                      {idea.title}
                    </h3>
                  </Link>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 line-clamp-2">
                    {idea.summary}
                  </p>
                </div>
                <Link
                  to={`/ideas/${idea.id}`}
                  className="font-code-sm text-code-sm text-secondary hover:underline w-fit"
                >
                  Explore Spec →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {userConnections.length > 0 && (
        <div className="flex flex-col gap-space-md">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            Constellation Connections Linked ({userConnections.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {userConnections.map((c) => (
              <div
                key={c.id}
                className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-1 border-l-4 border-secondary"
              >
                <div className="font-title-md text-title-md text-on-surface">
                  <Link to={`/ideas/${c.ideaA}`} className="hover:text-primary">
                    {c.ideaATitle}
                  </Link>{' '}
                  <span className="text-secondary">↔</span>{' '}
                  <Link to={`/ideas/${c.ideaB}`} className="hover:text-primary">
                    {c.ideaBTitle}
                  </Link>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant">{c.reason}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
