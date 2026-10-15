import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  getDocsFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  AuditActionType,
  AuditLogEntry,
  Idea,
  IdeaConnection,
  IdeaDraft,
  IdeaRevision,
  IdeaStatus,
  NotificationPreferences,
  ReportCategory,
  ResponseType,
  UserProfile,
  VolunteerStatus,
} from './types/synapse';
import {
  getNormalizedConnectionId,
  isValidIdeaStatusTransition,
  normalizeUsername,
  RESERVED_USERNAMES,
  sanitizeTag,
  sanitizeText,
  sanitizeUrl,
  validateExternalUrl,
  validateUsername,
} from './utils/sanitize';
import { assertOnlineForMutation, recordClientError } from './utils/observability';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  recordClientError('firebase', operationType, error, path);
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Helper to execute a Firestore transaction with automatic retry on transient contention.
 */
async function executeTransactionWithRetry<T>(
  fn: Parameters<typeof runTransaction<T>>[1],
  maxAttempts = 3
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await runTransaction(db, fn);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      const isTransient =
        msg.includes('aborted') ||
        msg.includes('contention') ||
        msg.includes('failed-precondition');
      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 120 * attempt));
    }
  }
  throw lastErr;
}

// Validate connection on boot
async function testConnection() {
  try {
    const q = query(collection(db, 'ideas'), limit(1));
    await getDocsFromServer(q);
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

/**
 * Writes an immutable audit log entry to `auditLogs/{logId}` (non-blocking for user UX).
 */
export async function writeAuditLog(params: {
  actorId: string;
  actorName: string;
  action: AuditActionType;
  targetType: 'idea' | 'response' | 'user' | 'report' | 'volunteer' | 'connection' | 'admin';
  targetId: string;
  summary: string;
}): Promise<void> {
  try {
    const logRef = doc(collection(db, 'auditLogs'));
    await setDoc(logRef, {
      actorId: sanitizeText(params.actorId, 128),
      actorName: sanitizeText(params.actorName || 'Maker', 100),
      action: params.action,
      targetType: params.targetType,
      targetId: sanitizeText(params.targetId, 128),
      summary: sanitizeText(params.summary, 1000),
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Audit log non-fatal notice:', err);
  }
}

/**
 * Sends a deduplicated notification while respecting recipient notification preferences.
 * Uses a deterministic ID (`notif_${type}_${actorId}_${targetId}`) to prevent spam.
 */
async function sendDeduplicatedNotification(params: {
  recipientId: string;
  type: 'response' | 'volunteer' | 'connection' | 'status-change';
  targetId: string;
  title: string;
  message: string;
  link: string;
  actorId: string;
  actorName: string;
}): Promise<void> {
  if (
    !params.recipientId ||
    params.recipientId === params.actorId
  ) {
    return;
  }

  try {
    // Check recipient profile & notification preferences
    const recipientSnap = await getDoc(doc(db, 'users', params.recipientId));
    if (recipientSnap.exists()) {
      const recipientData = recipientSnap.data() as UserProfile;
      if (recipientData.deleted) return;
      const prefs = recipientData.notificationPrefs;
      if (prefs) {
        if (params.type === 'response' && prefs.responses === false) return;
        if (params.type === 'volunteer' && prefs.volunteers === false) return;
        if (params.type === 'connection' && prefs.connections === false) return;
        if (params.type === 'status-change' && prefs.statusChanges === false) return;
      }
    }

    const safeTargetKey = params.targetId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    const deterministicId = `notif_${params.type}_${params.actorId.slice(0, 24)}_${safeTargetKey}`;
    const notifRef = doc(db, 'users', params.recipientId, 'notifications', deterministicId);
    const now = new Date().toISOString();

    await setDoc(notifRef, {
      recipientId: params.recipientId,
      type: params.type,
      title: sanitizeText(params.title, 200),
      message: sanitizeText(params.message, 1000),
      link: sanitizeText(params.link, 300),
      targetId: sanitizeText(params.targetId, 128),
      read: false,
      actorId: params.actorId,
      actorName: sanitizeText(params.actorName, 100),
      createdAt: now,
    });
  } catch (notifErr) {
    console.warn('Notification non-fatal notice:', notifErr);
  }
}

/**
 * Ensures a user profile document exists in `users/{uid}` upon sign-in,
 * claiming a unique normalized lowercase username in `usernames/{username}`.
 */
export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const path = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const now = new Date().toISOString();
  const rawName = sanitizeText(user.displayName || user.email?.split('@')[0] || 'Maker', 80);

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const existing = snap.data() as UserProfile;
      // If the user previously deleted their account and signs back in, reactivate cleanly
      if (existing.deleted) {
        const fallbackUsername = `maker-${user.uid.slice(0, 6).toLowerCase()}`;
        const reactivated: UserProfile = {
          uid: user.uid,
          displayName: rawName,
          username: fallbackUsername,
          photoURL: user.photoURL || '',
          bio: 'Independent maker on Synapse.',
          deleted: false,
          createdAt: existing.createdAt || now,
          updatedAt: now,
        };
        await setDoc(userRef, reactivated, { merge: true });
        return reactivated;
      }
      return {
        ...existing,
        uid: existing.uid || user.uid,
        displayName: existing.displayName || rawName,
        username: existing.username || `maker-${user.uid.slice(0, 6).toLowerCase()}`,
        photoURL: existing.photoURL || user.photoURL || '',
        bio: existing.bio || 'Independent maker on Synapse.',
        createdAt: existing.createdAt || now,
      };
    }

    let candidate = normalizeUsername(user.email?.split('@')[0] || rawName);
    if (candidate.length < 3 || RESERVED_USERNAMES.has(candidate)) {
      candidate = `maker-${user.uid.slice(0, 6).toLowerCase()}`;
    }

    // Check if candidate username is already claimed by someone else
    try {
      const claimRef = doc(db, 'usernames', candidate);
      const claimSnap = await getDoc(claimRef);
      if (claimSnap.exists() && claimSnap.data()?.uid !== user.uid) {
        candidate = `${candidate.slice(0, 20)}-${user.uid.slice(0, 5).toLowerCase()}`;
      }
    } catch {
      candidate = `maker-${user.uid.slice(0, 6).toLowerCase()}`;
    }

    const finalProfile: UserProfile = {
      uid: user.uid,
      displayName: rawName,
      username: candidate,
      photoURL: user.photoURL || '',
      bio: 'Independent maker on Synapse.',
      deleted: false,
      createdAt: now,
      updatedAt: now,
    };

    await setDoc(userRef, finalProfile, { merge: true });
    try {
      await setDoc(doc(db, 'usernames', candidate), {
        username: candidate,
        uid: user.uid,
        createdAt: now,
        updatedAt: now,
      });
    } catch {
      // Non-fatal if username claim already exists for this uid
    }

    return finalProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Updates user display name, bio, and optionally changes their unique username atomically.
 */
export async function updateUserProfile(
  uid: string,
  updates: {
    displayName: string;
    username?: string;
    bio?: string;
    avatarUrl?: string;
    notificationPrefs?: NotificationPreferences;
  }
): Promise<void> {
  assertOnlineForMutation('update your profile');
  const path = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  try {
    const cleanName = sanitizeText(updates.displayName, 80);
    const cleanBio = sanitizeText(updates.bio || '', 500);
    const cleanAvatar =
      updates.avatarUrl !== undefined ? updates.avatarUrl.trim().slice(0, 300000) : undefined;
    const now = new Date().toISOString();

    const currentSnap = await getDoc(userRef);
    if (!currentSnap.exists()) {
      throw new Error('User profile not found.');
    }
    const currentProfile = currentSnap.data() as UserProfile;
    let nextUsername = currentProfile.username;

    if (updates.username !== undefined) {
      const validation = validateUsername(updates.username);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid username.');
      }
      nextUsername = validation.normalized;
    }

    if (nextUsername !== currentProfile.username) {
      const oldUsername = currentProfile.username;
      const newClaimRef = doc(db, 'usernames', nextUsername);
      const oldClaimRef = doc(db, 'usernames', oldUsername);

      await executeTransactionWithRetry(async (tx) => {
        const newClaimSnap = await tx.get(newClaimRef);
        if (newClaimSnap.exists() && newClaimSnap.data()?.uid !== uid) {
          throw new Error(`Username @${nextUsername} is already taken by another maker.`);
        }
        const oldClaimSnap = await tx.get(oldClaimRef);

        tx.set(newClaimRef, {
          username: nextUsername,
          uid,
          createdAt: now,
          updatedAt: now,
        });

        if (oldClaimSnap.exists() && oldClaimSnap.data()?.uid === uid) {
          tx.delete(oldClaimRef);
        }

        tx.update(userRef, {
          displayName: cleanName,
          username: nextUsername,
          bio: cleanBio,
          updatedAt: now,
        });
      });

      // Propagate new username and displayName to user's authored ideas
      try {
        const authoredIdeasSnap = await getDocs(
          query(collection(db, 'ideas'), where('authorId', '==', uid))
        );
        for (const ideaDoc of authoredIdeasSnap.docs) {
          await updateDoc(doc(db, 'ideas', ideaDoc.id), {
            authorName: cleanName,
            authorUsername: nextUsername,
            updatedAt: now,
          });
        }
      } catch (propErr) {
        console.warn('Username propagation notice:', propErr);
      }

      await writeAuditLog({
        actorId: uid,
        actorName: cleanName,
        action: 'account.username_change',
        targetType: 'user',
        targetId: uid,
        summary: `Changed handle from @${oldUsername} to @${nextUsername}`,
      });
    } else {
      await updateDoc(userRef, {
        displayName: cleanName,
        bio: cleanBio,
        ...(cleanAvatar !== undefined ? { avatarUrl: cleanAvatar, photoURL: cleanAvatar } : {}),
        updatedAt: now,
      });
    }
  } catch (error) {
    if (error instanceof Error && (error.message.includes('already taken') || error.message.includes('Username'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Deletes a user's private data (bookmarks, notifications, username claim),
 * withdraws pending volunteer offers, anonymizes or deletes their public content safely,
 * marks the profile as soft-deleted, and signs out.
 */
export async function deleteMyAccountAndCleanup(uid: string, profile: UserProfile): Promise<void> {
  assertOnlineForMutation('delete your account');
  const now = new Date().toISOString();

  try {
    // 1. Delete all private bookmarks
    const bookmarksSnap = await getDocs(collection(db, 'users', uid, 'bookmarks'));
    for (const bDoc of bookmarksSnap.docs) {
      await deleteDoc(doc(db, 'users', uid, 'bookmarks', bDoc.id));
    }

    // 2. Delete all private notifications
    const notifsSnap = await getDocs(collection(db, 'users', uid, 'notifications'));
    for (const nDoc of notifsSnap.docs) {
      await deleteDoc(doc(db, 'users', uid, 'notifications', nDoc.id));
    }

    // 3. Release unique username claim
    try {
      const claimRef = doc(db, 'usernames', profile.username);
      const claimSnap = await getDoc(claimRef);
      if (claimSnap.exists() && claimSnap.data()?.uid === uid) {
        await deleteDoc(claimRef);
      }
    } catch {
      // ignore if not found
    }

    // 4. Handle user's authored ideas:
    // If an idea has 0 responses, 0 volunteers, and 0 connections (no community dependencies), delete it;
    // Otherwise soft-anonymize the author attribution so community responses/builds are not orphaned.
    const authoredSnap = await getDocs(
      query(collection(db, 'ideas'), where('authorId', '==', uid))
    );
    const deletedHandle = `deleted-${uid.slice(0, 6).toLowerCase()}`;
    for (const ideaDoc of authoredSnap.docs) {
      const ideaData = ideaDoc.data() as Idea;
      const hasCommunityHistory =
        (ideaData.responseCount || 0) > 0 ||
        (ideaData.volunteerCount || 0) > 0 ||
        (ideaData.connectionCount || 0) > 0 ||
        ideaData.status === 'built';
      if (hasCommunityHistory) {
        await updateDoc(doc(db, 'ideas', ideaDoc.id), {
          authorName: 'Deleted Maker',
          authorUsername: deletedHandle,
          updatedAt: now,
        });
      } else {
        await deleteIdea(ideaDoc.id);
      }
    }

    // 5. Write audit log before signing out
    await writeAuditLog({
      actorId: uid,
      actorName: profile.displayName,
      action: 'account.delete',
      targetType: 'user',
      targetId: uid,
      summary: `User @${profile.username} deleted account and purged private data.`,
    });

    // 6. Anonymize user profile document (soft-delete)
    await updateDoc(doc(db, 'users', uid), {
      displayName: 'Deleted Maker',
      username: deletedHandle,
      photoURL: '',
      bio: 'Account deleted by owner.',
      deleted: true,
      updatedAt: now,
    });

    // 7. Sign out
    await signOut(auth);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${uid}`);
  }
}

export async function loginWithGoogle() {
  assertOnlineForMutation('sign in with Google');
  const result = await signInWithPopup(auth, googleProvider);
  await ensureUserProfile(result.user);
  return result.user;
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<UserProfile | null> {
  assertOnlineForMutation('sign in with email');
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  if (!result.user) return null;
  return ensureUserProfile(result.user);
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<UserProfile | null> {
  assertOnlineForMutation('create an account');
  const cleanName = sanitizeText(displayName, 80) || email.split('@')[0] || 'Maker';
  const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (!result.user) return null;
  await updateProfile(result.user, { displayName: cleanName });
  await sendEmailVerification(result.user);
  return ensureUserProfile(result.user);
}

export async function resendVerificationEmail(): Promise<void> {
  assertOnlineForMutation('resend verification email');
  if (!auth.currentUser) {
    throw new Error('You must be signed in to request a verification link.');
  }
  await sendEmailVerification(auth.currentUser);
}

export async function reloadAuthUser(): Promise<boolean> {
  if (!auth.currentUser) return false;
  await auth.currentUser.reload();
  return Boolean(auth.currentUser.emailVerified);
}

export async function logoutUser() {
  await signOut(auth);
}

/**
 * Creates a new idea in Firestore with all counters strictly initialized to 0.
 */
export async function createNewIdea(
  draft: IdeaDraft,
  profile: UserProfile
): Promise<string> {
  assertOnlineForMutation('publish an idea');
  if (profile.suspended || profile.accountStatus === 'disabled') {
    throw new Error('Your account is currently suspended by an administrator and cannot publish new specifications.');
  }

  if (draft.showcaseUrl && draft.showcaseUrl.trim()) {
    const urlCheck = validateExternalUrl(draft.showcaseUrl);
    if (!urlCheck.valid) {
      throw new Error(urlCheck.error || 'Invalid showcase URL.');
    }
  }

  const ideasCol = collection(db, 'ideas');
  const newRef = doc(ideasCol);
  const now = new Date().toISOString();

  const cleanTags = Array.from(
    new Set(
      draft.tags
        .map((t) => sanitizeTag(t))
        .filter((t) => t.length > 0)
        .slice(0, 10)
    )
  );

  const cleanShowcaseUrl = sanitizeUrl(draft.showcaseUrl);
  const cleanShowcaseCredits = draft.showcaseCredits
    ? sanitizeText(draft.showcaseCredits, 1000)
    : '';
  const cleanShowcaseNotes = draft.showcaseNotes
    ? sanitizeText(draft.showcaseNotes, 2000)
    : '';

  const payload: Omit<Idea, 'id'> = {
    title: sanitizeText(draft.title, 120),
    summary: sanitizeText(draft.summary, 400),
    problem: sanitizeText(draft.problem, 5000),
    solution: sanitizeText(draft.solution, 5000),
    helpWanted: sanitizeText(draft.helpWanted, 3000),
    existingCheckNote: sanitizeText(draft.existingCheckNote || '', 2000),
    category: draft.category,
    tags: cleanTags,
    helpTrack: draft.helpTrack,
    status: 'open',
    license: draft.license,
    authorId: profile.uid,
    authorName: sanitizeText(profile.displayName, 100),
    authorUsername: sanitizeText(profile.username, 60),
    isSeed: false,
    responseCount: 0,
    volunteerCount: 0,
    connectionCount: 0,
    communityCheckSimilar: 0,
    communityCheckNew: 0,
    ...(cleanShowcaseUrl ? { showcaseUrl: cleanShowcaseUrl } : {}),
    ...(cleanShowcaseCredits ? { showcaseCredits: cleanShowcaseCredits } : {}),
    ...(cleanShowcaseNotes ? { showcaseNotes: cleanShowcaseNotes } : {}),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(newRef, payload);
    if (typeof window !== 'undefined') {
      fetch('/api/sitemap.xml').catch(() => {});
    }
    return newRef.id;
  } catch (error) {
    recordClientError('publish', 'createNewIdea', error, `ideas/${newRef.id}`);
    handleFirestoreError(error, OperationType.CREATE, `ideas/${newRef.id}`);
  }
}

/**
 * Updates an idea's fields or lifecycle status (Owner or Admin only),
 * enforcing legal lifecycle status transitions and recording a revision snapshot in `ideas/{ideaId}/revisions`.
 */
export async function updateIdeaDetails(
  ideaId: string,
  updates: Partial<
    Pick<
      Idea,
      | 'title'
      | 'summary'
      | 'problem'
      | 'solution'
      | 'helpWanted'
      | 'existingCheckNote'
      | 'category'
      | 'tags'
      | 'helpTrack'
      | 'status'
      | 'license'
      | 'showcaseUrl'
      | 'showcaseCredits'
      | 'showcaseNotes'
    >
  >,
  options?: { isAdmin?: boolean; editorName?: string }
): Promise<void> {
  assertOnlineForMutation('update this idea specification');

  if (updates.showcaseUrl && updates.showcaseUrl.trim()) {
    const urlCheck = validateExternalUrl(updates.showcaseUrl);
    if (!urlCheck.valid) {
      throw new Error(urlCheck.error || 'Invalid showcase URL.');
    }
  }

  const path = `ideas/${ideaId}`;
  const ref = doc(db, 'ideas', ideaId);
  const now = new Date().toISOString();

  try {
    const currentSnap = await getDoc(ref);
    if (!currentSnap.exists()) {
      throw new Error('Idea specification no longer exists.');
    }
    const existingIdea = currentSnap.data() as Idea;

    // Validate status transition integrity
    if (updates.status !== undefined && updates.status !== existingIdea.status) {
      const transitionCheck = isValidIdeaStatusTransition(
        existingIdea.status,
        updates.status,
        Boolean(options?.isAdmin)
      );
      if (!transitionCheck.allowed) {
        throw new Error(transitionCheck.reason || 'Invalid status transition.');
      }
    }

    const sanitized: Record<string, unknown> = {
      updatedAt: now,
    };
    const changedFields: string[] = [];

    if (updates.title !== undefined) {
      const val = sanitizeText(updates.title, 120);
      if (val !== existingIdea.title) changedFields.push('title');
      sanitized.title = val;
    }
    if (updates.summary !== undefined) {
      const val = sanitizeText(updates.summary, 400);
      if (val !== existingIdea.summary) changedFields.push('summary');
      sanitized.summary = val;
    }
    if (updates.problem !== undefined) {
      const val = sanitizeText(updates.problem, 5000);
      if (val !== existingIdea.problem) changedFields.push('problem');
      sanitized.problem = val;
    }
    if (updates.solution !== undefined) {
      const val = sanitizeText(updates.solution, 5000);
      if (val !== existingIdea.solution) changedFields.push('solution');
      sanitized.solution = val;
    }
    if (updates.helpWanted !== undefined) {
      const val = sanitizeText(updates.helpWanted, 3000);
      if (val !== existingIdea.helpWanted) changedFields.push('helpWanted');
      sanitized.helpWanted = val;
    }
    if (updates.existingCheckNote !== undefined) {
      const val = sanitizeText(updates.existingCheckNote, 2000);
      if (val !== (existingIdea.existingCheckNote || '')) changedFields.push('existingCheckNote');
      sanitized.existingCheckNote = val;
    }
    if (updates.category !== undefined) {
      if (updates.category !== existingIdea.category) changedFields.push('category');
      sanitized.category = updates.category;
    }
    if (updates.tags !== undefined) {
      const cleanTags = updates.tags.map((t) => sanitizeTag(t)).filter(Boolean).slice(0, 10);
      if (cleanTags.join(',') !== (existingIdea.tags || []).join(',')) changedFields.push('tags');
      sanitized.tags = cleanTags;
    }
    if (updates.helpTrack !== undefined) {
      if (updates.helpTrack !== existingIdea.helpTrack) changedFields.push('helpTrack');
      sanitized.helpTrack = updates.helpTrack;
    }
    if (updates.status !== undefined) {
      if (updates.status !== existingIdea.status) changedFields.push('status');
      sanitized.status = updates.status;
    }
    if (updates.license !== undefined) {
      if (updates.license !== existingIdea.license) changedFields.push('license');
      sanitized.license = updates.license;
    }
    if (updates.showcaseUrl !== undefined) {
      sanitized.showcaseUrl = sanitizeUrl(updates.showcaseUrl);
      changedFields.push('showcaseUrl');
    }
    if (updates.showcaseCredits !== undefined) {
      sanitized.showcaseCredits = sanitizeText(updates.showcaseCredits, 1000);
      changedFields.push('showcaseCredits');
    }
    if (updates.showcaseNotes !== undefined) {
      sanitized.showcaseNotes = sanitizeText(updates.showcaseNotes, 2000);
      changedFields.push('showcaseNotes');
    }

    await updateDoc(ref, sanitized);

    // Record specification revision history if fields changed
    const currentUid = auth.currentUser?.uid;
    if (currentUid && changedFields.length > 0) {
      const editorName = sanitizeText(
        options?.editorName || auth.currentUser?.displayName || 'Maker',
        100
      );
      try {
        const revRef = doc(collection(db, 'ideas', ideaId, 'revisions'));
        await setDoc(revRef, {
          ideaId,
          editorId: currentUid,
          editorName,
          changedFields: changedFields.slice(0, 15),
          previousTitle: sanitizeText(existingIdea.title, 120),
          previousSummary: sanitizeText(existingIdea.summary, 400),
          previousStatus: existingIdea.status,
          createdAt: now,
        });
      } catch (revErr) {
        console.warn('Revision log non-fatal notice:', revErr);
      }

      if (updates.status && updates.status !== existingIdea.status) {
        await writeAuditLog({
          actorId: currentUid,
          actorName: editorName,
          action: 'idea.status_change',
          targetType: 'idea',
          targetId: ideaId,
          summary: `Status transitioned from "${existingIdea.status}" to "${updates.status}" on "${existingIdea.title}"`,
        });
      }
    }

    if (typeof window !== 'undefined') {
      fetch('/api/sitemap.xml').catch(() => {});
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('Built')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Deletes an idea and cascades cleanup across dependent connections, responses, volunteers, and revisions.
 */
export async function deleteIdea(ideaId: string): Promise<void> {
  assertOnlineForMutation('delete this idea');
  const path = `ideas/${ideaId}`;
  try {
    const ideaSnap = await getDoc(doc(db, 'ideas', ideaId));
    const ideaTitle = ideaSnap.exists() ? (ideaSnap.data() as Idea).title : ideaId;

    // 1. Clean up connections referencing ideaId as ideaA or ideaB (decrementing peer connectionCount)
    try {
      const [connASnap, connBSnap] = await Promise.all([
        getDocs(query(collection(db, 'connections'), where('ideaA', '==', ideaId))),
        getDocs(query(collection(db, 'connections'), where('ideaB', '==', ideaId))),
      ]);
      const allConns = [...connASnap.docs, ...connBSnap.docs];
      const seenConnIds = new Set<string>();
      for (const connDoc of allConns) {
        if (seenConnIds.has(connDoc.id)) continue;
        seenConnIds.add(connDoc.id);
        await deleteConnectionWithTransaction({
          id: connDoc.id,
          ...(connDoc.data() as Omit<IdeaConnection, 'id'>),
        });
      }
    } catch (connErr) {
      console.warn('Connection cascade cleanup notice:', connErr);
    }

    // 2. Clean up child responses, volunteers, and revisions subcollections
    try {
      const [respSnap, volSnap, revSnap] = await Promise.all([
        getDocs(collection(db, 'ideas', ideaId, 'responses')),
        getDocs(collection(db, 'ideas', ideaId, 'volunteers')),
        getDocs(collection(db, 'ideas', ideaId, 'revisions')),
      ]);
      for (const d of respSnap.docs) {
        await deleteDoc(doc(db, 'ideas', ideaId, 'responses', d.id));
      }
      for (const d of volSnap.docs) {
        await deleteDoc(doc(db, 'ideas', ideaId, 'volunteers', d.id));
      }
      for (const d of revSnap.docs) {
        await deleteDoc(doc(db, 'ideas', ideaId, 'revisions', d.id));
      }
    } catch (subErr) {
      console.warn('Subcollection cascade cleanup notice:', subErr);
    }

    // 3. Delete the idea document itself
    await deleteDoc(doc(db, 'ideas', ideaId));

    // 4. Write audit log
    if (auth.currentUser) {
      await writeAuditLog({
        actorId: auth.currentUser.uid,
        actorName: auth.currentUser.displayName || 'Maker',
        action: 'content.delete_idea',
        targetType: 'idea',
        targetId: ideaId,
        summary: `Deleted idea specification "${ideaTitle}" (${ideaId}) and cleaned up dependent references.`,
      });
    }

    // 5. Refresh sitemap
    if (typeof window !== 'undefined') {
      fetch('/api/sitemap.xml').catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Adds a response and atomically increments `responseCount` (and `communityCheckSimilar` if similar-check)
 * using a Firestore transaction.
 */
export async function addResponseWithTransaction(params: {
  ideaId: string;
  ideaTitle: string;
  ideaAuthorId: string;
  type: ResponseType;
  content: string;
  referenceUrl?: string;
  author: UserProfile;
}): Promise<string> {
  assertOnlineForMutation('post a response');
  if (params.author.suspended || params.author.accountStatus === 'disabled') {
    throw new Error('Your account is currently suspended by an administrator and cannot post responses.');
  }

  if (params.referenceUrl && params.referenceUrl.trim()) {
    const urlCheck = validateExternalUrl(params.referenceUrl);
    if (!urlCheck.valid) {
      throw new Error(urlCheck.error || 'Invalid reference URL.');
    }
  }

  const ideaRef = doc(db, 'ideas', params.ideaId);
  const responseRef = doc(collection(db, 'ideas', params.ideaId, 'responses'));
  const now = new Date().toISOString();
  const cleanContent = sanitizeText(params.content, 3000);
  const cleanUrl = sanitizeUrl(params.referenceUrl);

  try {
    await executeTransactionWithRetry(async (tx) => {
      const ideaSnap = await tx.get(ideaRef);
      if (!ideaSnap.exists()) {
        throw new Error('Idea does not exist');
      }
      const data = ideaSnap.data() as Idea;
      const nextResponseCount = (data.responseCount || 0) + 1;
      const nextSimilarCount =
        params.type === 'similar-check'
          ? (data.communityCheckSimilar || 0) + 1
          : data.communityCheckSimilar || 0;

      tx.set(responseRef, {
        ideaId: params.ideaId,
        type: params.type,
        content: cleanContent,
        ...(cleanUrl ? { referenceUrl: cleanUrl } : {}),
        authorId: params.author.uid,
        authorName: sanitizeText(params.author.displayName, 100),
        authorUsername: sanitizeText(params.author.username, 60),
        createdAt: now,
        updatedAt: now,
      });

      tx.update(ideaRef, {
        responseCount: nextResponseCount,
        communityCheckSimilar: nextSimilarCount,
        updatedAt: now,
      });
    });

    await sendDeduplicatedNotification({
      recipientId: params.ideaAuthorId,
      type: 'response',
      targetId: params.ideaId,
      title: `New ${params.type.replace('-', ' ')} on "${sanitizeText(params.ideaTitle, 80)}"`,
      message: cleanContent.slice(0, 200),
      link: `/ideas/${params.ideaId}/responses`,
      actorId: params.author.uid,
      actorName: params.author.displayName,
    });

    return responseRef.id;
  } catch (error) {
    if (error instanceof Error && error.message.includes('URL')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `ideas/${params.ideaId}/responses`);
  }
}

export async function updateResponseByOwner(params: {
  ideaId: string;
  responseId: string;
  content: string;
  referenceUrl?: string;
}): Promise<void> {
  assertOnlineForMutation('edit your response');

  if (params.referenceUrl && params.referenceUrl.trim()) {
    const urlCheck = validateExternalUrl(params.referenceUrl);
    if (!urlCheck.valid) {
      throw new Error(urlCheck.error || 'Invalid reference URL.');
    }
  }

  const path = `ideas/${params.ideaId}/responses/${params.responseId}`;
  const ref = doc(db, 'ideas', params.ideaId, 'responses', params.responseId);
  try {
    const cleanUrl = sanitizeUrl(params.referenceUrl);
    await updateDoc(ref, {
      content: sanitizeText(params.content, 3000),
      ...(cleanUrl ? { referenceUrl: cleanUrl } : {}),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteResponseWithTransaction(
  ideaId: string,
  responseId: string
): Promise<void> {
  assertOnlineForMutation('delete this response');
  const ideaRef = doc(db, 'ideas', ideaId);
  const responseRef = doc(db, 'ideas', ideaId, 'responses', responseId);
  const now = new Date().toISOString();

  try {
    await executeTransactionWithRetry(async (tx) => {
      const ideaSnap = await tx.get(ideaRef);
      const respSnap = await tx.get(responseRef);
      if (!respSnap.exists()) return;

      const respData = respSnap.data();
      tx.delete(responseRef);
      if (ideaSnap.exists()) {
        const data = ideaSnap.data() as Idea;
        const isSimilar = respData?.type === 'similar-check';
        tx.update(ideaRef, {
          responseCount: Math.max(0, (data.responseCount || 1) - 1),
          ...(isSimilar
            ? { communityCheckSimilar: Math.max(0, (data.communityCheckSimilar || 1) - 1) }
            : {}),
          updatedAt: now,
        });
      }
    });

    if (auth.currentUser) {
      await writeAuditLog({
        actorId: auth.currentUser.uid,
        actorName: auth.currentUser.displayName || 'Maker',
        action: 'content.delete_response',
        targetType: 'response',
        targetId: responseId,
        summary: `Deleted response ${responseId} on idea ${ideaId}`,
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `ideas/${ideaId}/responses/${responseId}`);
  }
}

/**
 * Adds a volunteer offer and atomically increments `volunteerCount` by 1.
 * Prevents duplicate offers or owners volunteering on their own idea.
 */
export async function volunteerForIdeaWithTransaction(params: {
  ideaId: string;
  ideaTitle: string;
  ideaAuthorId: string;
  role: string;
  message: string;
  user: UserProfile;
}): Promise<void> {
  assertOnlineForMutation('submit a volunteer offer');
  if (params.user.suspended || params.user.accountStatus === 'disabled') {
    throw new Error('Your account is currently suspended by an administrator and cannot submit volunteer offers.');
  }

  if (params.ideaAuthorId === params.user.uid) {
    throw new Error('You are the creator of this specification and cannot volunteer on your own idea.');
  }

  const ideaRef = doc(db, 'ideas', params.ideaId);
  const volunteerRef = doc(db, 'ideas', params.ideaId, 'volunteers', params.user.uid);
  const now = new Date().toISOString();
  const cleanRole = sanitizeText(params.role, 200);
  const cleanMessage = sanitizeText(params.message, 2000);

  try {
    await executeTransactionWithRetry(async (tx) => {
      const ideaSnap = await tx.get(ideaRef);
      const volSnap = await tx.get(volunteerRef);
      if (!ideaSnap.exists()) throw new Error('Idea not found');
      if (volSnap.exists()) throw new Error('Already volunteered for this idea');

      const data = ideaSnap.data() as Idea;
      if (data.status === 'built') {
        throw new Error('This idea is already marked as Built and is no longer accepting new pending volunteers.');
      }

      tx.set(volunteerRef, {
        ideaId: params.ideaId,
        ideaTitle: sanitizeText(params.ideaTitle, 150),
        userId: params.user.uid,
        userName: sanitizeText(params.user.displayName, 100),
        userUsername: sanitizeText(params.user.username, 60),
        role: cleanRole,
        message: cleanMessage,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      });

      tx.update(ideaRef, {
        volunteerCount: (data.volunteerCount || 0) + 1,
        updatedAt: now,
      });
    });

    await sendDeduplicatedNotification({
      recipientId: params.ideaAuthorId,
      type: 'volunteer',
      targetId: params.ideaId,
      title: `${sanitizeText(params.user.displayName, 60)} offered to help on "${sanitizeText(params.ideaTitle, 70)}"`,
      message: `${cleanRole}: ${cleanMessage.slice(0, 160)}`,
      link: `/ideas/${params.ideaId}/volunteers`,
      actorId: params.user.uid,
      actorName: params.user.displayName,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('creator') ||
        error.message.includes('Built') ||
        error.message.includes('Already volunteered'))
    ) {
      throw error;
    }
    handleFirestoreError(
      error,
      OperationType.WRITE,
      `ideas/${params.ideaId}/volunteers/${params.user.uid}`
    );
  }
}

/**
 * Withdraws a user's volunteer offer and atomically decrements `volunteerCount` by 1.
 */
export async function withdrawVolunteerWithTransaction(
  ideaId: string,
  userId: string
): Promise<void> {
  assertOnlineForMutation('withdraw your volunteer offer');
  const ideaRef = doc(db, 'ideas', ideaId);
  const volunteerRef = doc(db, 'ideas', ideaId, 'volunteers', userId);
  const now = new Date().toISOString();

  try {
    await executeTransactionWithRetry(async (tx) => {
      const ideaSnap = await tx.get(ideaRef);
      const volSnap = await tx.get(volunteerRef);
      if (!volSnap.exists()) return;

      tx.delete(volunteerRef);
      if (ideaSnap.exists()) {
        const data = ideaSnap.data() as Idea;
        tx.update(ideaRef, {
          volunteerCount: Math.max(0, (data.volunteerCount || 1) - 1),
          updatedAt: now,
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `ideas/${ideaId}/volunteers/${userId}`);
  }
}

/**
 * Idea owner accepts or declines a volunteer offer.
 */
export async function updateVolunteerStatusByOwner(params: {
  ideaId: string;
  ideaTitle: string;
  volunteerUserId: string;
  status: VolunteerStatus;
  owner: UserProfile;
}): Promise<void> {
  assertOnlineForMutation('update volunteer status');
  const path = `ideas/${params.ideaId}/volunteers/${params.volunteerUserId}`;
  const ref = doc(db, 'ideas', params.ideaId, 'volunteers', params.volunteerUserId);
  const now = new Date().toISOString();
  try {
    const ideaSnap = await getDoc(doc(db, 'ideas', params.ideaId));
    if (ideaSnap.exists()) {
      const ideaData = ideaSnap.data() as Idea;
      if (ideaData.status === 'built' && params.status === 'accepted') {
        throw new Error('Cannot accept new volunteers after the idea has already been marked Built.');
      }
    }

    await updateDoc(ref, {
      status: params.status,
      updatedAt: now,
    });

    await writeAuditLog({
      actorId: params.owner.uid,
      actorName: params.owner.displayName,
      action: 'volunteer.status_change',
      targetType: 'volunteer',
      targetId: `${params.ideaId}:${params.volunteerUserId}`,
      summary: `Marked volunteer ${params.volunteerUserId} as ${params.status} on "${params.ideaTitle}"`,
    });

    await sendDeduplicatedNotification({
      recipientId: params.volunteerUserId,
      type: 'status-change',
      targetId: params.ideaId,
      title: `Volunteer offer ${params.status} for "${sanitizeText(params.ideaTitle, 80)}"`,
      message: `@${params.owner.username} marked your volunteer offer as ${params.status}.`,
      link: `/ideas/${params.ideaId}/volunteers`,
      actorId: params.owner.uid,
      actorName: params.owner.displayName,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Built')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Connects two ideas using a deterministic normalized pair key (`${minId}__${maxId}`)
 * so A -> B and B -> A resolve to the same logical connection and cannot duplicate.
 */
export async function connectIdeasWithTransaction(params: {
  ideaA: Idea;
  ideaB: Idea;
  reason: string;
  actor: UserProfile;
}): Promise<string> {
  assertOnlineForMutation('connect ideas');
  if (params.actor.suspended || params.actor.accountStatus === 'disabled') {
    throw new Error('Your account is currently suspended by an administrator and cannot create connections.');
  }
  if (params.ideaA.id === params.ideaB.id) {
    throw new Error('Cannot connect an idea to itself.');
  }

  const pairKey = getNormalizedConnectionId(params.ideaA.id, params.ideaB.id);
  const ideaARef = doc(db, 'ideas', params.ideaA.id);
  const ideaBRef = doc(db, 'ideas', params.ideaB.id);
  const connRef = doc(db, 'connections', pairKey);
  const now = new Date().toISOString();
  const cleanReason = sanitizeText(params.reason, 1000);

  try {
    await executeTransactionWithRetry(async (tx) => {
      const [snapA, snapB, existingConnSnap] = await Promise.all([
        tx.get(ideaARef),
        tx.get(ideaBRef),
        tx.get(connRef),
      ]);
      if (!snapA.exists() || !snapB.exists()) {
        throw new Error('One of the ideas no longer exists.');
      }
      if (existingConnSnap.exists()) {
        throw new Error('These two ideas are already connected in the Constellation graph.');
      }

      const dataA = snapA.data() as Idea;
      const dataB = snapB.data() as Idea;

      tx.set(connRef, {
        pairKey,
        ideaA: params.ideaA.id,
        ideaATitle: sanitizeText(params.ideaA.title, 150),
        ideaAAuthorId: params.ideaA.authorId,
        ideaAAuthorName: sanitizeText(params.ideaA.authorName, 100),
        ideaB: params.ideaB.id,
        ideaBTitle: sanitizeText(params.ideaB.title, 150),
        ideaBAuthorId: params.ideaB.authorId,
        ideaBAuthorName: sanitizeText(params.ideaB.authorName, 100),
        reason: cleanReason,
        createdBy: params.actor.uid,
        createdByName: sanitizeText(params.actor.displayName, 100),
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });

      tx.update(ideaARef, {
        connectionCount: (dataA.connectionCount || 0) + 1,
        updatedAt: now,
      });

      tx.update(ideaBRef, {
        connectionCount: (dataB.connectionCount || 0) + 1,
        updatedAt: now,
      });
    });

    await sendDeduplicatedNotification({
      recipientId: params.ideaA.authorId,
      type: 'connection',
      targetId: pairKey,
      title: `Your idea was linked to "${sanitizeText(params.ideaB.title, 70)}"`,
      message: cleanReason.slice(0, 200),
      link: `/ideas/${params.ideaA.id}/connections`,
      actorId: params.actor.uid,
      actorName: params.actor.displayName,
    });

    if (params.ideaB.authorId !== params.ideaA.authorId) {
      await sendDeduplicatedNotification({
        recipientId: params.ideaB.authorId,
        type: 'connection',
        targetId: pairKey,
        title: `Your idea was linked to "${sanitizeText(params.ideaA.title, 70)}"`,
        message: cleanReason.slice(0, 200),
        link: `/ideas/${params.ideaB.id}/connections`,
        actorId: params.actor.uid,
        actorName: params.actor.displayName,
      });
    }

    await writeAuditLog({
      actorId: params.actor.uid,
      actorName: params.actor.displayName,
      action: 'connection.create',
      targetType: 'connection',
      targetId: connRef.id,
      summary: `Created active connection "${sanitizeText(params.ideaA.title, 70)} ↔ ${sanitizeText(params.ideaB.title, 70)}" — Status: active`,
    });

    return connRef.id;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('already connected') ||
        error.message.includes('itself') ||
        error.message.includes('no longer exists'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `connections/${pairKey}`);
  }
}

/**
 * Community check: increments `communityCheckNew` ("Looks new") via transaction.
 */
export async function markIdeaLooksNewWithTransaction(ideaId: string): Promise<void> {
  assertOnlineForMutation('record community check');
  const ideaRef = doc(db, 'ideas', ideaId);
  const now = new Date().toISOString();
  try {
    await executeTransactionWithRetry(async (tx) => {
      const snap = await tx.get(ideaRef);
      if (!snap.exists()) return;
      const data = snap.data() as Idea;
      tx.update(ideaRef, {
        communityCheckNew: (data.communityCheckNew || 0) + 1,
        updatedAt: now,
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `ideas/${ideaId}`);
  }
}

/**
 * Submits a moderation report to the `reports` collection using a deterministic ID
 * per `(targetType, targetId, reporterId)` to prevent duplicate report spam.
 */
export async function submitReport(params: {
  targetType: 'idea' | 'response' | 'user';
  targetId: string;
  targetTitle: string;
  category?: ReportCategory;
  reason: string;
  reporter: UserProfile;
}): Promise<void> {
  assertOnlineForMutation('submit a report');
  const safeTarget = params.targetId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  const deterministicReportId = `report_${params.targetType}_${safeTarget}_${params.reporter.uid.slice(0, 28)}`;
  const reportRef = doc(db, 'reports', deterministicReportId);
  const now = new Date().toISOString();
  try {
    await setDoc(reportRef, {
      targetType: params.targetType,
      targetId: sanitizeText(params.targetId, 128),
      targetTitle: sanitizeText(params.targetTitle, 200),
      category: params.category || 'other',
      reason: sanitizeText(params.reason, 1000),
      reporterId: params.reporter.uid,
      reporterName: sanitizeText(params.reporter.displayName, 100),
      status: 'open',
      createdAt: now,
    });
  } catch (error) {
    recordClientError('moderation', 'submitReport', error, `reports/${deterministicReportId}`);
    handleFirestoreError(error, OperationType.CREATE, `reports/${deterministicReportId}`);
  }
}

/**
 * Admin action to resolve or dismiss a report with moderator metadata and immutable audit logging.
 */
export async function resolveOrDismissReportByAdmin(params: {
  reportId: string;
  targetType: 'idea' | 'response' | 'user';
  targetId: string;
  status: 'resolved' | 'dismissed' | 'open';
  moderator: UserProfile;
  moderatorAction?: string;
  resolutionNote?: string;
}): Promise<void> {
  assertOnlineForMutation('moderate report');
  const now = new Date().toISOString();
  const path = `reports/${params.reportId}`;
  try {
    await updateDoc(doc(db, 'reports', params.reportId), {
      status: params.status,
      moderatorId: params.moderator.uid,
      moderatorName: sanitizeText(params.moderator.displayName, 100),
      moderatorAction: sanitizeText(params.moderatorAction || `Marked ${params.status}`, 200),
      resolutionNote: sanitizeText(params.resolutionNote || '', 1000),
      resolvedAt: now,
    });

    await writeAuditLog({
      actorId: params.moderator.uid,
      actorName: params.moderator.displayName,
      action: params.status === 'dismissed' ? 'report.dismiss' : 'report.resolve',
      targetType: 'report',
      targetId: params.reportId,
      summary: `${params.moderatorAction || `Marked report as ${params.status}`} (target ${params.targetType}:${params.targetId})${params.resolutionNote ? ` — Note: ${params.resolutionNote}` : ''}`,
    });
  } catch (error) {
    recordClientError('moderation', 'resolveOrDismissReportByAdmin', error, path);
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateIdeaStatusByOwner(
  ideaId: string,
  status: IdeaStatus,
  isAdmin = false
): Promise<void> {
  await updateIdeaDetails(ideaId, { status }, { isAdmin });
}

/**
 * Admin-only toggle to grant or revoke the 'Admin Verified' status on an idea specification.
 * Writes an immutable entry to `auditLogs`.
 */
export async function toggleIdeaAdminVerified(params: {
  idea: Idea;
  verified: boolean;
  admin: UserProfile;
}): Promise<void> {
  assertOnlineForMutation('toggle Admin Verified status');
  const path = `ideas/${params.idea.id}`;
  const now = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'ideas', params.idea.id), {
      adminVerified: params.verified,
      adminVerifiedAt: params.verified ? now : null,
      adminVerifiedBy: params.verified ? params.admin.uid : null,
      updatedAt: now,
    });

    await writeAuditLog({
      actorId: params.admin.uid,
      actorName: params.admin.displayName,
      action: 'idea.verify_change',
      targetType: 'idea',
      targetId: params.idea.id,
      summary: `${params.verified ? 'Granted' : 'Revoked'} Admin Verified badge on specification "${params.idea.title}" (${params.idea.id})`,
    });
  } catch (error) {
    recordClientError('moderation', 'toggleIdeaAdminVerified', error, path);
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Admin-only toggle to suspend or unsuspend a registered user account.
 * Writes an immutable entry to `auditLogs`.
 */
export async function toggleUserSuspensionByAdmin(params: {
  targetUser: UserProfile;
  suspended: boolean;
  admin: UserProfile;
  reason?: string;
}): Promise<void> {
  assertOnlineForMutation('toggle user suspension');
  if (params.targetUser.uid === params.admin.uid) {
    throw new Error('You cannot suspend your own active administrator account.');
  }
  const path = `users/${params.targetUser.uid}`;
  const now = new Date().toISOString();
  const cleanReason = params.reason ? sanitizeText(params.reason, 400) : '';
  try {
    await updateDoc(doc(db, 'users', params.targetUser.uid), {
      suspended: params.suspended,
      accountStatus: params.suspended ? 'disabled' : 'active',
      suspendedAt: params.suspended ? now : null,
      suspendedReason: params.suspended
        ? cleanReason || 'Suspended by platform administrator'
        : null,
      updatedAt: now,
    });

    await writeAuditLog({
      actorId: params.admin.uid,
      actorName: params.admin.displayName,
      action: 'account.suspend_change',
      targetType: 'user',
      targetId: params.targetUser.uid,
      summary: `${params.suspended ? 'Suspended' : 'Reinstated'} maker account @${params.targetUser.username} (UID: ${params.targetUser.uid})${cleanReason ? ` — Reason: ${cleanReason}` : ''}`,
    });
  } catch (error) {
    recordClientError('moderation', 'toggleUserSuspensionByAdmin', error, path);
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Saves an idea bookmark to `users/{uid}/bookmarks/{ideaId}`.
 */
export async function saveBookmark(
  uid: string,
  idea: Idea,
  note?: string
): Promise<void> {
  assertOnlineForMutation('bookmark this idea');
  const path = `users/${uid}/bookmarks/${idea.id}`;
  const ref = doc(db, 'users', uid, 'bookmarks', idea.id);
  const now = new Date().toISOString();
  try {
    const cleanNote = note ? sanitizeText(note, 500) : '';
    await setDoc(ref, {
      userId: uid,
      ideaId: idea.id,
      ideaTitle: sanitizeText(idea.title, 150),
      ideaSummary: sanitizeText(idea.summary, 400),
      ideaCategory: idea.category,
      ideaHelpTrack: idea.helpTrack,
      ...(cleanNote ? { note: cleanNote } : {}),
      createdAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Removes a saved idea bookmark from `users/{uid}/bookmarks/{ideaId}`.
 */
export async function removeBookmark(uid: string, ideaId: string): Promise<void> {
  assertOnlineForMutation('remove bookmark');
  const path = `users/${uid}/bookmarks/${ideaId}`;
  const ref = doc(db, 'users', uid, 'bookmarks', ideaId);
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Updates the personal quick-access note on an existing bookmark.
 */
export async function updateBookmarkNote(
  uid: string,
  ideaId: string,
  note: string
): Promise<void> {
  assertOnlineForMutation('save bookmark note');
  const path = `users/${uid}/bookmarks/${ideaId}`;
  const ref = doc(db, 'users', uid, 'bookmarks', ideaId);
  try {
    const cleanNote = sanitizeText(note, 500);
    await updateDoc(ref, {
      note: cleanNote,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Verifies whether the currently signed-in user is authorized to manage (decline, activate, or remove)
 * a connection: ONLY Admin or the people connected with each other (connection creator, ideaA owner, ideaB owner).
 */
export async function assertCanManageConnection(conn: IdeaConnection): Promise<{
  uid: string;
  actorName: string;
  isAdmin: boolean;
}> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to manage a connection.');
  }
  const uid = currentUser.uid;
  const actorName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Maker';
  const adminFlag = await checkIsAdmin(uid);

  if (adminFlag || conn.createdBy === uid || conn.ideaAAuthorId === uid || conn.ideaBAuthorId === uid) {
    return { uid, actorName, isAdmin: adminFlag };
  }

  // Fallback check against idea documents if legacy connection did not store ideaAAuthorId / ideaBAuthorId
  const [snapA, snapB] = await Promise.all([
    getDoc(doc(db, 'ideas', conn.ideaA)),
    getDoc(doc(db, 'ideas', conn.ideaB)),
  ]);
  const authorA = snapA.exists() ? (snapA.data() as Idea).authorId : null;
  const authorB = snapB.exists() ? (snapB.data() as Idea).authorId : null;

  if (authorA === uid || authorB === uid) {
    return { uid, actorName, isAdmin: adminFlag };
  }

  throw new Error(
    'Permission denied: Only an Admin or the makers connected in this link can decline or remove it.'
  );
}

/**
 * Deletes a connection and atomically decrements `connectionCount` on both linked ideas.
 * Strictly restricted to Admin and the people connected with each other.
 */
export async function deleteConnectionWithTransaction(
  conn: IdeaConnection
): Promise<void> {
  assertOnlineForMutation('remove connection');
  const actor = await assertCanManageConnection(conn);
  const connRef = doc(db, 'connections', conn.id);
  const ideaARef = doc(db, 'ideas', conn.ideaA);
  const ideaBRef = doc(db, 'ideas', conn.ideaB);
  const now = new Date().toISOString();

  try {
    await executeTransactionWithRetry(async (tx) => {
      const connSnap = await tx.get(connRef);
      if (!connSnap.exists()) return;
      const snapA = await tx.get(ideaARef);
      const snapB = await tx.get(ideaBRef);

      tx.delete(connRef);

      if (snapA.exists()) {
        const dataA = snapA.data() as Idea;
        tx.update(ideaARef, {
          connectionCount: Math.max(0, (dataA.connectionCount || 1) - 1),
          updatedAt: now,
        });
      }
      if (snapB.exists()) {
        const dataB = snapB.data() as Idea;
        tx.update(ideaBRef, {
          connectionCount: Math.max(0, (dataB.connectionCount || 1) - 1),
          updatedAt: now,
        });
      }
    });

    await writeAuditLog({
      actorId: actor.uid,
      actorName: actor.actorName,
      action: 'connection.delete',
      targetType: 'connection',
      targetId: conn.id,
      summary: `${actor.isAdmin ? '[Admin]' : '[Connected Maker]'} Removed connection between "${conn.ideaATitle}" and "${conn.ideaBTitle}"`,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Permission denied')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.DELETE, `connections/${conn.id}`);
  }
}

/**
 * Updates the status of a connection (active, pending, declined) by an authorized user
 * (Admin or the people connected with each other).
 */
export async function updateConnectionStatus(
  connectionId: string,
  status: 'active' | 'pending' | 'declined'
): Promise<void> {
  assertOnlineForMutation('update connection status');
  const path = `connections/${connectionId}`;
  const connRef = doc(db, 'connections', connectionId);
  try {
    const snap = await getDoc(connRef);
    if (!snap.exists()) {
      throw new Error('Connection no longer exists.');
    }
    const connData: IdeaConnection = {
      id: snap.id,
      ...(snap.data() as Omit<IdeaConnection, 'id'>),
    };
    const actor = await assertCanManageConnection(connData);
    const now = new Date().toISOString();

    await updateDoc(connRef, { status, updatedAt: now });

    await writeAuditLog({
      actorId: actor.uid,
      actorName: actor.actorName,
      action: 'connection.status_change',
      targetType: 'connection',
      targetId: connectionId,
      summary: `${actor.isAdmin ? '[Admin]' : '[Connected Maker]'} Changed connection "${connData.ideaATitle} ↔ ${connData.ideaBTitle}" status to ${status}`,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Permission denied')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Deletes a user notification.
 */
export async function deleteNotification(
  uid: string,
  notificationId: string
): Promise<void> {
  assertOnlineForMutation('delete notification');
  const path = `users/${uid}/notifications/${notificationId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'notifications', notificationId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export const SOLE_ADMIN_EMAIL = 'cardboardboxmask@gmail.com';
export const SOLE_ADMIN_UID = 'kETq37KlCWR7k3MqSCa14zszoA22';

export function isSoleAdminUser(user: User | null | undefined, uid?: string): boolean {
  const targetUid = uid || user?.uid;
  if (!user || !targetUid) return false;
  if (user.uid !== targetUid) return false;
  const emailMatch =
    user.email?.toLowerCase() === SOLE_ADMIN_EMAIL &&
    user.emailVerified !== false;
  const uidMatch = user.uid === SOLE_ADMIN_UID;
  return emailMatch || uidMatch;
}

export async function checkIsAdmin(uid: string): Promise<boolean> {
  const currentUser = auth.currentUser;
  if (!isSoleAdminUser(currentUser, uid)) {
    return false;
  }
  try {
    const adminRef = doc(db, 'admins', uid);
    const snap = await getDoc(adminRef);
    if (!snap.exists()) {
      await setDoc(adminRef, {
        role: 'sole-owner-admin',
        email: currentUser?.email || SOLE_ADMIN_EMAIL,
        createdAt: new Date().toISOString(),
      });
    }
  } catch {
    // Ignore transient network errors; sole admin identity is already verified
  }
  return true;
}

export const signInWithGoogle = loginWithGoogle;
export const signOutUser = logoutUser;

export async function isUsernameAvailable(
  username: string,
  currentUid?: string
): Promise<boolean> {
  const validation = validateUsername(username);
  if (!validation.valid) return false;
  try {
    const snap = await getDoc(doc(db, 'usernames', validation.normalized));
    if (!snap.exists()) return true;
    return Boolean(currentUid && snap.data()?.uid === currentUid);
  } catch {
    return false;
  }
}

export async function changeUsernameWithTransaction(params: {
  uid: string;
  currentUsername: string;
  newUsername: string;
  actorName: string;
}): Promise<string> {
  const validation = validateUsername(params.newUsername);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid username.');
  }
  await updateUserProfile(params.uid, {
    displayName: params.actorName,
    username: validation.normalized,
  });
  return validation.normalized;
}

export async function deleteUserAccountLifecycle(params: {
  uid: string;
  profile: UserProfile;
  deleteAuthoredIdeasWithoutEngagement?: boolean;
}): Promise<void> {
  await deleteMyAccountAndCleanup(params.uid, params.profile);
}

export async function deleteIdeaByOwnerOrAdmin(
  ideaId: string,
  _actor?: { uid: string; displayName: string; isAdmin?: boolean }
): Promise<void> {
  await deleteIdea(ideaId);
}

export function subscribeToAuditLogs(
  callback: (logs: AuditLogEntry[]) => void,
  maxCount = 150
): () => void {
  const q = query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(maxCount));
  return onSnapshot(
    q,
    (snap) => {
      const list: AuditLogEntry[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<AuditLogEntry, 'id'>) });
      });
      callback(list);
    },
    () => callback([])
  );
}

export function subscribeToIdeaRevisions(
  ideaId: string,
  callback: (revisions: IdeaRevision[]) => void
): () => void {
  const q = query(
    collection(db, 'ideas', ideaId, 'revisions'),
    orderBy('createdAt', 'desc'),
    limit(50)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: IdeaRevision[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as Omit<IdeaRevision, 'id'>) });
      });
      callback(list);
    },
    () => callback([])
  );
}

