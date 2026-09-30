/**
 * Synapse Admin Security Configuration & In-Memory Session Policies
 *
 * CRITICAL SECURITY PRINCIPLE:
 * This module manages only the client-side fresh re-authentication & WebAuthn/passkey
 * gate state in volatile memory. It is NEVER persisted to localStorage, sessionStorage,
 * IndexedDB, cookies, or Firestore, and it NEVER grants admin authorization.
 * Server-side Firebase Auth identity + Firestore Security Rules (`isAdmin()`) remain
 * the sole source of truth for administrator authorization.
 */

export const ADMIN_SECURITY_CONFIG = {
  /** Inactivity timeout: 15 minutes without admin interaction locks the Admin Panel */
  INACTIVITY_TIMEOUT_MS: 15 * 60 * 1000,

  /** Maximum session lifetime: 30 minutes absolute cap regardless of activity */
  MAX_SESSION_LIFETIME_MS: 30 * 60 * 1000,

  /** Freshness window for high-risk destructive actions (delete idea, suspend/unsuspend user): 5 minutes */
  DESTRUCTIVE_ACTION_FRESH_WINDOW_MS: 5 * 60 * 1000,

  /** Maximum failed re-authentication or WebAuthn attempts before temporary lockout */
  MAX_FAILED_ATTEMPTS: 5,

  /** Brute-force cooldown duration after reaching MAX_FAILED_ATTEMPTS: 60 seconds */
  LOCKOUT_DURATION_MS: 60 * 1000,

  /** Minimum interval between authentication attempts to prevent rapid automated retries */
  MIN_ATTEMPT_INTERVAL_MS: 1500,
} as const;

export type AdminVerificationMethod = 'webauthn' | 'stepup';

export interface AdminReauthSession {
  authenticated: true;
  uid: string;
  reauthCompletedAt: number;
  deviceVerifiedAt: number;
  verifiedAt: number;
  lastActivityAt: number;
  expiresAt: number;
  maxExpiresAt: number;
  method: AdminVerificationMethod;
  receiptId: string;
}

/**
 * Checks whether the current in-memory admin verification session is valid
 * for the specified authenticated sole-admin UID.
 */
export function isAdminReauthSessionValid(
  session: AdminReauthSession | null,
  currentUid: string | null | undefined,
  now = Date.now()
): boolean {
  if (!session || !currentUid) return false;
  if (!session.authenticated) return false;
  if (session.uid !== currentUid) return false;
  if (!session.receiptId || session.receiptId.length < 12) return false;
  if (now >= session.expiresAt) return false;
  if (now >= session.maxExpiresAt) return false;
  if (now - session.lastActivityAt >= ADMIN_SECURITY_CONFIG.INACTIVITY_TIMEOUT_MS) return false;
  if (now - session.verifiedAt >= ADMIN_SECURITY_CONFIG.MAX_SESSION_LIFETIME_MS) return false;
  return true;
}

/**
 * Checks whether the current in-memory admin session is fresh enough for a
 * destructive action (e.g. deleting content, suspending/unsuspending a user).
 */
export function isAdminSessionFreshForDestructiveAction(
  session: AdminReauthSession | null,
  currentUid: string | null | undefined,
  now = Date.now()
): boolean {
  if (!isAdminReauthSessionValid(session, currentUid, now)) return false;
  if (!session) return false;
  return now - session.verifiedAt <= ADMIN_SECURITY_CONFIG.DESTRUCTIVE_ACTION_FRESH_WINDOW_MS;
}

/**
 * Computes remaining milliseconds before the session expires (inactivity vs absolute cap).
 */
export function getAdminSessionRemainingMs(
  session: AdminReauthSession | null,
  now = Date.now()
): number {
  if (!session) return 0;
  const effectiveExpiry = Math.min(session.expiresAt, session.maxExpiresAt);
  return Math.max(0, effectiveExpiry - now);
}

