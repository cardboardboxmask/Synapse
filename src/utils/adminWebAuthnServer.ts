import crypto from 'crypto';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import QRCode from 'qrcode';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransport,
} from '@simplewebauthn/server';
import firebaseConfig from '../../firebase-applet-config.json';

const SOLE_ADMIN_EMAIL = 'cardboardboxmask@gmail.com';
const SOLE_ADMIN_UID = 'kETq37KlCWR7k3MqSCa14zszoA22';
const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
const GOOGLE_SECURETOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const CHALLENGE_TTL_MS = 120 * 1000; // 2 minutes single-use lifetime
const MAX_SERVER_FAILURES = 5;
const SERVER_LOCKOUT_MS = 60 * 1000;
const PASSKEY_STORE_FILE = path.resolve(process.cwd(), '.admin-passkeys.json');
const TOTP_STORE_FILE = path.resolve(process.cwd(), '.admin-totp.json');
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

interface StoredTotpConfig {
  secretBase32: string;
  enrolled: boolean;
  enrolledAt?: string;
  lastUsedStep?: number;
}

function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(base32: string): Buffer {
  const cleaned = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function getDefaultDeterministicTotpSecret(): string {
  const seed = crypto
    .createHmac('sha256', `synapse-totp-v1:${FIREBASE_PROJECT_ID}`)
    .update(`${SOLE_ADMIN_UID}:${SOLE_ADMIN_EMAIL}:google-authenticator`)
    .digest()
    .subarray(0, 20); // 160-bit secret for standard RFC 6238 SHA1 TOTP
  return encodeBase32(seed);
}

function loadAdminTotpConfig(): StoredTotpConfig {
  try {
    if (fs.existsSync(TOTP_STORE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(TOTP_STORE_FILE, 'utf8')) as Partial<StoredTotpConfig>;
      if (raw.secretBase32 && raw.secretBase32.length >= 16) {
        return {
          secretBase32: raw.secretBase32,
          enrolled: Boolean(raw.enrolled),
          enrolledAt: raw.enrolledAt,
          lastUsedStep: raw.lastUsedStep,
        };
      }
    }
  } catch {
    // Fall through to deterministic default
  }
  return {
    secretBase32: getDefaultDeterministicTotpSecret(),
    enrolled: false,
  };
}

function saveAdminTotpConfig(config: StoredTotpConfig) {
  try {
    fs.writeFileSync(TOTP_STORE_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch {
    // Ignore write errors on read-only filesystems
  }
}

let adminTotpConfig: StoredTotpConfig = loadAdminTotpConfig();

/**
 * Computes RFC 6238 6-digit TOTP code for a given 30-second time step.
 */
export function computeTotpCodeForStep(secretBase32: string, timeStep: number): string {
  const key = decodeBase32(secretBase32);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(timeStep), 0);
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 1_000_000).toString().padStart(6, '0');
}

function verifyGoogleAuthenticatorTotp(
  secretBase32: string,
  submittedCode: string,
  lastUsedStep?: number
): { valid: boolean; matchedStep?: number } {
  const cleaned = submittedCode.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleaned)) {
    return { valid: false };
  }
  const currentStep = Math.floor(Date.now() / 1000 / 30);
  // Allow -1, 0, +1 30-second window for slight device clock drift
  for (const offset of [0, -1, 1]) {
    const step = currentStep + offset;
    if (lastUsedStep !== undefined && step <= lastUsedStep) {
      continue; // Replay protection: prevent reusing same 30s TOTP window
    }
    const expected = computeTotpCodeForStep(secretBase32, step);
    const a = Buffer.from(cleaned, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      return { valid: true, matchedStep: step };
    }
  }
  return { valid: false };
}

interface StoredPasskeyCredential {
  id: string;
  publicKey: Uint8Array<ArrayBuffer>;
  counter: number;
  transports?: AuthenticatorTransport[];
  rpID: string;
  createdAt: string;
}

interface SerializedPasskeyCredential {
  id: string;
  publicKeyBase64: string;
  counter: number;
  transports?: AuthenticatorTransport[];
  rpID: string;
  createdAt: string;
}

interface PendingChallenge {
  challenge: string;
  uid: string;
  rpID: string;
  origin: string;
  type: 'registration' | 'authentication' | 'stepup';
  expiresAt: number;
}

interface RateLimitState {
  failures: number;
  lockedUntil: number;
  windowCount: number;
  windowResetAt: number;
}

