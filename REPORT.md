# Synapse — Admin Panel Security, Biometric Verification & Platform Audit Report

**Date:** September 29, 2026  
**Database:** `ai-studio-217e3490-8920-49a9-8b94-79ae87bb9ed8`  
**Sole Administrator:** `cardboardboxmask@gmail.com` (`kETq37KlCWR7k3MqSCa14zszoA22`)

---

## 1. Executive Summary of Completed Work

1. **Sole-Owner Admin Lock ("No One Other Than Me Can Be Admin")**:
   - Hardcoded and enforced at both the Firestore Security Rules layer (`firestore.rules`) and application layer (`src/firebase.ts`, `src/context/AppContext.tsx`) so that **only** `cardboardboxmask@gmail.com` (UID `kETq37KlCWR7k3MqSCa14zszoA22` with `email_verified == true`) can hold or exercise administrator privileges.
   - Blocked creation, modification, or deletion of any other document in `/admins/{userId}` (`allow create, update: if isOwnerAdminAccount() && userId == 'kETq37KlCWR7k3MqSCa14zszoA22'; allow delete: if false;`).
   - Removed the "Grant Admin" form from the UI and replaced it with a **Sole Owner Admin Lock** status card.

2. **3-Stage Admin Route Guard & Biometric / Passkey Security Upgrade (`AdminRouteGuard` + `AdminSecurityLock`)**:
   - Wrapped `/admin`, `/admin/reports`, and `/admin/security-check` in `<AdminRouteGuard>`.
   - **Check 1 — Firebase Authentication**: Unauthenticated visitors are redirected to `/login?returnTo=/admin`.
   - **Check 2 — Sole-Admin Authorization**: Signed-in non-admin or suspended users receive a `403 Access Denied` screen (`This account is not authorized to access the Admin Panel.`) and trigger an `admin.panel.access_denied` audit log entry.
   - **Check 3 — Fresh Account Re-Authentication + Device Biometric / Passkey (`AdminSecurityLock`)**:
     - **Step 1 (Account Re-authentication)**: Automatically detects the admin's linked Firebase Auth provider (`google.com` vs `password`) and runs `reauthenticateWithPopup` or `reauthenticateWithCredential`, followed by `getIdToken(true)` refresh.
     - **Step 2 (Device Biometric / Passkey Verification)**: Uses `@simplewebauthn/browser` (`startRegistration` / `startAuthentication`) and `@simplewebauthn/server` (`verifyRegistrationResponse` / `verifyAuthenticationResponse`) on `/api/admin/webauthn/*` endpoints after cryptographically verifying the caller's Firebase ID Token against Google SecureToken X.509 certificates. Includes a single-use 120-second server step-up challenge fallback when hardware/iframe WebAuthn is unavailable.

3. **Volatile Admin Session & Automatic Lock Controls**:
   - Stored strictly in React volatile memory (`AppContext`) — never persisted to `localStorage`, `sessionStorage`, or Firestore.
   - **Inactivity Timeout**: Automatically locks after **15 minutes** of inactivity (`ADMIN_SECURITY_CONFIG.INACTIVITY_TIMEOUT_MS`).
   - **Max Session Lifetime**: Automatically locks **30 minutes** after verification (`ADMIN_SECURITY_CONFIG.MAX_SESSION_LIFETIME_MS`).
   - **Destructive Action Freshness**: Deleting ideas or suspending/reinstating users requires verification within the last **5 minutes** (`ADMIN_SECURITY_CONFIG.DESTRUCTIVE_ACTION_FRESH_WINDOW_MS`); otherwise, the admin is prompted to re-verify first.
   - **Manual Lock**: Added a **🔒 Lock Admin Panel** button in the Admin Panel header that immediately clears the session and returns to `AdminSecurityLock`.
   - **Brute-Force Rate Limiting**: 5 failed verification attempts trigger a **60-second** cooldown timer.

4. **Admin Verified Badge, User Suspension & Mobile Navigation**:
   - **Admin Verified Badge**: Sole admin can verify/unverify ideas (`idea.verify_change`) and user profiles (`adminVerified`), displaying a trusted verification badge across cards and profiles.
   - **User Suspension**: Sole admin can suspend or reinstate accounts (`account.suspend_change`), enforced server-side in `firestore.rules` via `isNotSuspended()`.
   - **Mobile Admin Access**: Added direct **Admin Panel** navigation inside the mobile header and mobile menu drawer when signed in as the sole administrator.

---

## 2. Files Created & Modified