export function subscribeToPublicUsers(
  callback: (users: UserProfile[]) => void,
  maxCount = 150
): () => void {
  const q = query(collection(db, 'users'), limit(maxCount));
  return onSnapshot(
    q,
    (snap) => {
      const list: UserProfile[] = [];
      snap.forEach((d) => {
        const data = d.data() as UserProfile;
        if (!data.deleted) {
          list.push({
            ...data,
            uid: data.uid || d.id,
          });
        }
      });
      callback(list);
    },
    () => callback([])
  );
}

/**
 * Inspects the Firebase Auth providerData for the current user so the UI only
 * presents authentic re-authentication methods configured for the account.
 */
export function getAdminAuthProviders(user: User | null | undefined): {
  hasGoogle: boolean;
  hasPassword: boolean;
  providerIds: string[];
} {
  if (!user || !Array.isArray(user.providerData)) {
    return { hasGoogle: false, hasPassword: false, providerIds: [] };
  }
  const providerIds = user.providerData
    .map((p) => p?.providerId)
    .filter((id): id is string => Boolean(id));
  return {
    hasGoogle: providerIds.includes('google.com') || providerIds.length === 0,
    hasPassword: providerIds.includes('password'),
    providerIds,
  };
}

/**
 * Records a sanitized admin security event in `/auditLogs`.
 * Never stores passwords, biometric templates, WebAuthn keys, or raw tokens.
 */
