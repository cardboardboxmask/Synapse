import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import {
  ADMIN_SECURITY_CONFIG,
  AdminReauthSession,
  getAdminSessionRemainingMs,
  isAdminReauthSessionValid,
  isAdminSessionFreshForDestructiveAction,
  resetAdminVerificationAttempts,
} from '../config/adminSecurity';
import {
  auth,
  checkIsAdmin,
  db,
  ensureUserProfile,
  handleFirestoreError,
  logAdminSecurityAuditEvent,
  OperationType,
  removeBookmark,
  saveBookmark,
  signInWithGoogle,
  signOutUser,
  updateBookmarkNote,
} from '../firebase';
import { SEED_IDEAS } from '../data/seedIdeas';
import {
  DRAFT_SCHEMA_VERSION,
  Idea,
  IdeaConnection,
  ModerationReport,
  PostIdeaDraft,
  SavedBookmark,
  UserNotification,
  UserProfile,
} from '../types/synapse';
import type { WebAuthnVerificationReceipt } from '../utils/adminWebAuthnClient';
import { isBrowserOnline } from '../utils/observability';

export interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'info' | 'error';
}

export interface ReportModalTarget {
  targetType: 'idea' | 'response' | 'user';
  targetId: string;
  targetTitle: string;
}

export interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

const DRAFT_STORAGE_KEY_V2 = 'synapse_post_draft_v2';
const LEGACY_DRAFT_STORAGE_KEY = 'synapse_post_draft';

export const INITIAL_POST_DRAFT: PostIdeaDraft = {
  schemaVersion: DRAFT_SCHEMA_VERSION,
  title: '',
  category: 'Software',
  tags: ['opensource'],
  helpTrack: 'builder',
  summary: '',
  problem: '',
  solution: '',
  targetUsers: '',
  knownBlockers: '',
  helpWanted: '',
  collaborationExpectations: '',
  referenceLinks: '',
  diagramUrl: '',
  existingCheckNote: '',
  showcaseUrl: '',
  showcaseCredits: '',
  showcaseNotes: '',
  license: 'cc-by',
};

function loadAndMigrateDraftFromStorage(): {
  draft: PostIdeaDraft;
  savedAt: string | null;
  wasRestored: boolean;
} {
  try {
    const rawV2 = localStorage.getItem(DRAFT_STORAGE_KEY_V2);
    const rawLegacy = !rawV2 ? localStorage.getItem(LEGACY_DRAFT_STORAGE_KEY) : null;
    const raw = rawV2 || rawLegacy;
    if (!raw) {
      return { draft: INITIAL_POST_DRAFT, savedAt: null, wasRestored: false };
    }
    const parsed = JSON.parse(raw) as Partial<PostIdeaDraft> & { savedAt?: string };
    if (!parsed || typeof parsed !== 'object') {
      return { draft: INITIAL_POST_DRAFT, savedAt: null, wasRestored: false };
    }

    const migrated: PostIdeaDraft = {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      title: typeof parsed.title === 'string' ? parsed.title.slice(0, 150) : '',
      category:
        parsed.category === 'Software' ||
        parsed.category === 'Hardware' ||
        parsed.category === 'AI' ||
        parsed.category === 'Web' ||
        parsed.category === 'Other'
          ? parsed.category
          : 'Software',
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t): t is string => typeof t === 'string').slice(0, 10)
        : ['opensource'],
      helpTrack: parsed.helpTrack === 'guidance' ? 'guidance' : 'builder',
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 400) : '',
      problem: typeof parsed.problem === 'string' ? parsed.problem.slice(0, 4000) : '',
      solution: typeof parsed.solution === 'string' ? parsed.solution.slice(0, 4000) : '',
      targetUsers: typeof parsed.targetUsers === 'string' ? parsed.targetUsers.slice(0, 2000) : '',
      knownBlockers:
        typeof parsed.knownBlockers === 'string' ? parsed.knownBlockers.slice(0, 2000) : '',
      helpWanted: typeof parsed.helpWanted === 'string' ? parsed.helpWanted.slice(0, 2000) : '',
      collaborationExpectations:
        typeof parsed.collaborationExpectations === 'string'
          ? parsed.collaborationExpectations.slice(0, 2000)
          : '',
      referenceLinks:
        typeof parsed.referenceLinks === 'string' ? parsed.referenceLinks.slice(0, 2000) : '',
      diagramUrl: typeof parsed.diagramUrl === 'string' ? parsed.diagramUrl.slice(0, 300000) : '',
      existingCheckNote:
        typeof parsed.existingCheckNote === 'string' ? parsed.existingCheckNote.slice(0, 1000) : '',
      showcaseUrl: typeof parsed.showcaseUrl === 'string' ? parsed.showcaseUrl.slice(0, 500) : '',
      showcaseCredits:
        typeof parsed.showcaseCredits === 'string' ? parsed.showcaseCredits.slice(0, 500) : '',
      showcaseNotes:
        typeof parsed.showcaseNotes === 'string' ? parsed.showcaseNotes.slice(0, 2000) : '',
      license:
        parsed.license === 'all-rights-kept' ||
        parsed.license === 'cc-by' ||
        parsed.license === 'mit'
          ? parsed.license
          : 'cc-by',
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : undefined,
    };

    if (rawLegacy) {
      localStorage.setItem(DRAFT_STORAGE_KEY_V2, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
    }

    const hasContent = Boolean(
      migrated.title.trim() ||
        migrated.summary.trim() ||
        migrated.problem.trim() ||
        migrated.solution.trim()
    );

    return {
      draft: migrated,
      savedAt: migrated.savedAt || null,
      wasRestored: hasContent,
    };
  } catch {
    // Corrupted localStorage draft: clear safely and return clean defaults
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY_V2);
      localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
    return { draft: INITIAL_POST_DRAFT, savedAt: null, wasRestored: false };
  }
}