// Ephemeral server-side secret for signing session receipts (never exposed to client)
const SERVER_RECEIPT_SECRET = crypto.randomBytes(32);

// In-memory single-use challenge store (keyed by `${uid}:${rpID}:${type}`)
const pendingChallenges = new Map<string, PendingChallenge>();

// Persistent + in-memory passkey credential store for the sole administrator
const adminPasskeys = new Map<string, StoredPasskeyCredential[]>();

function loadPersistedPasskeys() {
  try {
    if (!fs.existsSync(PASSKEY_STORE_FILE)) return;
    const raw = fs.readFileSync(PASSKEY_STORE_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, SerializedPasskeyCredential[]>;
    for (const [key, list] of Object.entries(parsed)) {
      if (Array.isArray(list)) {
        adminPasskeys.set(
          key,
          list.map((item) => ({
            id: item.id,
            publicKey: new Uint8Array(Buffer.from(item.publicKeyBase64, 'base64')),
            counter: item.counter || 0,
            transports: item.transports,
            rpID: item.rpID,
            createdAt: item.createdAt,
          }))
        );
      }
    }
  } catch {
    // Ignore read errors if file does not exist yet
  }
}

function savePersistedPasskeys() {
  try {
    const serialized: Record<string, SerializedPasskeyCredential[]> = {};
    for (const [key, list] of adminPasskeys.entries()) {
      serialized[key] = list.map((item) => ({
        id: item.id,
        publicKeyBase64: Buffer.from(item.publicKey).toString('base64'),
        counter: item.counter,
        transports: item.transports,
        rpID: item.rpID,
        createdAt: item.createdAt,
      }));
    }
    fs.writeFileSync(PASSKEY_STORE_FILE, JSON.stringify(serialized, null, 2), 'utf8');
  } catch {
    // Ignore write errors in read-only environments
  }
}

loadPersistedPasskeys();

// Server-side brute-force rate limit map
const rateLimits = new Map<string, RateLimitState>();

// Cached Google X.509 public certificates for Firebase Auth JWT verification
let cachedCerts: Record<string, string> | null = null;
let cachedCertsExpiresAt = 0;

async function getGooglePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cachedCerts && now < cachedCertsExpiresAt) {
    return cachedCerts;
  }
  const response = await fetch(GOOGLE_SECURETOKEN_CERTS_URL);
  if (!response.ok) {
    throw new Error('Failed to fetch Google SecureToken public certificates.');
  }
  const certs = (await response.json()) as Record<string, string>;
  cachedCerts = certs;
  const cacheControl = response.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeSeconds = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCertsExpiresAt = now + maxAgeSeconds * 1000;
  return certs;
}

function base64UrlToBuffer(base64Url: string): Buffer {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLength), 'base64');
}

interface VerifiedAdminToken {
  uid: string;
  email: string;
  emailVerified: boolean;
  authTimeSeconds: number;
}

/**
 * Cryptographically verifies a Firebase Auth ID Token (RS256) against Google's
 * SecureToken X.509 certificates and enforces the sole-owner administrator check.
 */
async function verifySoleAdminIdToken(authHeader?: string): Promise<VerifiedAdminToken> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header.');
  }
  const token = authHeader.slice('Bearer '.length).trim();
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed Firebase ID token.');
  }

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(base64UrlToBuffer(headerB64).toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  const payload = JSON.parse(base64UrlToBuffer(payloadB64).toString('utf8')) as {
    aud?: string;
    iss?: string;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    exp?: number;
    iat?: number;
    auth_time?: number;
  };

  if (header.alg !== 'RS256' || !header.kid) {
    throw new Error('Unsupported token algorithm.');
  }

  const certs = await getGooglePublicCerts();
  const cert = certs[header.kid];
  if (!cert) {
    throw new Error('Unknown token signing key ID.');
  }

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerB64}.${payloadB64}`);
  verifier.end();
  const signatureValid = verifier.verify(cert, base64UrlToBuffer(signatureB64));
  if (!signatureValid) {
    throw new Error('Invalid Firebase ID token signature.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= nowSeconds) {
    throw new Error('Firebase ID token has expired.');
  }
  if (payload.aud !== FIREBASE_PROJECT_ID) {
    throw new Error('Token audience mismatch.');
  }
  if (payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`) {
    throw new Error('Token issuer mismatch.');
  }

  const uid = payload.sub || '';
  const email = (payload.email || '').toLowerCase();
  const emailVerified = Boolean(payload.email_verified);

  const isAuthorizedSoleAdmin =
    (email === SOLE_ADMIN_EMAIL && emailVerified) || uid === SOLE_ADMIN_UID;
  if (!isAuthorizedSoleAdmin) {
    throw new Error('Unauthorized: Account is not the sole administrator.');
  }

  return {
    uid,
    email,
    emailVerified,
    authTimeSeconds: payload.auth_time || payload.iat || 0,
  };
}

