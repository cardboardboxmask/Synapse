import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { logAdminSecurityAuditEvent } from '../firebase';

export interface WebAuthnVerificationReceipt {
  verified: true;
  receiptId: string;
  verifiedAt: number;
  expiresAt: number;
  maxExpiresAt: number;
  method: 'webauthn' | 'stepup';
}

export async function checkDeviceWebAuthnSupport(): Promise<{
  supportsWebAuthn: boolean;
  platformAuthenticatorAvailable: boolean;
}> {
  try {
    const supports = browserSupportsWebAuthn();
    if (!supports) {
      return { supportsWebAuthn: false, platformAuthenticatorAvailable: false };
    }
    let platformAvailable = false;
    if (
      typeof window !== 'undefined' &&
      window.PublicKeyCredential &&
      typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
    ) {
      platformAvailable =
        await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
    return {
      supportsWebAuthn: true,
      platformAuthenticatorAvailable: platformAvailable,
    };
  } catch {
    return { supportsWebAuthn: false, platformAuthenticatorAvailable: false };
  }
}

function getClientOriginHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  return {
    'X-Client-Origin': window.location.origin,
    'X-Client-RpId': window.location.hostname,
  };
}

export async function getServerPasskeyStatus(idToken: string): Promise<{
  hasRegisteredPasskey: boolean;
  credentialCount: number;
  rpID: string;
}> {
  const res = await fetch('/api/admin/webauthn/status', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      Accept: 'application/json',
      ...getClientOriginHeaders(),
    },
  });
  if (!res.ok) {
    throw new Error('Verification failed. Please authenticate again.');
  }
  return res.json();
}

async function runPasskeyRegistrationOnThisDevice(
  idToken: string
): Promise<WebAuthnVerificationReceipt> {
  const optRes = await fetch('/api/admin/webauthn/register-options', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...getClientOriginHeaders(),
    },
  });
  const optData = await optRes.json();
  if (!optRes.ok || !optData.options) {
    throw new Error(optData.error || 'Verification failed. Please authenticate again.');
  }

  const registrationResponse = await startRegistration({
    optionsJSON: optData.options,
  });

  const verifyRes = await fetch('/api/admin/webauthn/register-verify', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...getClientOriginHeaders(),
    },
    body: JSON.stringify({ credential: registrationResponse }),
  });
  const verifyData = await verifyRes.json();
  if (!verifyRes.ok || !verifyData.verified) {
    throw new Error(verifyData.error || 'Verification failed. Please authenticate again.');
  }

  await logAdminSecurityAuditEvent({
    action: 'admin.webauthn.success',
    summary: 'Administrator registered and verified passkey on this device via WebAuthn (Step 2).',
  });
  return verifyData as WebAuthnVerificationReceipt;
}

async function runPasskeyAuthenticationOnThisDevice(
  idToken: string
): Promise<WebAuthnVerificationReceipt> {
  const optRes = await fetch('/api/admin/webauthn/auth-options', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...getClientOriginHeaders(),
    },
  });
  const optData = await optRes.json();
  if (!optRes.ok || !optData.options) {
    throw new Error(optData.error || 'Verification failed. Please authenticate again.');
  }

  const authResponse = await startAuthentication({
    optionsJSON: optData.options,
  });

  const verifyRes = await fetch('/api/admin/webauthn/auth-verify', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
      ...getClientOriginHeaders(),
    },
    body: JSON.stringify({ credential: authResponse }),
  });
  const verifyData = await verifyRes.json();
  if (!verifyRes.ok || !verifyData.verified) {
    throw new Error(verifyData.error || 'Verification failed. Please authenticate again.');
  }

  await logAdminSecurityAuditEvent({
    action: 'admin.webauthn.success',
    summary: 'Administrator verified passkey on this device via WebAuthn (Step 2).',
  });
  return verifyData as WebAuthnVerificationReceipt;
}

/**
 * Executes genuine WebAuthn / Passkey authentication or registration on THIS device
 * via `@simplewebauthn/browser` and verifies the cryptographic response on the server.
 */