/**
 * In-memory brute-force & retry rate limiter for admin verification attempts.
 */
interface AttemptState {
  failedCount: number;
  lastAttemptAt: number;
  lockedUntil: number;
}

const attemptStateByUid = new Map<string, AttemptState>();

export function getAdminSecurityLockoutState(
  uid: string,
  now = Date.now()
): {
  isLocked: boolean;
  waitSeconds: number;
  failedCount: number;
  remainingAttempts: number;
} {
  const state = attemptStateByUid.get(uid);
  if (!state) {
    return {
      isLocked: false,
      waitSeconds: 0,
      failedCount: 0,
      remainingAttempts: ADMIN_SECURITY_CONFIG.MAX_FAILED_ATTEMPTS,
    };
  }

  if (state.lockedUntil > now) {
    return {
      isLocked: true,
      waitSeconds: Math.ceil((state.lockedUntil - now) / 1000),
      failedCount: state.failedCount,
      remainingAttempts: 0,
    };
  }

  // Reset failed count if previous lockout has expired
  if (state.lockedUntil > 0 && now >= state.lockedUntil) {
    attemptStateByUid.delete(uid);
    return {
      isLocked: false,
      waitSeconds: 0,
      failedCount: 0,
      remainingAttempts: ADMIN_SECURITY_CONFIG.MAX_FAILED_ATTEMPTS,
    };
  }

  return {
    isLocked: false,
    waitSeconds: 0,
    failedCount: state.failedCount,
    remainingAttempts: Math.max(0, ADMIN_SECURITY_CONFIG.MAX_FAILED_ATTEMPTS - state.failedCount),
  };
}

export function checkCanAttemptAdminVerification(
  uid: string,
  now = Date.now()
): { allowed: boolean; waitSeconds: number; message?: string } {
  const lockout = getAdminSecurityLockoutState(uid, now);
  if (lockout.isLocked) {
    return {
      allowed: false,
      waitSeconds: lockout.waitSeconds,
      message: `Too many failed verification attempts. Please wait ${lockout.waitSeconds}s before trying again.`,
    };
  }

  const state = attemptStateByUid.get(uid);
  if (state && now - state.lastAttemptAt < ADMIN_SECURITY_CONFIG.MIN_ATTEMPT_INTERVAL_MS) {
    const waitSeconds = Math.ceil(
      (ADMIN_SECURITY_CONFIG.MIN_ATTEMPT_INTERVAL_MS - (now - state.lastAttemptAt)) / 1000
    );
    return {
      allowed: false,
      waitSeconds,
      message: 'Please wait a moment before retrying verification.',
    };
  }

  return { allowed: true, waitSeconds: 0 };
}

export function recordAdminVerificationFailure(
  uid: string,
  now = Date.now()
): { isLocked: boolean; waitSeconds: number; remainingAttempts: number } {
  const prev = attemptStateByUid.get(uid) || {
    failedCount: 0,
    lastAttemptAt: 0,
    lockedUntil: 0,
  };
  const nextFailed = prev.failedCount + 1;
  const shouldLock = nextFailed >= ADMIN_SECURITY_CONFIG.MAX_FAILED_ATTEMPTS;
  const lockedUntil = shouldLock ? now + ADMIN_SECURITY_CONFIG.LOCKOUT_DURATION_MS : 0;

  attemptStateByUid.set(uid, {
    failedCount: nextFailed,
    lastAttemptAt: now,
    lockedUntil,
  });

  return {
    isLocked: shouldLock,
    waitSeconds: shouldLock ? Math.ceil(ADMIN_SECURITY_CONFIG.LOCKOUT_DURATION_MS / 1000) : 0,
    remainingAttempts: Math.max(0, ADMIN_SECURITY_CONFIG.MAX_FAILED_ATTEMPTS - nextFailed),
  };
}

export function resetAdminVerificationAttempts(uid: string): void {
  attemptStateByUid.delete(uid);
}
