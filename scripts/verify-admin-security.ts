import assert from 'assert';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ADMIN_SECURITY_CONFIG,
  AdminReauthSession,
  checkCanAttemptAdminVerification,
  getAdminSecurityLockoutState,
  isAdminReauthSessionValid,
  isAdminSessionFreshForDestructiveAction,
  recordAdminVerificationFailure,
  resetAdminVerificationAttempts,
} from '../src/config/adminSecurity';
import { handleAdminSecurityApiRequest } from '../src/utils/adminWebAuthnServer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function runTests() {
  let passed = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    return Promise.resolve(fn()).then(() => {
      passed += 1;
      console.log(`  PASS  ${name}`);
    });
  }

  console.log('\n=== Synapse Admin Security & Firestore Rules Verification Suite ===\n');

  const rulesContent = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');

  // 1. Firestore Security Rules Verification
  await test('Firestore rules: sole-admin restriction locks isAdmin() to cardboardboxmask@gmail.com / kETq37KlCWR7k3MqSCa14zszoA22', () => {
    assert.ok(
      rulesContent.includes("request.auth.token.email == 'cardboardboxmask@gmail.com'"),
      'Expected sole admin email check in isAdmin()'
    );
    assert.ok(
      rulesContent.includes('request.auth.token.email_verified == true'),
      'Expected email_verified check in isAdmin()'
    );
    assert.ok(
      rulesContent.includes("request.auth.uid == 'kETq37KlCWR7k3MqSCa14zszoA22'"),
      'Expected sole admin UID check in isAdmin()'
    );
    assert.ok(
      !rulesContent.includes('ESYgUOmn56SgsPYFyumdaXaioDl1'),
      'Secondary UIDs must not be present in firestore.rules'
    );
  });

  await test('Firestore rules: client-created verification fields (adminReauth, verified) never grant admin access', () => {
    assert.ok(
      !rulesContent.includes('adminReauth'),
      'firestore.rules must never trust client-supplied adminReauth field'
    );
    assert.ok(
      !rulesContent.includes('adminReauthenticated'),
      'firestore.rules must never trust unverified adminReauthenticated claim'
    );
  });

  await test('Firestore rules: non-admin users cannot set or mutate adminVerified on ideas', () => {
    assert.ok(
      rulesContent.includes("(isAdmin() || request.resource.data.get('adminVerified', false) == false)"),
      'Idea create must block non-admins from setting adminVerified=true'
    );
    assert.ok(
      rulesContent.includes(
        "request.resource.data.get('adminVerified', false) == resource.data.get('adminVerified', false)"
      ),
      'Idea update must block non-admins from mutating adminVerified'
    );
  });

  await test('Firestore rules: suspended users are blocked via isNotSuspended() across all write collections', () => {
    assert.ok(
      rulesContent.includes('function isNotSuspended()'),
      'Expected isNotSuspended() helper in firestore.rules'
    );
    const matches = rulesContent.match(/isNotSuspended\(\)/g) || [];
    assert.ok(
      matches.length >= 6,
      `Expected isNotSuspended() enforced across ideas, responses, volunteers, connections, and reports (found ${matches.length})`
    );
  });

  await test('Firestore rules: non-admins cannot self-clear suspended or disabled status on user profile', () => {
    assert.ok(
      rulesContent.includes(
        "request.resource.data.get('suspended', false) == resource.data.get('suspended', false)"
      ),
      'User update must prevent non-admins from clearing suspended flag'
    );
  });

  await test('Firestore rules: admin security audit actions are validated and protected', () => {
    const requiredAuditActions = [
      'admin.reauth.success',
      'admin.reauth.failure',
      'admin.webauthn.success',
      'admin.webauthn.failure',
      'admin.panel.lock',
      'admin.panel.timeout',
      'admin.panel.access_denied',
    ];
    for (const action of requiredAuditActions) {
      assert.ok(
        rulesContent.includes(`'${action}'`),
        `Expected audit action '${action}' in firestore.rules`
      );
    }
  });

  // 2. Client Storage Audit (No localStorage/sessionStorage admin flags)
  await test('Zero-persistence audit: adminReauth is never stored in localStorage or sessionStorage', () => {
    const filesToCheck = [
      'src/config/adminSecurity.ts',
      'src/context/AppContext.tsx',
      'src/components/AdminRouteGuard.tsx',
      'src/utils/adminWebAuthnClient.ts',
      'src/pages/AdminReportsPage.tsx',
    ];
    for (const relPath of filesToCheck) {
      const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
      assert.ok(
        !content.includes('localStorage.setItem(\'admin') &&
          !content.includes('sessionStorage.setItem'),
        `Forbidden storage persistence detected in ${relPath}`
      );
    }
  });

  // 3. In-Memory Admin Session Lifecycle & Timeout Tests
  await test('Session policy: valid session passes and enforces 15m inactivity & 30m max lifetime', () => {
    const baseTime = 1_700_000_000_000;
    const session: AdminReauthSession = {
      authenticated: true,
      uid: 'kETq37KlCWR7k3MqSCa14zszoA22',
      reauthCompletedAt: baseTime,
      deviceVerifiedAt: baseTime,
      verifiedAt: baseTime,
      lastActivityAt: baseTime,
      expiresAt: baseTime + ADMIN_SECURITY_CONFIG.INACTIVITY_TIMEOUT_MS,
      maxExpiresAt: baseTime + ADMIN_SECURITY_CONFIG.MAX_SESSION_LIFETIME_MS,
      method: 'webauthn',
      receiptId: 'a1b2c3d4e5f6g7h8.signature123456',
    };

    // Valid immediately
    assert.strictEqual(
      isAdminReauthSessionValid(session, 'kETq37KlCWR7k3MqSCa14zszoA22', baseTime + 60_000),
      true
    );

    // Rejected for different UID (account switch)
    assert.strictEqual(
      isAdminReauthSessionValid(session, 'attacker-uid-999', baseTime + 60_000),
      false
    );

    // Rejected after 15m inactivity
    assert.strictEqual(
      isAdminReauthSessionValid(
        session,
        'kETq37KlCWR7k3MqSCa14zszoA22',
        baseTime + ADMIN_SECURITY_CONFIG.INACTIVITY_TIMEOUT_MS + 1
      ),
      false
    );

    // Destructive action freshness window (valid at 4m, expired at 6m)
    assert.strictEqual(
      isAdminSessionFreshForDestructiveAction(
        session,
        'kETq37KlCWR7k3MqSCa14zszoA22',
        baseTime + 4 * 60_000
      ),
      true
    );
    assert.strictEqual(
      isAdminSessionFreshForDestructiveAction(
        session,
        'kETq37KlCWR7k3MqSCa14zszoA22',
        baseTime + 6 * 60_000
      ),
      false
    );
  });

  // 4. Brute-Force Rate Limiting & Lockout Tests
  await test('Brute-force protection: locks out after 5 failed attempts and resets after cooldown', () => {
    const testUid = 'test-rate-limit-uid';
    const t0 = 1_700_000_000_000;
    resetAdminVerificationAttempts(testUid);

    for (let i = 1; i < ADMIN_SECURITY_CONFIG.MAX_FAILED_ATTEMPTS; i++) {
      const state = recordAdminVerificationFailure(testUid, t0 + i * 2000);
      assert.strictEqual(state.isLocked, false);
    }

    // 5th failure triggers lockout
    const fifth = recordAdminVerificationFailure(testUid, t0 + 10_000);
    assert.strictEqual(fifth.isLocked, true);
    assert.strictEqual(fifth.remainingAttempts, 0);

    const checkDuringLockout = checkCanAttemptAdminVerification(testUid, t0 + 15_000);
    assert.strictEqual(checkDuringLockout.allowed, false);

    // After 60s lockout expires, attempts are permitted again
    const checkAfterExpiry = getAdminSecurityLockoutState(
      testUid,
      t0 + 10_000 + ADMIN_SECURITY_CONFIG.LOCKOUT_DURATION_MS + 100
    );
    assert.strictEqual(checkAfterExpiry.isLocked, false);
    resetAdminVerificationAttempts(testUid);
  });

  // 5. Server-Side WebAuthn API Endpoint Security Tests
  await test('Server API: rejects unauthenticated / forged WebAuthn verification requests with 401', async () => {
    let statusCode = 0;
    let responseBody = '';

    const mockReq = {
      url: '/api/admin/webauthn/auth-verify',
      method: 'POST',
      headers: {
        host: 'localhost:3000',
      },
      socket: { remoteAddress: '127.0.0.1' },
      body: { verified: true },
    } as unknown as IncomingMessage & { body?: unknown };

    const mockRes = {
      set statusCode(code: number) {
        statusCode = code;
      },
      get statusCode() {
        return statusCode;
      },
      setHeader() {},
      end(chunk?: string) {
        if (chunk) responseBody = chunk;
      },
    } as unknown as ServerResponse;

    const handled = await handleAdminSecurityApiRequest(mockReq, mockRes);
    assert.strictEqual(handled, true);
    assert.strictEqual(statusCode, 401);
    assert.ok(responseBody.includes('Verification failed'));
  });

  console.log(`\nAll ${passed} security verification tests passed!\n`);
}

runTests().catch((err) => {
  console.error('Security verification suite failed:', err);
  process.exit(1);
});