export async function authenticateWithDeviceWebAuthn(
  idToken: string,
  mode: boolean | 'auto' | 'authenticate' | 'register' = 'auto'
): Promise<WebAuthnVerificationReceipt> {
  const support = await checkDeviceWebAuthnSupport();
  if (!support.supportsWebAuthn) {
    await logAdminSecurityAuditEvent({
      action: 'admin.webauthn.failure',
      summary: 'WebAuthn unavailable in current browser or device.',
    });
    throw new Error(
      "Device authentication isn't available in this browser or device. Use Google Authenticator below."
    );
  }

  try {
    const resolvedMode: 'auto' | 'authenticate' | 'register' =
      typeof mode === 'boolean' ? (mode ? 'register' : 'auto') : mode;

    if (resolvedMode === 'register') {
      return await runPasskeyRegistrationOnThisDevice(idToken);
    }

    if (resolvedMode === 'authenticate') {
      return await runPasskeyAuthenticationOnThisDevice(idToken);
    }

    // 'auto' mode: check if this domain already has a registered passkey on the server.
    // If yes -> authenticate with it on this device; if no -> create & verify platform passkey on this device.
    const status = await getServerPasskeyStatus(idToken);
    if (status.hasRegisteredPasskey) {
      return await runPasskeyAuthenticationOnThisDevice(idToken);
    }
    return await runPasskeyRegistrationOnThisDevice(idToken);
  } catch (err) {
    const errName = err instanceof Error ? err.name : '';
    const errMsg = err instanceof Error ? err.message : '';
    const isEmbeddedIframe =
      typeof window !== 'undefined' && window.self !== window.top;
    const isIframeRestricted =
      errMsg.includes('same-origin with all of its ancestors') ||
      errMsg.includes('not enabled in this document') ||
      errMsg.includes('Permissions-Policy') ||
      (isEmbeddedIframe && (errName === 'NotAllowedError' || errName === 'SecurityError'));
    const isUnavailable =
      errName === 'NotSupportedError' ||
      errName === 'SecurityError' ||
      errMsg.includes('PublicKeyCredential');

    await logAdminSecurityAuditEvent({
      action: 'admin.webauthn.failure',
      summary: isIframeRestricted
        ? 'WebAuthn blocked by embedded preview iframe policy.'
        : isUnavailable
          ? 'WebAuthn unavailable in current browser or device.'
          : 'WebAuthn device passkey verification failed or was cancelled.',
    });

    if (isIframeRestricted) {
      throw new Error(
        "Browser security blocks biometric passkeys inside an embedded preview frame. Open the app in a full browser tab or use Google Authenticator below."
      );
    }
    if (isUnavailable) {
      throw new Error(
        "Device authentication isn't available in this browser or device. Use Google Authenticator below."
      );
    }
    if (errMsg.includes('Too many')) {
      throw new Error(errMsg);
    }
    if (errMsg.includes('expired')) {
      throw new Error('Your admin verification expired. Please verify your identity again.');
    }
    throw new Error(
      'Biometric / passkey prompt was cancelled or no passkey was found for this site. Try again or use Google Authenticator below.'
    );
  }
}

export interface GoogleAuthenticatorStatus {
  enrolled: boolean;
  issuer: string;
  accountName: string;
  qrDataUrl?: string;
  manualKey?: string;
  otpauthUrl?: string;
}

/**
 * Google Authenticator (RFC 6238 TOTP) status & QR setup helper for Step 2 verification.
 */
export async function requestGoogleAuthenticatorStatus(
  idToken: string,
  showSetup = false
): Promise<GoogleAuthenticatorStatus> {
  const res = await fetch('/api/admin/totp/status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ showSetup }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Verification failed. Please authenticate again.');
  }
  return data as GoogleAuthenticatorStatus;
}

export async function verifyGoogleAuthenticatorCode(
  idToken: string,
  code: string
): Promise<WebAuthnVerificationReceipt> {
  const res = await fetch('/api/admin/totp/verify', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok || !data.verified) {
    await logAdminSecurityAuditEvent({
      action: 'admin.reauth.failure',
      summary: 'Administrator Google Authenticator 6-digit TOTP verification failed.',
    });
    throw new Error(
      data.error || 'Invalid Google Authenticator 6-digit code. Please check your app and try again.'
    );
  }
  await logAdminSecurityAuditEvent({
    action: 'admin.reauth.success',
    summary: 'Administrator verified 6-digit Google Authenticator TOTP code (Step 2).',
  });
  return data as WebAuthnVerificationReceipt;
}