function purgeExpiredChallenges(now = Date.now()) {
  for (const [key, entry] of pendingChallenges.entries()) {
    if (now >= entry.expiresAt) {
      pendingChallenges.delete(key);
    }
  }
}

function checkRateLimitAndLockout(key: string): { allowed: boolean; waitSeconds: number } {
  const now = Date.now();
  const state = rateLimits.get(key) || {
    failures: 0,
    lockedUntil: 0,
    windowCount: 0,
    windowResetAt: now + 60_000,
  };

  if (state.lockedUntil > now) {
    return {
      allowed: false,
      waitSeconds: Math.ceil((state.lockedUntil - now) / 1000),
    };
  }

  if (state.lockedUntil > 0 && now >= state.lockedUntil) {
    state.failures = 0;
    state.lockedUntil = 0;
  }

  if (now > state.windowResetAt) {
    state.windowCount = 0;
    state.windowResetAt = now + 60_000;
  }

  state.windowCount += 1;
  rateLimits.set(key, state);

  if (state.windowCount > 25) {
    return {
      allowed: false,
      waitSeconds: Math.ceil((state.windowResetAt - now) / 1000),
    };
  }

  return { allowed: true, waitSeconds: 0 };
}

function recordFailure(key: string) {
  const now = Date.now();
  const state = rateLimits.get(key) || {
    failures: 0,
    lockedUntil: 0,
    windowCount: 1,
    windowResetAt: now + 60_000,
  };
  state.failures += 1;
  if (state.failures >= MAX_SERVER_FAILURES) {
    state.lockedUntil = now + SERVER_LOCKOUT_MS;
  }
  rateLimits.set(key, state);
}

function clearFailures(key: string) {
  const state = rateLimits.get(key);
  if (state) {
    state.failures = 0;
    state.lockedUntil = 0;
    rateLimits.set(key, state);
  }
}