export async function logAdminSecurityAuditEvent(params: {
  action:
    | 'admin.reauth.success'
    | 'admin.reauth.failure'
    | 'admin.webauthn.success'
    | 'admin.webauthn.failure'
    | 'admin.panel.lock'
    | 'admin.panel.timeout'
    | 'admin.panel.access_denied';
  summary: string;
  actorId?: string;
  actorName?: string;
  targetId?: string;
}): Promise<void> {
  const currentUser = auth.currentUser;
  const actorId = params.actorId || currentUser?.uid;
  if (!actorId) return;
  const actorName = sanitizeText(
    params.actorName || currentUser?.displayName || currentUser?.email?.split('@')[0] || 'User',
    80
  );
  await writeAuditLog({
    actorId,
    actorName,
    action: params.action,
    targetType: 'admin',
    targetId: sanitizeText(params.targetId || 'admin-panel', 120),
    summary: sanitizeText(params.summary, 500),
  });
}

/**
 * Performs fresh Firebase Google re-authentication (`reauthenticateWithPopup`)
 * for the sole administrator and force-refreshes the Firebase ID token.
 */
export async function reauthenticateAdminWithGoogle(): Promise<{
  idToken: string;
  reauthenticatedAt: number;
}> {
  assertOnlineForMutation('re-authenticate administrator account');
  const currentUser = auth.currentUser;
  if (!currentUser || !isSoleAdminUser(currentUser)) {
    await logAdminSecurityAuditEvent({
      action: 'admin.reauth.failure',
      summary: 'Rejected re-authentication attempt: caller is not the authorized sole administrator.',
    });
    throw new Error('This account is not authorized to access the Admin Panel.');
  }

  try {
    const freshGoogleProvider = new GoogleAuthProvider();
    freshGoogleProvider.setCustomParameters({
      prompt: 'select_account',
      login_hint: currentUser.email || SOLE_ADMIN_EMAIL,
    });
    const result = await reauthenticateWithPopup(currentUser, freshGoogleProvider);
    if (!isSoleAdminUser(result.user)) {
      await logAdminSecurityAuditEvent({
        action: 'admin.reauth.failure',
        summary: 'Google re-authentication returned a non-administrator identity.',
      });
      throw new Error('Verification failed. Please authenticate again.');
    }
    const idToken = await result.user.getIdToken(true);
    const reauthenticatedAt = Date.now();
    await logAdminSecurityAuditEvent({
      action: 'admin.reauth.success',
      summary: 'Administrator completed fresh Google account re-authentication (Step 1).',
    });
    return { idToken, reauthenticatedAt };
  } catch (err) {
    await logAdminSecurityAuditEvent({
      action: 'admin.reauth.failure',
      summary: 'Administrator Google re-authentication failed or was cancelled.',
    });
    if (err instanceof Error && err.message.includes('not authorized')) {
      throw err;
    }
    throw new Error('Verification failed. Please authenticate again.');
  }
}