| File | Status | Description |
| :--- | :--- | :--- |
| `src/config/adminSecurity.ts` | Created | Configurable timeout policy (`15m` inactivity, `30m` max lifetime, `5m` destructive action window) and brute-force rate limiter (`5` failures → `60s` cooldown). |
| `src/utils/adminWebAuthnServer.ts` | Created | Server-side `@simplewebauthn/server` registration & authentication verification, Google X.509 RS256 Firebase ID Token verification, and single-use 120s challenges. |
| `src/utils/adminWebAuthnClient.ts` | Created | Client-side `@simplewebauthn/browser` passkey registration/authentication helpers and server step-up challenge client. |
| `src/components/AdminRouteGuard.tsx` | Created | 3-stage `AdminRouteGuard` and `AdminSecurityLock` UI with Step 1 (Firebase Re-auth) and Step 2 (WebAuthn Biometric/Passkey). |
| `src/context/AppContext.tsx` | Modified | Volatile in-memory `adminReauth` session state, automatic expiration ticker, and immediate lock on sign-out, account switch, suspension, or manual lock. |
| `src/firebase.ts` | Modified | Sole-owner admin check (`checkIsAdmin`), provider detection (`getAdminAuthProviders`), fresh re-authentication helpers, and sanitized audit logging (`logAdminSecurityAuditEvent`). |
| `src/pages/AdminReportsPage.tsx` | Modified | Added **🔒 Lock Admin Panel** button, live session countdown badge, 5-minute destructive action freshness guard, Sole-Owner Admin Lock card, and Markdown report download button. |
| `src/App.tsx` | Modified | Wrapped `/admin`, `/admin/reports`, and `/admin/security-check` routes in `<AdminRouteGuard>`. |
| `server.ts` & `vite.config.ts` | Modified | Mounted `/api/admin/*` WebAuthn endpoints and updated `Permissions-Policy` header to allow `publickey-credentials-get=(self), publickey-credentials-create=(self)`. |
| `firestore.rules` & `firebase-blueprint.json` | Modified | Enforced sole-owner admin rule (`isOwnerAdminAccount()`), `isNotSuspended()`, and admin security audit event validation (`isValidAuditLog`). |
| `scripts/verify-admin-security.ts` | Created | Automated 10-point security & Firestore rules verification suite (`npm run test:security`). |

---

## 3. Dependencies Added / Removed

- **Added**: `@simplewebauthn/server`, `@simplewebauthn/browser`
- **Removed**: None

---

## 4. Security Audit Events Logged (`/auditLogs`)

All events are sanitized (no passwords, raw tokens, or credential private keys are ever logged) and validated by `firestore.rules`:
- `admin.reauth.success`
- `admin.reauth.failure`
- `admin.webauthn.success`
- `admin.webauthn.failure`
- `admin.panel.lock`
- `admin.panel.timeout`
- `admin.panel.access_denied`

---

## 5. Issue & Verification Audit

| Check / Issue Audited | Resolution / Verification Details | Status |
| :--- | :--- | :--- |
| **Sole-Owner Admin Enforcement** | Restricted `isAdmin()` in `firestore.rules` and `checkIsAdmin()` in `src/firebase.ts` exclusively to `cardboardboxmask@gmail.com` (`kETq37KlCWR7k3MqSCa14zszoA22`). Blocked creation/updates of any other `/admins/{uid}` doc. | **RESOLVED** |
| **Bypassing Admin Lock via Refresh or Direct URL** | `adminReauth` is held strictly in React volatile memory (`AppContext`). Refreshing or navigating directly to `/admin` or `/admin/reports` always enforces `AdminSecurityLock`. | **RESOLVED** |
| **Client-Only Biometric Bypass Risk** | WebAuthn challenges are generated and verified server-side via `@simplewebauthn/server` on `/api/admin/webauthn/*` after verifying the caller's Firebase ID Token signature against Google's SecureToken certificates. | **RESOLVED** |
| **Google Sign-In vs Password Re-Auth Mismatch** | `getAdminAuthProviders()` inspects `user.providerData` and presents Google popup re-authentication (`reauthenticateWithPopup`) for Google accounts and password re-authentication (`reauthenticateWithCredential`) when a password provider is linked. | **RESOLVED** |
| **Suspended User Write Bypass** | Enforced `isNotSuspended()` server-side across `ideas`, `responses`, `volunteers`, `connections`, and `reports` rules in `firestore.rules`. | **RESOLVED** |
| **TypeScript Typecheck (`npm run lint`)** | `tsc --noEmit` completed with `0` errors. | **PASSED** |
| **Production Build (`npm run build`)** | Vite production bundle built cleanly with `0` errors. | **PASSED** |
| **Automated Security Suite (`npm run test:security`)** | `10 / 10` security assertions passed. | **PASSED** |
| **Firestore Rules Deployment** | Deployed `firestore.rules` to `ai-studio-217e3490-8920-49a9-8b94-79ae87bb9ed8` (please review rules in the Firebase Console before broad public sharing). | **DEPLOYED** |
