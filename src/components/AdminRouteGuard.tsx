import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  checkCanAttemptAdminVerification,
  getAdminSecurityLockoutState,
  recordAdminVerificationFailure,
} from '../config/adminSecurity';
import { useApp } from '../context/AppContext';
import {
  getAdminAuthProviders,
  logAdminSecurityAuditEvent,
  reauthenticateAdminWithGoogle,
  reauthenticateAdminWithPassword,
} from '../firebase';
import {
  authenticateWithDeviceWebAuthn,
  checkDeviceWebAuthnSupport,
  getServerPasskeyStatus,
  requestGoogleAuthenticatorStatus,
  verifyGoogleAuthenticatorCode,
  type GoogleAuthenticatorStatus,
} from '../utils/adminWebAuthnClient';
import { PageMeta } from './PageMeta';

type GateStatus =
  | 'idle'
  | 'checking-access'
  | 'verifying-identity'
  | 'waiting-device'
  | 'opening-panel';

interface AdminSecurityLockProps {
  returnTo: string;
}

export const AdminSecurityLock: React.FC<AdminSecurityLockProps> = ({ returnTo }) => {
  const {
    user,
    isAdmin,
    adminLockReason,
    completeAdminSecurityVerification,
    showToast,
  } = useApp();
  const navigate = useNavigate();

  const [step1Token, setStep1Token] = useState<string | null>(null);
  const [step1CompletedAt, setStep1CompletedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<GateStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    adminLockReason === 'timeout'
      ? 'Your admin verification expired. Please verify your identity again.'
      : null
  );

  // Provider detection
  const providers = getAdminAuthProviders(user);
  const [passwordInput, setPasswordInput] = useState('');
  const [usePasswordMode, setUsePasswordMode] = useState(false);

  // WebAuthn & Google Authenticator TOTP state
  const [supportsWebAuthn, setSupportsWebAuthn] = useState<boolean>(true);
  const [hasRegisteredPasskey, setHasRegisteredPasskey] = useState<boolean>(false);
  const [showOtherOption, setShowOtherOption] = useState<boolean>(false);
  const [totpStatus, setTotpStatus] = useState<GoogleAuthenticatorStatus | null>(null);
  const [totpInput, setTotpInput] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<boolean>(false);

  // Brute-force lockout countdown
  const [lockoutSeconds, setLockoutSeconds] = useState<number>(0);

  useEffect(() => {
    if (adminLockReason === 'timeout') {
      setErrorMessage('Your admin verification expired. Please verify your identity again.');
    }
  }, [adminLockReason]);

  useEffect(() => {
    let mounted = true;
    checkDeviceWebAuthnSupport().then((res) => {
      if (mounted) {
        setSupportsWebAuthn(res.supportsWebAuthn);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const updateLockout = () => {
      const state = getAdminSecurityLockoutState(user.uid);
      setLockoutSeconds(state.isLocked ? state.waitSeconds : 0);
    };
    updateLockout();
    const timer = window.setInterval(updateLockout, 1000);
    return () => window.clearInterval(timer);
  }, [user]);

  if (!user || !isAdmin) {
    return null;
  }

  const handleStep1GoogleReauth = async () => {
    const attemptCheck = checkCanAttemptAdminVerification(user.uid);
    if (!attemptCheck.allowed) {
      setErrorMessage(
        attemptCheck.message || 'Verification temporarily restricted. Please wait and try again.'
      );
      return;
    }

    setErrorMessage(null);
    setStatus('verifying-identity');
    try {
      const { idToken, reauthenticatedAt } = await reauthenticateAdminWithGoogle();
      setStep1Token(idToken);
      setStep1CompletedAt(reauthenticatedAt);
      try {
        const passkeyStatus = await getServerPasskeyStatus(idToken);
        setHasRegisteredPasskey(passkeyStatus.hasRegisteredPasskey);
      } catch {
        setHasRegisteredPasskey(false);
      }
      setStatus('idle');
    } catch (err) {
      const failState = recordAdminVerificationFailure(user.uid);
      setLockoutSeconds(failState.waitSeconds);
      setStatus('idle');
      setErrorMessage(
        failState.isLocked
          ? `Too many failed verification attempts. Please wait ${failState.waitSeconds}s before trying again.`
          : err instanceof Error && err.message
            ? err.message
            : 'Verification failed. Please authenticate again.'
      );
    }
  };

  const handleStep1PasswordReauth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordInput) return;

    const attemptCheck = checkCanAttemptAdminVerification(user.uid);
    if (!attemptCheck.allowed) {
      setErrorMessage(
        attemptCheck.message || 'Verification temporarily restricted. Please wait and try again.'
      );
      return;
    }

    setErrorMessage(null);
    setStatus('verifying-identity');
    try {
      const { idToken, reauthenticatedAt } = await reauthenticateAdminWithPassword(passwordInput);
      setPasswordInput('');
      setStep1Token(idToken);
      setStep1CompletedAt(reauthenticatedAt);
      try {
        const passkeyStatus = await getServerPasskeyStatus(idToken);
        setHasRegisteredPasskey(passkeyStatus.hasRegisteredPasskey);
      } catch {
        setHasRegisteredPasskey(false);
      }
      setStatus('idle');
    } catch {
      setPasswordInput('');
      const failState = recordAdminVerificationFailure(user.uid);
      setLockoutSeconds(failState.waitSeconds);
      setStatus('idle');
      setErrorMessage(
        failState.isLocked
          ? `Too many failed verification attempts. Please wait ${failState.waitSeconds}s before trying again.`
          : 'Verification failed. Please authenticate again.'
      );
    }
  };

  const handleStep2DeviceWebAuthn = async (
    mode: 'auto' | 'authenticate' | 'register' = 'auto'
  ) => {
    if (!step1Token || !step1CompletedAt) {
      setErrorMessage('Complete Step 1 account authentication first.');
      return;
    }

    const attemptCheck = checkCanAttemptAdminVerification(user.uid);
    if (!attemptCheck.allowed) {
      setErrorMessage(
        attemptCheck.message || 'Verification temporarily restricted. Please wait and try again.'
      );
      return;
    }

    setErrorMessage(null);
    setStatus('waiting-device');
    try {
      const receipt = await authenticateWithDeviceWebAuthn(step1Token, mode);
      setStatus('opening-panel');
      completeAdminSecurityVerification({
        reauthCompletedAt: step1CompletedAt,
        receipt,
      });
      showToast('Admin identity verified. Session unlocked for 15 minutes.', 'success');
      navigate(returnTo, { replace: true });
    } catch (err) {
      const failState = recordAdminVerificationFailure(user.uid);
      setLockoutSeconds(failState.waitSeconds);
      setStatus('idle');
      const msg =
        err instanceof Error && err.message
          ? err.message
          : 'Verification failed. Please authenticate again.';
      setErrorMessage(
        failState.isLocked
          ? `Too many failed verification attempts. Please wait ${failState.waitSeconds}s before trying again.`
          : msg
      );
      if (
        msg.includes("Device authentication isn't available") ||
        msg.includes('embedded preview frame') ||
        msg.includes('Google Authenticator')
      ) {
        void handleOpenGoogleAuthenticator(false);
      }
    }
  };

  const handleOpenGoogleAuthenticator = async (showSetup = false) => {
    if (!step1Token) return;
    const attemptCheck = checkCanAttemptAdminVerification(user.uid);
    if (!attemptCheck.allowed) {
      setErrorMessage(
        attemptCheck.message || 'Verification temporarily restricted. Please wait and try again.'
      );
      return;
    }
    setErrorMessage(null);
    setStatus('verifying-identity');
    try {
      const res = await requestGoogleAuthenticatorStatus(step1Token, showSetup);
      setTotpStatus(res);
      setShowOtherOption(true);
      setStatus('idle');
    } catch {
      setStatus('idle');
      setErrorMessage('Verification failed. Please authenticate again.');
    }
  };

  const handleVerifyGoogleAuthenticator = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = totpInput.replace(/\D/g, '');
    if (!step1Token || !step1CompletedAt || cleaned.length !== 6) return;

    const attemptCheck = checkCanAttemptAdminVerification(user.uid);
    if (!attemptCheck.allowed) {
      setErrorMessage(
        attemptCheck.message || 'Verification temporarily restricted. Please wait and try again.'
      );
      return;
    }

    setErrorMessage(null);
    setStatus('verifying-identity');
    try {
      const receipt = await verifyGoogleAuthenticatorCode(step1Token, cleaned);
      setStatus('opening-panel');
      completeAdminSecurityVerification({
        reauthCompletedAt: step1CompletedAt,
        receipt,
      });
      showToast('Google Authenticator verified. Admin session unlocked for 15 minutes.', 'success');
      navigate(returnTo, { replace: true });
    } catch (err) {
      const failState = recordAdminVerificationFailure(user.uid);
      setLockoutSeconds(failState.waitSeconds);
      setTotpInput('');
      setStatus('idle');
      setErrorMessage(
        failState.isLocked
          ? `Too many failed verification attempts. Please wait ${failState.waitSeconds}s before trying again.`
          : err instanceof Error && err.message
            ? err.message
            : 'Invalid Google Authenticator 6-digit code. Please check your app and try again.'
      );
    }
  };

  const isBusy = status !== 'idle';
  const step1Done = Boolean(step1Token && step1CompletedAt);

  const statusText =
    status === 'checking-access'
      ? 'Checking administrator access…'
      : status === 'verifying-identity'
        ? 'Verifying identity…'
        : status === 'waiting-device'
          ? 'Waiting for device authentication…'
          : status === 'opening-panel'
            ? 'Opening Admin Panel…'
            : null;

  return (
    <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-4 py-8 sm:py-14">
      <PageMeta
        title="Admin Security Check — Synapse"
        description="Fresh administrator re-authentication and device biometric/passkey verification required."
        noindex
      />

      <div
        className="w-full max-w-[420px] bg-surface-container-low rounded-2xl p-6 sm:p-8 border border-surface-variant/40 shadow-2xl flex flex-col gap-6"
        role="region"
        aria-labelledby="admin-security-gate-title"
      >
        {/* Top Lock Icon & Header */}
        <div className="flex flex-col items-center text-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center"
            aria-hidden="true"
          >
            <span className="material-symbols-outlined text-[30px]">lock</span>
          </div>

          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-code-sm text-code-sm uppercase">
            <span className="material-symbols-outlined text-[13px] text-primary" aria-hidden="true">
              shield_lock
            </span>
            Protected Admin Area
          </div>

          <h1
            id="admin-security-gate-title"
            className="font-headline-md text-headline-md text-on-surface"
          >
            Admin Security Check
          </h1>

          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Your administrator account requires fresh verification before entering the panel.
          </p>
        </div>

        {/* Live Status Banner */}
        {statusText && (
          <div
            role="status"
            aria-live="polite"
            className="p-3.5 rounded-xl bg-primary/10 border border-primary/30 text-primary font-code-sm text-code-sm flex items-center justify-center gap-2.5"
          >
            <span
              className="material-symbols-outlined text-[18px] motion-safe:animate-spin"
              aria-hidden="true"
            >
              progress_activity
            </span>
            <span>{statusText}</span>
          </div>
        )}

        {/* Accessible Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            className="p-3.5 rounded-xl bg-error-container/90 border border-error/40 text-on-error-container font-body-sm text-body-sm flex items-start gap-2.5 text-left"
          >
            <span
              className="material-symbols-outlined text-[18px] shrink-0 mt-0.5"
              aria-hidden="true"
            >
              error
            </span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 1: Account Re-Authentication */}
        <div
          className={`rounded-xl p-4 border transition-colors flex flex-col gap-3 ${
            step1Done
              ? 'bg-secondary/10 border-secondary/40'
              : 'bg-surface-container border-surface-variant/40'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-code-sm text-code-sm uppercase tracking-wider text-on-surface-variant">
              Step 1 · Account Authentication
            </span>
            {step1Done ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary/20 text-secondary font-code-sm text-code-sm">
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                  check_circle
                </span>
                Account verified
              </span>
            ) : (
              <span className="font-code-sm text-code-sm text-primary">Required</span>
            )}
          </div>

          {!step1Done ? (
            <div className="flex flex-col gap-3">
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                {providers.hasGoogle && !usePasswordMode
                  ? 'Your administrator account is protected by Google Sign-In. Confirm your Google identity to continue.'
                  : 'Confirm your administrator account credentials to continue.'}
              </p>

              {providers.hasGoogle && !usePasswordMode && (
                <button
                  type="button"
                  disabled={isBusy || lockoutSeconds > 0}
                  onClick={handleStep1GoogleReauth}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-primary-container text-on-primary font-title-sm text-title-sm flex items-center justify-center gap-2.5 shadow-md hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                    passkey
                  </span>
                  <span>
                    {status === 'verifying-identity'
                      ? 'Verifying identity…'
                      : lockoutSeconds > 0
                        ? `Locked (${lockoutSeconds}s)`
                        : 'Re-authenticate with Google'}
                  </span>
                </button>
              )}

              {providers.hasPassword && usePasswordMode && (
                <form onSubmit={handleStep1PasswordReauth} className="flex flex-col gap-2.5">
                  <label
                    htmlFor="admin-reauth-password"
                    className="font-code-sm text-code-sm text-on-surface-variant uppercase"
                  >
                    Administrator Password
                  </label>
                  <input
                    id="admin-reauth-password"
                    type="password"
                    autoComplete="current-password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    disabled={isBusy || lockoutSeconds > 0}
                    required
                    className="w-full min-h-[44px] px-3.5 rounded-lg bg-surface-container-high text-on-surface border border-surface-variant/40 font-body-sm text-body-sm focus-visible:outline-2 focus-visible:outline-primary"
                  />
                  <button
                    type="submit"
                    disabled={isBusy || lockoutSeconds > 0 || !passwordInput}
                    className="w-full min-h-[48px] px-4 rounded-xl bg-primary-container text-on-primary font-title-sm text-title-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    Verify Password
                  </button>
                </form>
              )}

              {providers.hasGoogle && providers.hasPassword && (
                <button
                  type="button"
                  onClick={() => setUsePasswordMode((prev) => !prev)}
                  className="font-code-sm text-code-sm text-secondary hover:underline self-center min-h-[36px] px-2"
                >
                  {usePasswordMode
                    ? 'Use Google Re-authentication instead'
                    : 'Use account password instead'}
                </button>
              )}
            </div>
          ) : (
            <p className="font-body-sm text-body-sm text-on-surface">
              ✓ Fresh Firebase account authentication confirmed. Proceed to Step 2.
            </p>
          )}
        </div>

        {/* STEP 2: Device Biometric / Passkey (WebAuthn) */}
        <div
          className={`rounded-xl p-4 border transition-colors flex flex-col gap-3 ${
            step1Done
              ? 'bg-surface-container border-primary/40'
              : 'bg-surface-container-lowest/60 border-surface-variant/20 opacity-65'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-code-sm text-code-sm uppercase tracking-wider text-on-surface-variant">
              Step 2 · Device Biometric / Passkey
            </span>
            <span className="font-code-sm text-code-sm text-primary">
              {step1Done ? 'Ready' : 'Complete Step 1 first'}
            </span>
          </div>

          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Use the passkey or biometric sensor on <strong>this device</strong> (fingerprint, face
            recognition, device PIN, or screen lock via WebAuthn).
          </p>

          <button
            type="button"
            disabled={!step1Done || isBusy || lockoutSeconds > 0}
            onClick={() => handleStep2DeviceWebAuthn('auto')}
            className="w-full min-h-[48px] px-4 rounded-xl bg-secondary text-on-secondary font-title-sm text-title-sm flex items-center justify-center gap-2.5 shadow-md hover:opacity-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-40 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              fingerprint
            </span>
            <span>
              {status === 'waiting-device'
                ? 'Waiting for device authentication…'
                : 'Use Biometric / Passkey on This Device'}
            </span>
          </button>

          {step1Done && (
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                disabled={isBusy || lockoutSeconds > 0}
                onClick={() =>
                  handleStep2DeviceWebAuthn(hasRegisteredPasskey ? 'register' : 'authenticate')
                }
                className="w-full min-h-[38px] px-3 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-on-surface font-code-sm text-code-sm transition-colors cursor-pointer"
              >
                {hasRegisteredPasskey
                  ? 'Re-register biometric passkey on this device'
                  : 'Already saved a passkey here? Sign in with existing passkey'}
              </button>
              {typeof window !== 'undefined' && window.self !== window.top && (
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[38px] px-3 rounded-lg bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 font-code-sm text-code-sm flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                    open_in_new
                  </span>
                  <span>Open in Full Browser Tab to Use Biometric Passkey</span>
                </a>
              )}
            </div>
          )}

          {/* Google Authenticator (6-Digit TOTP) Option */}
          {step1Done && (
            <div className="pt-1 flex flex-col gap-2.5 border-t border-surface-variant/20">
              {!showOtherOption ? (
                <button
                  type="button"
                  disabled={isBusy || lockoutSeconds > 0}
                  onClick={() => handleOpenGoogleAuthenticator(false)}
                  className="w-full min-h-[40px] px-3 rounded-lg text-on-surface-variant hover:text-on-surface font-code-sm text-code-sm underline underline-offset-4 transition-colors cursor-pointer"
                >
                  Use Google Authenticator code instead
                </button>
              ) : (
                <div className="p-3.5 rounded-xl bg-surface-container-high/70 border border-surface-variant/40 flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-code-sm text-code-sm text-primary uppercase flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                        phonelink_lock
                      </span>
                      Google Authenticator (2FA)
                    </span>
                    {totpStatus?.enrolled && !totpStatus.qrDataUrl && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleOpenGoogleAuthenticator(true)}
                        className="font-code-sm text-code-sm text-secondary hover:underline cursor-pointer"
                      >
                        Show QR / Setup Key
                      </button>
                    )}
                  </div>

                  {totpStatus?.qrDataUrl && (
                    <div className="p-3 rounded-xl bg-surface-container-lowest border border-surface-variant/40 flex flex-col items-center gap-2.5 text-center">
                      <p className="font-body-sm text-body-sm text-on-surface-variant">
                        Scan this QR code in your <strong>Google Authenticator</strong> app (or
                        enter the setup key manually):
                      </p>
                      <img
                        src={totpStatus.qrDataUrl}
                        alt="Google Authenticator QR Code for Synapse Admin"
                        className="w-40 h-40 rounded-lg border border-surface-variant/40 bg-white p-1.5"
                      />
                      {totpStatus.manualKey && (
                        <div className="w-full flex flex-col gap-1.5">
                          <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                            Setup Key (Time-based)
                          </span>
                          <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-surface-container border border-surface-variant/40">
                            <code className="font-code-sm text-code-sm text-primary select-all break-all text-left">
                              {totpStatus.manualKey}
                            </code>
                            <button
                              type="button"
                              onClick={() => {
                                if (totpStatus.manualKey) {
                                  void navigator.clipboard.writeText(
                                    totpStatus.manualKey.replace(/\s+/g, '')
                                  );
                                  setCopiedKey(true);
                                  window.setTimeout(() => setCopiedKey(false), 2000);
                                }
                              }}
                              className="px-2 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest font-code-sm text-code-sm text-on-surface shrink-0 cursor-pointer"
                            >
                              {copiedKey ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <form onSubmit={handleVerifyGoogleAuthenticator} className="flex flex-col gap-2.5">
                    <label
                      htmlFor="admin-totp-code-input"
                      className="font-code-sm text-code-sm text-on-surface-variant uppercase"
                    >
                      Enter 6-digit code from Google Authenticator
                    </label>
                    <input
                      id="admin-totp-code-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      autoComplete="one-time-code"
                      maxLength={6}
                      value={totpInput}
                      onChange={(e) => setTotpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      required
                      className="w-full min-h-[44px] px-3.5 rounded-lg bg-surface-container text-on-surface border border-surface-variant/40 font-code-md text-code-md tracking-[0.35em] text-center focus-visible:outline-2 focus-visible:outline-primary"
                    />
                    <button
                      type="submit"
                      disabled={isBusy || lockoutSeconds > 0 || totpInput.replace(/\D/g, '').length !== 6}
                      className="w-full min-h-[44px] px-4 rounded-lg bg-primary-container text-on-primary font-code-sm text-code-sm font-semibold disabled:opacity-50 cursor-pointer"
                    >
                      Verify Google Authenticator Code
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cancel / Back Navigation */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <Link
            to="/"
            className="w-full min-h-[44px] px-4 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md flex items-center justify-center gap-2 transition-colors focus-visible:outline-2 focus-visible:outline-primary"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              arrow_back
            </span>
            <span>Cancel / Back to Synapse</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

/**
 * Reusable AdminRouteGuard enforcing in strict order:
 * Check 1 — Firebase authentication (/login?returnTo=...)
 * Check 2 — Sole-admin authorization (403 / Access Denied)
 * Check 3 — Fresh in-memory admin re-authentication + WebAuthn/Step-up (AdminSecurityLock)
 */
export const AdminRouteGuard: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { user, profile, isAdmin, authReady, isAdminUnlocked } = useApp();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const loggedDeniedRef = useRef<string | null>(null);

  const requestedReturnTo = searchParams.get('returnTo');
  const safeReturnTo =
    requestedReturnTo &&
    requestedReturnTo.startsWith('/admin') &&
    !requestedReturnTo.startsWith('//')
      ? requestedReturnTo
      : location.pathname.startsWith('/admin') && location.pathname !== '/admin/security-check'
        ? `${location.pathname}${location.search}`
        : '/admin';

  // Audit unauthorized access attempts once per user session
  useEffect(() => {
    if (
      authReady &&
      user &&
      (!isAdmin || profile?.suspended || profile?.accountStatus === 'disabled') &&
      loggedDeniedRef.current !== user.uid
    ) {
      loggedDeniedRef.current = user.uid;
      void logAdminSecurityAuditEvent({
        action: 'admin.panel.access_denied',
        summary: 'Unauthorized account attempted to access the Admin Panel route.',
      }).catch(() => {});
    }
  }, [authReady, user, isAdmin, profile?.suspended, profile?.accountStatus]);

  // Loading state while Firebase Auth initializes
  if (!authReady) {
    return (
      <div
        className="max-w-lg mx-auto px-4 py-24 flex flex-col items-center justify-center gap-4 text-center"
        role="status"
        aria-live="polite"
      >
        <div className="w-12 h-12 rounded-2xl bg-primary/15 text-primary flex items-center justify-center">
          <span
            className="material-symbols-outlined text-[26px] motion-safe:animate-spin"
            aria-hidden="true"
          >
            progress_activity
          </span>
        </div>
        <p className="font-title-md text-title-md text-on-surface">
          Checking administrator access…
        </p>
      </div>
    );
  }

  // Check 1 — Firebase authentication
  if (!user) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(safeReturnTo)}`} replace />;
  }

  // Check 2 — Existing sole-admin authorization (403 / Access Denied)
  if (!isAdmin || profile?.suspended || profile?.accountStatus === 'disabled') {
    return (
      <div className="max-w-lg mx-auto px-4 py-20">
        <PageMeta
          title="403 Access Denied — Synapse"
          description="This account is not authorized to access the Admin Panel."
          noindex
        />
        <div
          className="bg-surface-container-low rounded-2xl p-8 flex flex-col items-center text-center gap-5 border border-error/40 shadow-xl"
          role="alert"
        >
          <div className="w-14 h-14 rounded-2xl bg-error/15 text-error flex items-center justify-center">
            <span className="material-symbols-outlined text-[30px]" aria-hidden="true">
              gpp_bad
            </span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-error/15 text-error font-code-sm text-code-sm uppercase">
            403 · Access Denied
          </div>
          <h1 className="font-headline-md text-headline-md text-on-surface">
            Access Denied
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            This account is not authorized to access the Admin Panel.
          </p>
          <Link
            to="/"
            className="min-h-[44px] px-6 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md inline-flex items-center justify-center gap-2 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
              home
            </span>
            <span>Return Home</span>
          </Link>
        </div>
      </div>
    );
  }

  // Check 3 — Fresh admin re-authentication + WebAuthn/Passkey verification
  if (!isAdminUnlocked) {
    return <AdminSecurityLock returnTo={safeReturnTo} />;
  }

  // If visiting /admin/security-check directly while already unlocked, redirect to target admin route
  if (location.pathname === '/admin/security-check') {
    return <Navigate to={safeReturnTo} replace />;
  }

  return <>{children}</>;
};