/**
 * Performs fresh Firebase password re-authentication (`reauthenticateWithCredential`)
 * ONLY when the sole administrator account has a linked Firebase password provider.
 * Never stores or logs the password.
 */
export async function reauthenticateAdminWithPassword(passwordInput: string): Promise<{
  idToken: string;
  reauthenticatedAt: number;
}> {
  assertOnlineForMutation('re-authenticate administrator account');
  const currentUser = auth.currentUser;
  if (!currentUser || !isSoleAdminUser(currentUser) || !currentUser.email) {
    await logAdminSecurityAuditEvent({
      action: 'admin.reauth.failure',
      summary: 'Rejected password re-authentication: caller is not the authorized sole administrator.',
    });
    throw new Error('This account is not authorized to access the Admin Panel.');
  }

  const providers = getAdminAuthProviders(currentUser);
  if (!providers.hasPassword) {
    throw new Error('Password authentication is not configured for this Google-authenticated account.');
  }

  try {
    const credential = EmailAuthProvider.credential(currentUser.email, passwordInput);
    const result = await reauthenticateWithCredential(currentUser, credential);
    const idToken = await result.user.getIdToken(true);
    const reauthenticatedAt = Date.now();
    await logAdminSecurityAuditEvent({
      action: 'admin.reauth.success',
      summary: 'Administrator completed fresh password credential re-authentication (Step 1).',
    });
    return { idToken, reauthenticatedAt };
  } catch {
    await logAdminSecurityAuditEvent({
      action: 'admin.reauth.failure',
      summary: 'Administrator password re-authentication failed.',
    });
    throw new Error('Verification failed. Please authenticate again.');
  }
}