interface AppContextValue {
  user: User | null;
  profile: UserProfile | null;
  isAdmin: boolean;
  authReady: boolean;
  authLoading: boolean;
  isOnline: boolean;
  signIn: () => Promise<User | null>;
  signOut: () => Promise<void>;
  ideas: Idea[];
  ideasLoading: boolean;
  ideasError: string | null;
  connections: IdeaConnection[];
  notifications: UserNotification[];
  unreadCount: number;
  reports: ModerationReport[];
  savedBookmarks: SavedBookmark[];
  bookmarks: SavedBookmark[];
  savedIdeaIds: string[];
  isBookmarked: (ideaId: string) => boolean;
  toggleSaveIdea: (idea: Idea) => Promise<void>;
  toggleBookmark: (idea: Idea) => Promise<void>;
  saveBookmarkNote: (ideaId: string, note: string) => Promise<void>;
  updateBookmarkQuickNote: (ideaId: string, note: string) => Promise<void>;
  draft: PostIdeaDraft;
  lastSavedAt: string | null;
  draftRestoredFromStorage: boolean;
  updateDraft: (patch: Partial<PostIdeaDraft>) => void;
  saveDraftNow: () => void;
  resetDraft: () => void;
  simulateZeroState: boolean;
  setSimulateZeroState: (val: boolean) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  toasts: ToastItem[];
  showToast: (message: string, type?: 'success' | 'info' | 'error') => void;
  dismissToast: (id: string) => void;
  reportTarget: ReportModalTarget | null;
  openReportModal: (target: ReportModalTarget) => void;
  closeReportModal: () => void;
  confirmDialog: ConfirmDialogState | null;
  openConfirm: (dialog: ConfirmDialogState) => void;
  requestConfirm: (dialog: ConfirmDialogState) => void;
  closeConfirm: () => void;
  refreshProfile: () => Promise<void>;
  adminReauth: AdminReauthSession | null;
  isAdminUnlocked: boolean;
  isAdminFreshForDestructive: boolean;
  adminSessionRemainingMs: number;
  adminLockReason: 'none' | 'timeout' | 'manual';
  completeAdminSecurityVerification: (params: {
    reauthCompletedAt: number;
    receipt: WebAuthnVerificationReceipt;
  }) => void;
  touchAdminSessionActivity: () => void;
  lockAdminPanel: (reason?: 'manual' | 'timeout' | 'security') => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => isBrowserOnline());

  const [rawIdeas, setRawIdeas] = useState<Idea[]>(SEED_IDEAS);
  const [ideasLoading, setIdeasLoading] = useState(true);
  const [ideasError, setIdeasError] = useState<string | null>(null);

  const [connections, setConnections] = useState<IdeaConnection[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [savedBookmarks, setSavedBookmarks] = useState<SavedBookmark[]>([]);
  const [simulateZeroState, setSimulateZeroState] = useState(false);

  // Versioned Post Wizard Draft State
  const initialDraftInfo = loadAndMigrateDraftFromStorage();
  const [draft, setDraft] = useState<PostIdeaDraft>(initialDraftInfo.draft);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialDraftInfo.savedAt);
  const [draftRestoredFromStorage, setDraftRestoredFromStorage] = useState<boolean>(
    initialDraftInfo.wasRestored
  );

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('synapse_theme');
    return saved === 'light' ? 'light' : 'dark';
  });

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [reportTarget, setReportTarget] = useState<ReportModalTarget | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  // Volatile in-memory Admin Re-Authentication state (NEVER persisted to storage)
  const [adminReauth, setAdminReauth] = useState<AdminReauthSession | null>(null);
  const [adminLockReason, setAdminLockReason] = useState<'none' | 'timeout' | 'manual'>('none');
  const [nowTick, setNowTick] = useState<number>(() => Date.now());

  // Network online/offline listeners
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
    }
    localStorage.setItem('synapse_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const showToast = (
    message: string,
    type: 'success' | 'info' | 'error' = 'info'
  ) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const persistDraftToStorage = (nextDraft: PostIdeaDraft) => {
    const timeLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const withVersion: PostIdeaDraft = {
      ...nextDraft,
      schemaVersion: DRAFT_SCHEMA_VERSION,
      savedAt: timeLabel,
    };
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY_V2, JSON.stringify(withVersion));
      setLastSavedAt(timeLabel);
    } catch {
      // ignore storage quota errors
    }
  };

  const updateDraft = (patch: Partial<PostIdeaDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch, schemaVersion: DRAFT_SCHEMA_VERSION };
      persistDraftToStorage(next);
      return next;
    });
  };

  const saveDraftNow = () => {
    persistDraftToStorage(draft);
    showToast('Draft saved locally in your browser (Schema v2).', 'success');
  };

  const resetDraft = () => {
    setDraft(INITIAL_POST_DRAFT);
    setLastSavedAt(null);
    setDraftRestoredFromStorage(false);
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY_V2);
      localStorage.removeItem(LEGACY_DRAFT_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  // 1. Auth & Profile Listener (with disabled/deleted account lifecycle handling)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (currUser) => {
      setUser(currUser);
      if (currUser) {
        try {
          const [prof, adminFlag] = await Promise.all([
            ensureUserProfile(currUser),
            checkIsAdmin(currUser.uid),
          ]);
          setProfile(prof);
          setIsAdmin(adminFlag);
        } catch (err) {
          const msg = err instanceof Error ? err.message : '';
          if (msg.includes('disabled')) {
            showToast('This account has been disabled by moderation.', 'error');
            await signOutUser().catch(() => {});
            setUser(null);
            setProfile(null);
            setIsAdmin(false);
          } else {
            console.error('Failed to initialize user profile', err);
          }
        }
      } else {
        setProfile(null);
        setIsAdmin(false);
        setNotifications([]);
        setSavedBookmarks([]);
        setReports([]);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  const signIn = async () => {
    try {
      const u = await signInWithGoogle();
      return u;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      showToast(msg, 'error');
      return null;
    }
  };

  const signOut = async () => {
    setAdminReauth(null);
    setAdminLockReason('none');
    await signOutUser();
    showToast('Signed out.', 'info');
  };

  const lockAdminPanel = useCallback(
    async (reason: 'manual' | 'timeout' | 'security' = 'manual') => {
      const hadSession = Boolean(adminReauth);
      setAdminReauth(null);
      if (reason === 'timeout') {
        setAdminLockReason('timeout');
        if (hadSession && user && isAdmin) {
          await logAdminSecurityAuditEvent({
            action: 'admin.panel.timeout',
            summary: 'Admin Panel session locked automatically due to inactivity or max lifetime timeout.',
          }).catch(() => {});
        }
      } else if (reason === 'manual') {
        setAdminLockReason('manual');
        if (hadSession && user && isAdmin) {
          await logAdminSecurityAuditEvent({
            action: 'admin.panel.lock',
            summary: 'Administrator manually locked the Admin Panel session.',
          }).catch(() => {});
        }
      } else {
        setAdminLockReason('none');
      }
    },
    [adminReauth, user, isAdmin]
  );

  const completeAdminSecurityVerification = useCallback(
    (params: { reauthCompletedAt: number; receipt: WebAuthnVerificationReceipt }) => {
      if (!user || !isAdmin) return;
      const now = Date.now();
      resetAdminVerificationAttempts(user.uid);
      setAdminLockReason('none');
      setAdminReauth({
        authenticated: true,
        uid: user.uid,
        reauthCompletedAt: params.reauthCompletedAt,
        deviceVerifiedAt: params.receipt.verifiedAt || now,
        verifiedAt: now,
        lastActivityAt: now,
        expiresAt: now + ADMIN_SECURITY_CONFIG.INACTIVITY_TIMEOUT_MS,
        maxExpiresAt: now + ADMIN_SECURITY_CONFIG.MAX_SESSION_LIFETIME_MS,
        method: params.receipt.method,
        receiptId: params.receipt.receiptId,
      });
      setNowTick(now);
    },
    [user, isAdmin]
  );

  const touchAdminSessionActivity = useCallback(() => {
    setAdminReauth((prev) => {
      if (!prev || !user || prev.uid !== user.uid) return null;
      const now = Date.now();
      if (!isAdminReauthSessionValid(prev, user.uid, now)) {
        return null;
      }
      const nextInactivityExpiry = Math.min(
        prev.maxExpiresAt,
        now + ADMIN_SECURITY_CONFIG.INACTIVITY_TIMEOUT_MS
      );
      return {
        ...prev,
        lastActivityAt: now,
        expiresAt: nextInactivityExpiry,
      };
    });
  }, [user]);

  // Immediately clear adminReauth if user logs out, switches account, loses admin, or is suspended
  useEffect(() => {
    if (
      !user ||
      !isAdmin ||
      profile?.suspended ||
      profile?.accountStatus === 'disabled' ||
      (adminReauth && adminReauth.uid !== user.uid)
    ) {
      if (adminReauth) {
        setAdminReauth(null);
      }
    }
  }, [user, isAdmin, profile?.suspended, profile?.accountStatus, adminReauth]);

  // Monitor active admin session expiration every second
  useEffect(() => {
    if (!adminReauth) return;
    const interval = window.setInterval(() => {
      const now = Date.now();
      setNowTick(now);
      if (!user || !isAdminReauthSessionValid(adminReauth, user.uid, now)) {
        void lockAdminPanel('timeout');
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [adminReauth, user, lockAdminPanel]);

  const refreshProfile = async () => {
    if (!user) return;
    const [snap, adminFlag] = await Promise.all([
      getDoc(doc(db, 'users', user.uid)),
      checkIsAdmin(user.uid),
    ]);
    if (snap.exists()) {
      setProfile(snap.data() as UserProfile);
    }
    setIsAdmin(adminFlag);
  };

  // Verify sole-owner admin status whenever auth user changes
  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    checkIsAdmin(user.uid).then((flag) => {
      if (!cancelled) {
        setIsAdmin(flag);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // 2. Seed Starter Ideas if Firestore is completely empty, then stream real-time
  useEffect(() => {
    let seededOnce = false;
    const q = query(collection(db, 'ideas'), orderBy('createdAt', 'desc'), limit(200));

    const unsub = onSnapshot(
      q,
      async (snapshot) => {
        setIdeasError(null);
        if (snapshot.empty && !seededOnce) {
          seededOnce = true;
          try {
            for (const seed of SEED_IDEAS) {
              const seedRef = doc(db, 'ideas', seed.id);
              const existing = await getDoc(seedRef);
              if (!existing.exists()) {
                const { id: _id, ...payload } = seed;
                await setDoc(seedRef, payload);
              }
            }
          } catch {
            // If rules prevent anonymous seeding, fallback to SEED_IDEAS in memory
            setRawIdeas(SEED_IDEAS);
            setIdeasLoading(false);
          }
          return;
        }

        const fetched: Idea[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Omit<Idea, 'id'>;
          if (!data.deletedAt) {
            fetched.push({ id: docSnap.id, ...data });
          }
        });

        setRawIdeas(fetched);
        setIdeasLoading(false);
      },
      (error) => {
        console.warn('Firestore ideas listener warning:', error);
        setIdeasError('Live sync degraded — showing cached starter specifications.');
        setRawIdeas(SEED_IDEAS);
        setIdeasLoading(false);
      }
    );

    return () => unsub();
  }, []);

  // 3. Connections Real-Time Listener
  useEffect(() => {
    const q = query(collection(db, 'connections'), orderBy('createdAt', 'desc'), limit(200));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: IdeaConnection[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<IdeaConnection, 'id'>),
          });
        });
        setConnections(list);
      },
      () => {
        setConnections([]);
      }
    );
    return () => unsub();
  }, []);

  // 4. User Notifications Real-Time Listener
  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }
    const path = `users/${user.uid}/notifications`;
    const q = query(
      collection(db, 'users', user.uid, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(100)
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: UserNotification[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<UserNotification, 'id'>),
          });
        });
        setNotifications(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, path);
        } catch {
          setNotifications([]);
        }
      }
    );
    return () => unsub();
  }, [user]);

  // 5. User Bookmarks Real-Time Listener (`users/{uid}/bookmarks/{ideaId}`)
  useEffect(() => {
    if (!user) {
      setSavedBookmarks([]);
      return;
    }
    const path = `users/${user.uid}/bookmarks`;
    const q = query(
      collection(db, 'users', user.uid, 'bookmarks'),
      orderBy('createdAt', 'desc'),
      limit(200)
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: SavedBookmark[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<SavedBookmark, 'id'>),
          });
        });
        setSavedBookmarks(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, path);
        } catch {
          setSavedBookmarks([]);
        }
      }
    );
    return () => unsub();
  }, [user]);

  // 6. Admin Moderation Reports Real-Time Listener (only if admin)
  useEffect(() => {
    if (!user || !isAdmin) {
      setReports([]);
      return;
    }
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(200));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list: ModerationReport[] = [];
        snapshot.forEach((docSnap) => {
          list.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<ModerationReport, 'id'>),
          });
        });
        setReports(list);
      },
      () => {
        setReports([]);
      }
    );
    return () => unsub();
  }, [user, isAdmin]);

  const savedIdeaIds = savedBookmarks.map((b) => b.ideaId);

  const isBookmarked = (ideaId: string) => {
    return savedIdeaIds.includes(ideaId);
  };

  const toggleSaveIdea = async (idea: Idea) => {
    if (!user) return;
    const currentlySaved = isBookmarked(idea.id);
    try {
      if (currentlySaved) {
        await removeBookmark(user.uid, idea.id);
        showToast('Removed from your saved ideas.', 'info');
      } else {
        await saveBookmark(user.uid, idea);
        showToast('Saved to your bookmarks.', 'success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update bookmark. Please try again.';
      showToast(msg, 'error');
    }
  };

  const saveBookmarkNote = async (ideaId: string, note: string) => {
    if (!user) return;
    try {
      await updateBookmarkNote(user.uid, ideaId, note);
      showToast('Personal bookmark note saved.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not save bookmark note.';
      showToast(msg, 'error');
    }
  };

  const ideas = simulateZeroState ? [] : rawIdeas;
  const unreadCount = notifications.filter((n) => !n.read).length;

  const openReportModal = (target: ReportModalTarget) => setReportTarget(target);
  const closeReportModal = () => setReportTarget(null);

  const openConfirm = (dialog: ConfirmDialogState) => setConfirmDialog(dialog);
  const closeConfirm = () => setConfirmDialog(null);

  const isAdminUnlocked = Boolean(
    user &&
      isAdmin &&
      !profile?.suspended &&
      profile?.accountStatus !== 'disabled' &&
      isAdminReauthSessionValid(adminReauth, user.uid, nowTick)
  );

  const isAdminFreshForDestructive = Boolean(
    user &&
      isAdmin &&
      !profile?.suspended &&
      isAdminSessionFreshForDestructiveAction(adminReauth, user.uid, nowTick)
  );

  const adminSessionRemainingMs = isAdminUnlocked
    ? getAdminSessionRemainingMs(adminReauth, nowTick)
    : 0;

  return (
    <AppContext.Provider
      value={{
        user,
        profile,
        isAdmin,
        authReady,
        authLoading: !authReady,
        isOnline,
        signIn,
        signOut,
        ideas,
        ideasLoading,
        ideasError,
        connections: simulateZeroState ? [] : connections,
        notifications,
        unreadCount,
        reports,
        savedBookmarks,
        bookmarks: savedBookmarks,
        savedIdeaIds,
        isBookmarked,
        toggleSaveIdea,
        toggleBookmark: toggleSaveIdea,
        saveBookmarkNote,
        updateBookmarkQuickNote: saveBookmarkNote,
        draft,
        lastSavedAt,
        draftRestoredFromStorage,
        updateDraft,
        saveDraftNow,
        resetDraft,
        simulateZeroState,
        setSimulateZeroState,
        theme,
        toggleTheme,
        toasts,
        showToast,
        dismissToast,
        reportTarget,
        openReportModal,
        closeReportModal,
        confirmDialog,
        openConfirm,
        requestConfirm: openConfirm,
        closeConfirm,
        refreshProfile,
        adminReauth,
        isAdminUnlocked,
        isAdminFreshForDestructive,
        adminSessionRemainingMs,
        adminLockReason,
        completeAdminSecurityVerification,
        touchAdminSessionActivity,
        lockAdminPanel,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