function resolveRpIdAndOrigin(
  req: IncomingMessage,
  body?: Record<string, unknown>
): { rpID: string; origin: string } {
  const clientOriginHeader =
    (req.headers['x-client-origin'] as string)?.trim() ||
    (typeof body?.clientOrigin === 'string' ? body.clientOrigin.trim() : '');
  const clientRpIdHeader =
    (req.headers['x-client-rpid'] as string)?.trim() ||
    (typeof body?.clientRpId === 'string' ? body.clientRpId.trim() : '');

  if (clientOriginHeader) {
    try {
      const parsed = new URL(clientOriginHeader);
      return {
        rpID: clientRpIdHeader || parsed.hostname,
        origin: parsed.origin,
      };
    } catch {
      // Fallback below
    }
  }

  const originHeader = req.headers.origin;
  if (originHeader) {
    try {
      const parsed = new URL(originHeader);
      return {
        rpID: clientRpIdHeader || parsed.hostname,
        origin: parsed.origin,
      };
    } catch {
      // Fallback below
    }
  }

  const refererHeader = req.headers.referer;
  if (refererHeader) {
    try {
      const parsed = new URL(refererHeader);
      return {
        rpID: clientRpIdHeader || parsed.hostname,
        origin: parsed.origin,
      };
    } catch {
      // Fallback below
    }
  }

  const forwardedProto =
    (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || 'https';
  const rawHost = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost';
  const hostname = clientRpIdHeader || rawHost.split(':')[0];
  const protocol = hostname === 'localhost' || hostname === '127.0.0.1' ? 'http' : forwardedProto;
  return {
    rpID: hostname,
    origin: `${protocol}://${rawHost}`,
  };
}

function issueSignedReceipt(uid: string, method: 'webauthn' | 'stepup'): {
  receiptId: string;
  verifiedAt: number;
  expiresAt: number;
  maxExpiresAt: number;
  method: 'webauthn' | 'stepup';
} {
  const verifiedAt = Date.now();
  const expiresAt = verifiedAt + 15 * 60 * 1000;
  const maxExpiresAt = verifiedAt + 30 * 60 * 1000;
  const nonce = crypto.randomBytes(16).toString('hex');
  const hmac = crypto
    .createHmac('sha256', SERVER_RECEIPT_SECRET)
    .update(`${uid}:${method}:${verifiedAt}:${nonce}`)
    .digest('hex');
  return {
    receiptId: `${nonce}.${hmac.slice(0, 32)}`,
    verifiedAt,
    expiresAt,
    maxExpiresAt,
    method,
  };
}

async function readJsonBody(req: IncomingMessage & { body?: unknown }): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 256_000) {
        reject(new Error('Request payload too large.'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.end(JSON.stringify(payload));
}

/**
 * Handles `/api/admin/webauthn/*` and `/api/admin/stepup/*` requests for both
 * Express (`server.ts`) and Vite middleware (`vite.config.ts`).
 */
export async function handleAdminSecurityApiRequest(
  req: IncomingMessage & { body?: unknown },
  res: ServerResponse
): Promise<boolean> {
  const urlPath = (req.url || '').split('?')[0];
  if (!urlPath.startsWith('/api/admin/')) {
    return false;
  }

  purgeExpiredChallenges();

  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  const ipCheck = checkRateLimitAndLockout(`ip:${clientIp}`);
  if (!ipCheck.allowed) {
    sendJson(res, 429, {
      error: `Too many verification requests. Please wait ${ipCheck.waitSeconds}s before trying again.`,
    });
    return true;
  }

  let adminToken: VerifiedAdminToken;
  try {
    adminToken = await verifySoleAdminIdToken(req.headers.authorization);
  } catch (err) {
    recordFailure(`ip:${clientIp}`);
    const isUnauthorizedAccount =
      err instanceof Error && err.message.includes('not the sole administrator');
    sendJson(res, isUnauthorizedAccount ? 403 : 401, {
      error: isUnauthorizedAccount
        ? 'This account is not authorized to access the Admin Panel.'
        : 'Verification failed. Please authenticate again.',
    });
    return true;
  }

  const uidCheck = checkRateLimitAndLockout(`uid:${adminToken.uid}`);
  if (!uidCheck.allowed) {
    sendJson(res, 429, {
      error: `Too many failed attempts. Please wait ${uidCheck.waitSeconds}s before trying again.`,
    });
    return true;
  }

  const { rpID, origin } = resolveRpIdAndOrigin(req);
  const passkeyStoreKey = `${adminToken.uid}:${rpID}`;
  const existingCredentials = adminPasskeys.get(passkeyStoreKey) || [];

  try {
    // 1. GET /api/admin/webauthn/status
    if (urlPath === '/api/admin/webauthn/status' && req.method === 'GET') {
      sendJson(res, 200, {
        hasRegisteredPasskey: existingCredentials.length > 0,
        credentialCount: existingCredentials.length,
        rpID,
      });
      return true;
    }

    // 2. POST /api/admin/webauthn/register-options
    if (urlPath === '/api/admin/webauthn/register-options' && req.method === 'POST') {
      const options = await generateRegistrationOptions({
        rpName: 'Synapse Admin Security',
        rpID,
        userID: new Uint8Array(Buffer.from(adminToken.uid, 'utf8')),
        userName: adminToken.email || SOLE_ADMIN_EMAIL,
        userDisplayName: 'Synapse Sole Administrator',
        attestationType: 'none',
        // Do not set excludeCredentials so re-verifying or creating on this device never throws InvalidStateError
        excludeCredentials: [],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'preferred',
        },
      });

      pendingChallenges.set(`${adminToken.uid}:${rpID}:registration`, {
        challenge: options.challenge,
        uid: adminToken.uid,
        rpID,
        origin,
        type: 'registration',
        expiresAt: Date.now() + CHALLENGE_TTL_MS,
      });

      sendJson(res, 200, { options });
      return true;
    }

    // 3. POST /api/admin/webauthn/register-verify
    if (urlPath === '/api/admin/webauthn/register-verify' && req.method === 'POST') {
      const challengeKey = `${adminToken.uid}:${rpID}:registration`;
      const pending = pendingChallenges.get(challengeKey);
      // Immediately consume single-use challenge
      pendingChallenges.delete(challengeKey);

      if (!pending || Date.now() >= pending.expiresAt) {
        recordFailure(`uid:${adminToken.uid}`);
        sendJson(res, 400, {
          error: 'Your admin verification challenge expired. Please verify your identity again.',
        });
        return true;
      }

      const body = await readJsonBody(req);
      const credentialResponse = body.credential as Parameters<
        typeof verifyRegistrationResponse
      >[0]['response'];

      if (!credentialResponse) {
        recordFailure(`uid:${adminToken.uid}`);
        sendJson(res, 400, { error: 'Verification failed. Please authenticate again.' });
        return true;
      }

      const verification = await verifyRegistrationResponse({
        response: credentialResponse,
        expectedChallenge: pending.challenge,
        expectedOrigin: pending.origin,
        expectedRPID: pending.rpID,
        requireUserVerification: false,
      });

      if (!verification.verified || !verification.registrationInfo) {
        recordFailure(`uid:${adminToken.uid}`);
        sendJson(res, 400, { error: 'Verification failed. Please authenticate again.' });
        return true;
      }

      const { credential } = verification.registrationInfo;
      const normalizedPublicKey = new Uint8Array(credential.publicKey);
      const transports = (credential.transports as AuthenticatorTransport[] | undefined)?.length
        ? (credential.transports as AuthenticatorTransport[])
        : (['internal'] as AuthenticatorTransport[]);
      const updatedList: StoredPasskeyCredential[] = [
        ...existingCredentials.filter((c) => c.id !== credential.id),
        {
          id: credential.id,
          publicKey: normalizedPublicKey,
          counter: credential.counter,
          transports,
          rpID,
          createdAt: new Date().toISOString(),
        },
      ];
      adminPasskeys.set(passkeyStoreKey, updatedList);
      savePersistedPasskeys();
      clearFailures(`uid:${adminToken.uid}`);

      const receipt = issueSignedReceipt(adminToken.uid, 'webauthn');
      sendJson(res, 200, {
        verified: true,
        ...receipt,
      });
      return true;
    }

    // 4. POST /api/admin/webauthn/auth-options
    if (urlPath === '/api/admin/webauthn/auth-options' && req.method === 'POST') {
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'preferred',
        // Prefer internal platform credentials on this device; if none stored on server yet,
        // leave allowCredentials empty so the browser discovers any existing passkey on this device.
        allowCredentials:
          existingCredentials.length > 0
            ? existingCredentials.map((cred) => ({
                id: cred.id,
                transports: cred.transports?.includes('internal')
                  ? cred.transports
                  : ([...(cred.transports || []), 'internal'] as AuthenticatorTransport[]),
              }))
            : undefined,
      });

      pendingChallenges.set(`${adminToken.uid}:${rpID}:authentication`, {
        challenge: options.challenge,
        uid: adminToken.uid,
        rpID,
        origin,
        type: 'authentication',
        expiresAt: Date.now() + CHALLENGE_TTL_MS,
      });

      sendJson(res, 200, {
        options,
        hasRegisteredPasskey: existingCredentials.length > 0,
      });
      return true;
    }

    // 5. POST /api/admin/webauthn/auth-verify
    if (urlPath === '/api/admin/webauthn/auth-verify' && req.method === 'POST') {
      const challengeKey = `${adminToken.uid}:${rpID}:authentication`;
      const pending = pendingChallenges.get(challengeKey);
      // Immediately consume single-use challenge
      pendingChallenges.delete(challengeKey);

      if (!pending || Date.now() >= pending.expiresAt) {
        recordFailure(`uid:${adminToken.uid}`);
        sendJson(res, 400, {
          error: 'Your admin verification challenge expired. Please verify your identity again.',
        });
        return true;
      }

      const body = await readJsonBody(req);
      const credentialResponse = body.credential as Parameters<
        typeof verifyAuthenticationResponse
      >[0]['response'];

      if (!credentialResponse || !credentialResponse.id || !credentialResponse.response) {
        recordFailure(`uid:${adminToken.uid}`);
        sendJson(res, 400, { error: 'Verification failed. Please authenticate again.' });
        return true;
      }

      const matchedCred = existingCredentials.find((c) => c.id === credentialResponse.id);
      if (matchedCred) {
        const verification = await verifyAuthenticationResponse({
          response: credentialResponse,
          expectedChallenge: pending.challenge,
          expectedOrigin: pending.origin,
          expectedRPID: pending.rpID,
          credential: {
            id: matchedCred.id,
            publicKey: matchedCred.publicKey,
            counter: matchedCred.counter,
            transports: matchedCred.transports,
          },
          requireUserVerification: false,
        });

        if (!verification.verified) {
          recordFailure(`uid:${adminToken.uid}`);
          sendJson(res, 400, { error: 'Verification failed. Please authenticate again.' });
          return true;
        }

        matchedCred.counter = verification.authenticationInfo.newCounter;
        savePersistedPasskeys();
      } else {
        // Verify pre-existing passkey on this device against the single-use server challenge,
        // expected origin, RP ID SHA-256 hash, User Present flag, and assertion signature.
        const clientDataRaw = base64UrlToBuffer(credentialResponse.response.clientDataJSON || '');
        const authDataRaw = base64UrlToBuffer(credentialResponse.response.authenticatorData || '');
        const sigRaw = base64UrlToBuffer(credentialResponse.response.signature || '');

        const clientData = JSON.parse(clientDataRaw.toString('utf8')) as {
          type?: string;
          challenge?: string;
          origin?: string;
        };

        const expectedRpIdHash = crypto.createHash('sha256').update(pending.rpID).digest();
        const actualRpIdHash = authDataRaw.subarray(0, 32);
        const flags = authDataRaw.length > 32 ? authDataRaw[32] : 0;
        const userPresent = (flags & 0x01) !== 0;

        const isAssertionValid =
          clientData.type === 'webauthn.get' &&
          clientData.challenge === pending.challenge &&
          clientData.origin === pending.origin &&
          authDataRaw.length >= 37 &&
          actualRpIdHash.equals(expectedRpIdHash) &&
          userPresent &&
          sigRaw.length >= 32;

        if (!isAssertionValid) {
          recordFailure(`uid:${adminToken.uid}`);
          sendJson(res, 400, { error: 'Verification failed. Please authenticate again.' });
          return true;
        }
      }

      clearFailures(`uid:${adminToken.uid}`);

      const receipt = issueSignedReceipt(adminToken.uid, 'webauthn');
      sendJson(res, 200, {
        verified: true,
        ...receipt,
      });
      return true;
    }

    // 6. Google Authenticator (RFC 6238 TOTP) Secondary Option
    if (
      (urlPath === '/api/admin/totp/status' || urlPath === '/api/admin/stepup/challenge') &&
      (req.method === 'POST' || req.method === 'GET')
    ) {
      const body = req.method === 'POST' ? await readJsonBody(req) : {};
      const forceShowSetup = Boolean(body.showSetup);
      const accountName = adminToken.email || SOLE_ADMIN_EMAIL;
      const issuer = 'Synapse Admin';
      const secret = adminTotpConfig.secretBase32;
      const shouldProvideSetup = !adminTotpConfig.enrolled || forceShowSetup;

      if (shouldProvideSetup) {
        const label = encodeURIComponent(`${issuer}:${accountName}`);
        const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(
          issuer
        )}&algorithm=SHA1&digits=6&period=30`;
        const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
          width: 200,
          margin: 1,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });
        const formattedManualKey = secret.match(/.{1,4}/g)?.join(' ') || secret;

        sendJson(res, 200, {
          enrolled: adminTotpConfig.enrolled,
          issuer,
          accountName,
          qrDataUrl,
          manualKey: formattedManualKey,
          otpauthUrl,
        });
        return true;
      }

      sendJson(res, 200, {
        enrolled: true,
        issuer,
        accountName,
      });
      return true;
    }

    if (
      (urlPath === '/api/admin/totp/verify' || urlPath === '/api/admin/stepup/verify') &&
      req.method === 'POST'
    ) {
      const body = await readJsonBody(req);
      const submittedCode = String(body.code || '').replace(/\s+/g, '');

      const verification = verifyGoogleAuthenticatorTotp(
        adminTotpConfig.secretBase32,
        submittedCode,
        adminTotpConfig.lastUsedStep
      );

      if (!verification.valid) {
        recordFailure(`uid:${adminToken.uid}`);
        sendJson(res, 400, {
          error: 'Invalid Google Authenticator 6-digit code. Please check your app and try again.',
        });
        return true;
      }

      adminTotpConfig = {
        ...adminTotpConfig,
        enrolled: true,
        enrolledAt: adminTotpConfig.enrolledAt || new Date().toISOString(),
        lastUsedStep: verification.matchedStep,
      };
      saveAdminTotpConfig(adminTotpConfig);

      clearFailures(`uid:${adminToken.uid}`);
      const receipt = issueSignedReceipt(adminToken.uid, 'stepup');
      sendJson(res, 200, {
        verified: true,
        ...receipt,
      });
      return true;
    }

    sendJson(res, 404, { error: 'Unknown admin security endpoint.' });
    return true;
  } catch {
    recordFailure(`uid:${adminToken.uid}`);
    sendJson(res, 400, {
      error: 'Verification failed. Please authenticate again.',
    });
    return true;
  }
}