/**
 * Seeds 12 realistic ideas into Firestore if fewer than 12 ideas exist,
 * ensuring variety across categories, tracks, and tags.
 */
export async function seedInitialIdeasIfNeeded(): Promise<void> {
  try {
    const ideasRef = collection(db, 'ideas');
    const snapshot = await getDocs(ideasRef);
    if (snapshot.size >= 12) {
      return;
    }

    const now = Date.now();
    const seedIdeas = [
      {
        title: 'Bus arrival tracker for small-town routes',
        summary: 'Students in tier-2 cities wait at stops with no idea when the bus will arrive, because big transit apps don’t cover local buses.',
        problem: 'Students in tier-2 cities wait at stops with no idea when the bus will arrive, because big transit apps don’t cover local buses.',
        solution: 'A crowd-sourced web app where daily commuters tap "bus spotted here" to share live GPS coordinates and arrival estimates for local bus routes.',
        helpWanted: 'A builder for a simple crowd-sourced “bus spotted here” web app and real-time map feed.',
        helpTrack: 'builder' as const,
        category: 'Web' as const,
        license: 'cc-by' as const,
        tags: ['transport', 'students', 'crowdsourced'],
        authorId: SOLE_ADMIN_UID,
        authorUid: SOLE_ADMIN_UID,
        authorUsername: 'admin',
        authorName: 'Admin',
        authorDisplayName: 'Admin',
        adminVerified: true,
        volunteerCount: 0,
        connectionCount: 0,
        responseCount: 0,
        status: 'open' as const,
        createdAt: new Date(now - 4 * 86400000).toISOString(),
        updatedAt: new Date(now - 4 * 86400000).toISOString(),
      },
      {
        title: 'Exam timetable and syllabus tracker for college students',
        summary: 'Students juggle unit-wise syllabus, internals, and arrears subjects across scattered notes and WhatsApp groups.',
        problem: 'Students juggle unit-wise syllabus, internals, and arrears subjects across scattered notes and WhatsApp groups.',
        solution: 'A centralized dashboard for college students to track unit-wise syllabus completion, upcoming internals, and exam schedules.',
        helpWanted: 'Feedback on what a student would actually use daily, and a builder for the first version.',
        helpTrack: 'guidance' as const,
        category: 'Web' as const,
        license: 'mit' as const,
        tags: ['education', 'students', 'productivity'],
        authorId: SOLE_ADMIN_UID,
        authorUid: SOLE_ADMIN_UID,
        authorUsername: 'admin',
        authorName: 'Admin',
        authorDisplayName: 'Admin',
        adminVerified: true,
        volunteerCount: 0,
        connectionCount: 0,
        responseCount: 0,
        status: 'in-progress' as const,
        createdAt: new Date(now - 3.5 * 86400000).toISOString(),
        updatedAt: new Date(now - 3.5 * 86400000).toISOString(),
      },
      {
        title: 'Offline-first note sharing for areas with poor internet',
        summary: 'Students in low-connectivity areas can’t reliably download study material shared online.',
        problem: 'Students in low-connectivity areas can’t reliably download study material shared online.',
        solution: 'A progressive web app (PWA) with local caching and peer-to-peer sync over Wi-Fi direct or Bluetooth mesh for sharing study notes.',
        helpWanted: 'Guidance on how to make a web app work offline (PWA caching, service workers, sync).',
        helpTrack: 'guidance' as const,
        category: 'Software' as const,
        license: 'mit' as const,
        tags: ['offline', 'pwa', 'education'],
        authorId: SOLE_ADMIN_UID,
        authorUid: SOLE_ADMIN_UID,
        authorUsername: 'admin',
        authorName: 'Admin',
        authorDisplayName: 'Admin',
        adminVerified: true,
        volunteerCount: 0,
        connectionCount: 0,
        responseCount: 0,
        status: 'open' as const,
        createdAt: new Date(now - 3 * 86400000).toISOString(),
        updatedAt: new Date(now - 3 * 86400000).toISOString(),
      },
      {
        title: 'Low-cost soil moisture alert for small farmers',
        summary: 'Small farmers overwater or underwater crops because they can’t measure soil moisture cheaply.',
        problem: 'Small farmers overwater or underwater crops because they can’t measure soil moisture cheaply.',
        solution: 'An Arduino/ESP32 based soil moisture sensor probe connected to a solar-powered GSM module that sends SMS alerts when irrigation is needed.',
        helpWanted: 'A hardware builder (sensor + SMS or buzzer alert) and an advisor with farming experience.',
        helpTrack: 'builder' as const,
        category: 'Hardware' as const,
        license: 'cc-by' as const,
        tags: ['agriculture', 'sensors', 'lowcost'],
        authorId: SOLE_ADMIN_UID,
        authorUid: SOLE_ADMIN_UID,
        authorUsername: 'admin',
        authorName: 'Admin',
        authorDisplayName: 'Admin',
        adminVerified: true,
        volunteerCount: 0,
        connectionCount: 0,
        responseCount: 0,
        status: 'in-progress' as const,
        createdAt: new Date(now - 2.5 * 86400000).toISOString(),
        updatedAt: new Date(now - 2.5 * 86400000).toISOString(),
      },
      {
        title: 'Local volunteer matching for blood donation',
        summary: 'In emergencies, families spend hours phoning around to find a matching blood donor nearby.',
        problem: 'In emergencies, families spend hours phoning around to find a matching blood donor nearby.',
        solution: 'A privacy-first emergency blood donor directory that matches blood group and location securely without exposing phone numbers publicly.',
        helpWanted: 'Advice on privacy and verification, plus a builder for a simple donor registry.',
        helpTrack: 'guidance' as const,
        category: 'Web' as const,
        license: 'all-rights-kept' as const,
        tags: ['health', 'community', 'emergency'],
        authorId: SOLE_ADMIN_UID,
        authorUid: SOLE_ADMIN_UID,
        authorUsername: 'admin',
        authorName: 'Admin',
        authorDisplayName: 'Admin',
        adminVerified: true,
        volunteerCount: 0,
        connectionCount: 0,
        responseCount: 0,
        status: 'open' as const,
        createdAt: new Date(now - 2 * 86400000).toISOString(),
        updatedAt: new Date(now - 2 * 86400000).toISOString(),
      },
      {
        title: 'Plain-language summary tool for government forms and notices',
        summary: 'Many people can’t understand official notices, scheme forms, or legal letters, and don’t know what to do next.',
        problem: 'Many people can’t understand official notices, scheme forms, or legal letters, and don’t know what to do next.',
        solution: 'An AI-powered document simplifier that translates complex government scheme circulars into simple, actionable steps in local languages.',
        helpWanted: 'An AI/NLP builder, and people who can check accuracy in Tamil and English.',
        helpTrack: 'builder' as const,
        category: 'AI' as const,
        license: 'mit' as const,
        tags: ['accessibility', 'language', 'civic'],
        authorId: SOLE_ADMIN_UID,
        authorUid: SOLE_ADMIN_UID,
        authorUsername: 'admin',
        authorName: 'Admin',
        authorDisplayName: 'Admin',
        adminVerified: true,
        volunteerCount: 0,
        connectionCount: 0,
        responseCount: 0,
        status: 'built' as const,
        createdAt: new Date(now - 1.5 * 86400000).toISOString(),
        updatedAt: new Date(now - 1.5 * 86400000).toISOString(),
      },
      {
        title: 'Shared tool library for a neighborhood',
        summary: 'People buy drills, ladders, and other tools they use once, while neighbors own the same things sitting idle.',
        problem: 'People buy drills, ladders, and other tools they use once, while neighbors own the same things sitting idle.',
        solution: 'A hyper-local inventory board where residents list household tools available for lending or borrowing within 1 km.',
        helpWanted: 'A builder for a simple lend/borrow board with item status and ratings.',
        helpTrack: 'builder' as const,
        category: 'Web' as const,
        license: 'cc-by' as const,
        tags: ['sharing', 'community', 'sustainability'],
        authorId: SOLE_ADMIN_UID,
        authorUid: SOLE_ADMIN_UID,
        authorUsername: 'admin',
        authorName: 'Admin',
        authorDisplayName: 'Admin',
        adminVerified: true,
        volunteerCount: 0,
        connectionCount: 0,
        responseCount: 0,
        status: 'open' as const,
        createdAt: new Date(now - 1 * 86400000).toISOString(),
        updatedAt: new Date(now - 1 * 86400000).toISOString(),
      },
      {
        title: 'Study group finder by subject and time',
        summary: 'Students want to study with others on the same subject but only know people in their own class.',
        problem: 'Students want to study with others on the same subject but only know people in their own class.',
        solution: 'A scheduling widget where students input their course codes and free study windows to automatically form virtual or library study pods.',
        helpWanted: 'Feedback on matching logic, and one builder for a prototype.',
        helpTrack: 'guidance' as const,
        category: 'Software' as const,
        license: 'mit' as const,
        tags: ['students', 'collaboration'],
        authorId: SOLE_ADMIN_UID,
        authorUid: SOLE_ADMIN_UID,
        authorUsername: 'admin',
        authorName: 'Admin',
        authorDisplayName: 'Admin',
        adminVerified: true,
        volunteerCount: 0,
        connectionCount: 0,
        responseCount: 0,
        status: 'open' as const,
        createdAt: new Date(now - 0.8 * 86400000).toISOString(),
        updatedAt: new Date(now - 0.8 * 86400000).toISOString(),
      },
      {
        title: 'Low-cost air quality monitor for classrooms',
        summary: 'Schools have no cheap way to measure air quality (CO2, dust), so poor ventilation goes unnoticed.',
        problem: 'Schools have no cheap way to measure air quality (CO2, dust), so poor ventilation goes unnoticed.',
        solution: 'An open-source ESP32 air quality monitor with an e-ink display showing CO2 levels and ventilation reminders for teachers.',
        helpWanted: 'Advice on sensors (NDIR CO2) and calibration from anyone with electronics experience.',
        helpTrack: 'guidance' as const,
        category: 'Hardware' as const,
        license: 'cc-by' as const,
        tags: ['esp32', 'sensors', 'education'],
        authorId: SOLE_ADMIN_UID,
        authorUid: SOLE_ADMIN_UID,
        authorUsername: 'admin',
        authorName: 'Admin',
        authorDisplayName: 'Admin',
        adminVerified: true,
        volunteerCount: 0,
        connectionCount: 0,
        responseCount: 0,
        status: 'in-progress' as const,
        createdAt: new Date(now - 0.6 * 86400000).toISOString(),
        updatedAt: new Date(now - 0.6 * 86400000).toISOString(),
      },
      {
        title: 'Voice-based reminders for elderly family members',
        summary: 'Older people forget medicines and appointments, and smartphone reminders are too fiddly for them.',
        problem: 'Older people forget medicines and appointments, and smartphone reminders are too fiddly for them.',
        solution: 'A simple voice-first reminder interface that speaks reminders aloud in regional languages and confirms completion with a single physical button press.',
        helpWanted: 'A builder for a very simple voice reminder device or app, plus UX advice from anyone who has helped elderly relatives with technology.',
        helpTrack: 'builder' as const,
        category: 'AI' as const,
        license: 'mit' as const,
        tags: ['elderly', 'voice', 'accessibility'],
        authorId: SOLE_ADMIN_UID,
        authorUid: SOLE_ADMIN_UID,
        authorUsername: 'admin',
        authorName: 'Admin',
        authorDisplayName: 'Admin',
        adminVerified: true,
        volunteerCount: 0,
        connectionCount: 0,
        responseCount: 0,
        status: 'open' as const,
        createdAt: new Date(now - 0.4 * 86400000).toISOString(),
        updatedAt: new Date(now - 0.4 * 86400000).toISOString(),
      },
      {
        title: 'Beginner project ideas board for first-year engineering students',
        summary: 'First-years want to build things but don’t know what’s realistic for their skill level.',
        problem: 'First-years want to build things but don’t know what’s realistic for their skill level.',
        solution: 'A curated repository of scoped engineering projects categorized by difficulty, required tools, and estimated completion time.',
        helpWanted: 'Seniors who can suggest scoped projects, and a builder for a small curated list site.',
        helpTrack: 'guidance' as const,
        category: 'Other' as const,
        license: 'mit' as const,
        tags: ['beginners', 'students', 'learning'],
        authorId: SOLE_ADMIN_UID,
        authorUid: SOLE_ADMIN_UID,
        authorUsername: 'admin',
        authorName: 'Admin',
        authorDisplayName: 'Admin',
        adminVerified: true,
        volunteerCount: 0,
        connectionCount: 0,
        responseCount: 0,
        status: 'open' as const,
        createdAt: new Date(now - 0.25 * 86400000).toISOString(),
        updatedAt: new Date(now - 0.25 * 86400000).toISOString(),
      },
      {
        title: 'Receipt and warranty organizer',
        summary: 'People lose bills and warranty cards, then can’t claim repairs when something breaks.',
        problem: 'People lose bills and warranty cards, then can’t claim repairs when something breaks.',
        solution: 'A lightweight mobile-first web app that snaps a photo of purchase receipts, extracts expiry dates with OCR, and sends push reminders before warranties expire.',
        helpWanted: 'A builder for a simple app that stores a photo, purchase date, and warranty reminder.',
        helpTrack: 'builder' as const,
        category: 'Software' as const,
        license: 'cc-by' as const,
        tags: ['utility', 'reminders'],
        authorId: SOLE_ADMIN_UID,
        authorUid: SOLE_ADMIN_UID,
        authorUsername: 'admin',
        authorName: 'Admin',
        authorDisplayName: 'Admin',
        adminVerified: true,
        volunteerCount: 0,
        connectionCount: 0,
        responseCount: 0,
        status: 'open' as const,
        createdAt: new Date(now - 0.1 * 86400000).toISOString(),
        updatedAt: new Date(now - 0.1 * 86400000).toISOString(),
      },
    ];

    for (const item of seedIdeas) {
      const docRef = doc(collection(db, 'ideas'));
      await setDoc(docRef, item);
    }
  } catch (err) {
    console.warn('Seeding ideas error:', err);
  }
}



