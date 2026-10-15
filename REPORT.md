# Synapse — Complete Platform, Admin Security, Biometric Passkey & 2FA Audit Report

**Date:** October 2, 2026  
**Database:** `ai-studio-217e3490-8920-49a9-8b94-79ae87bb9ed8`  
**GitHub Repository:** `https://github.com/cardboardboxmask/synapse` (`main` branch)  
**Sole Administrator:** `cardboardboxmask@gmail.com` (`kETq37KlCWR7k3MqSCa14zszoA22`)

---

## 1. Executive Summary of Completed Work

### 1.1 Sole-Owner Administrator Lock ("No One Other Than Me Can Be Admin")
- **Hardcoded Multi-Layer Enforcement**:
  - **Firestore Security Rules (`firestore.rules`)**: `isOwnerAdminAccount()` and `isAdmin()` verify that `request.auth.uid == 'kETq37KlCWR7k3MqSCa14zszoA22'` or `(request.auth.token.email == 'cardboardboxmask@gmail.com' && request.auth.token.email_verified == true)`.
  - **Admin Collection Lockdown (`/admins/{userId}`)**: Creation and updates are restricted exclusively to `userId == 'kETq37KlCWR7k3MqSCa14zszoA22'` by `isOwnerAdminAccount()`, and deletions are permanently disabled (`allow delete: if false;`).
  - **Client & Server Enforcement (`src/firebase.ts`, `src/utils/adminWebAuthnServer.ts`)**: Both client authorization checks and server-side Google X.509 RS256 JWT verification reject any account other than `cardboardboxmask@gmail.com` (`kETq37KlCWR7k3MqSCa14zszoA22`).
  - **UI Hardening (`src/pages/AdminReportsPage.tsx`)**: Replaced the legacy "Grant Admin" form with a read-only **Sole Owner Admin Lock** status card.

### 1.2 3-Stage Admin Route Guard & Two-Step Security Gate (`AdminRouteGuard` + `AdminSecurityLock`)
All admin routes (`/admin`, `/admin/reports`, `/admin/security-check`) are wrapped in `<AdminRouteGuard>`, enforcing three sequential checks:
1. **Check 1 — Firebase Authentication**:
   - Unauthenticated visitors are redirected to `/login?returnTo=/admin`.
2. **Check 2 — Sole-Admin Authorization (403 Access Denied)**:
   - Signed-in non-admin or suspended accounts are blocked with a `403 · Access Denied` screen (`This account is not authorized to access the Admin Panel.`) and logged to `/auditLogs` (`admin.panel.access_denied`).
3. **Check 3 — Fresh Account Re-Authentication + Device Biometric / Passkey or Google Authenticator 2FA (`AdminSecurityLock`)**:
   - **Step 1 · Fresh Firebase Account Re-Authentication**:
     - Automatically detects linked Firebase Auth providers (`getAdminAuthProviders`) and runs `reauthenticateWithPopup(user, GoogleAuthProvider)` (with `prompt: 'select_account'`) or `reauthenticateWithCredential` for password accounts, followed by `user.getIdToken(true)` to obtain a fresh RS256 ID token.
   - **Step 2A · Device Biometric / Passkey on This Device (WebAuthn)**:
     - Uses `@simplewebauthn/browser` (`startAuthentication` / `startRegistration`) and `@simplewebauthn/server` (`verifyAuthenticationResponse` / `verifyRegistrationResponse`) on `/api/admin/webauthn/*`.
     - Explicitly forwards `X-Client-Origin` and `X-Client-RpId` headers so the Relying Party ID (`rpID`) and origin always match the browser tab domain across proxies.
     - Configures `authenticatorAttachment: 'platform'` and `userVerification: 'preferred'` to trigger **this device's** built-in fingerprint, Face ID, Touch ID, Windows Hello, or screen-lock passkey, and persists registered passkeys in `.admin-passkeys.json`.
     - Provides a one-click **"Open in Full Browser Tab to Use Biometric Passkey"** helper when running inside an embedded preview iframe where browser security restricts `PublicKeyCredential`.
   - **Step 2B · Google Authenticator 6-Digit TOTP (`RFC 6238`)**:
     - Replaces static on-screen challenge codes with genuine **Google Authenticator** 2FA (`/api/admin/totp/status` and `/api/admin/totp/verify`).
     - Generates a deterministic 160-bit Base32 secret (`HMAC-SHA256` derived for the sole admin) and renders a scannable `otpauth://totp/...` **QR Code** (`qrcode`) plus copyable **Base32 Setup Key** on first setup.
     - Verifies 6-digit `SHA1` 30-second TOTP codes using `crypto.timingSafeEqual` with `±1` window clock-drift tolerance and replay protection (`lastUsedStep` persisted in `.admin-totp.json`).

### 1.3 Volatile Admin Session, Auto-Expiration & Brute-Force Protection
- **Zero Client Storage Persistence**:
  - `adminReauth` state lives strictly in React volatile memory (`AppContext`) — never written to `localStorage`, `sessionStorage`, cookies, or Firestore. Refreshing or closing the tab immediately locks the Admin Panel.
- **Session Timeouts & Freshness Windows (`src/config/adminSecurity.ts`)**:
  - **Inactivity Timeout**: Auto-locks after **15 minutes** of inactivity (`INACTIVITY_TIMEOUT_MS`).
  - **Max Session Lifetime**: Auto-locks **30 minutes** after verification (`MAX_SESSION_LIFETIME_MS`).
  - **Destructive Action Freshness**: Deleting ideas or suspending/reinstating users requires verification within the last **5 minutes** (`DESTRUCTIVE_ACTION_FRESH_WINDOW_MS`).
  - **Manual Lock**: Dedicated **🔒 Lock Admin Panel** button in the Admin Panel header immediately clears the in-memory session.
- **Brute-Force Rate Limiting**:
  - Both client (`src/config/adminSecurity.ts`) and server (`src/utils/adminWebAuthnServer.ts`) enforce a **60-second lockout** after **5 failed verification attempts**.

### 1.4 Admin Capabilities, Moderation & Platform Features
- **Admin Verified Badge**: Sole admin can verify or unverify ideas (`idea.verify_change`) and user profiles (`adminVerified`), displaying a verified badge across specification cards and maker profiles.
- **Account Suspension & Status Enforcement**: Sole admin can suspend or reinstate users (`account.suspend_change`). Suspended users are blocked from all write operations across Firestore via `isNotSuspended()`.
- **Core Synapse Platform**:
  - **Two Collaboration Tracks**: `Needs Guidance` (`guidance`) and `Needs a Builder` (`builder`) with explicit creator licensing (`all-rights-kept`, `cc-by`, `mit`).
  - **4-Step Specification Wizard (`/post/:step`)**: Real-time similarity check, magic-byte validated image/diagram uploads (`JPEG`, `PNG`, `WebP`), and schema-versioned (`v2`) `localStorage` draft auto-save.
  - **2D Constellation Graph & Connections Governance (`/connections`)**: Interactive SVG graph and structured list view where only the sole Admin or connected idea owners can activate, decline, or remove connections, backed by an Admin Activity Log with User ID and Date Range filters.
  - **Global Search Bar (`⌘K` / `Ctrl+K`)**: Real-time categorized search across **Ideas**, **Projects**, and **Users** (`@username`).
  - **Mobile Navigation**: Direct **Admin Panel** access in both the mobile top bar and mobile drawer for the sole administrator.

---

## 2. Complete Route Map

| Route | Component | Access & Capabilities |
| :--- | :--- | :--- |
| `/` | `HomePage.tsx` | Hero overview, live community counters, track explainer, featured specifications, and built showcase highlights. |
| `/explore` | `ExplorePage.tsx` | Multi-field search, category/track/status/license/tag filters, sorting, and cursor pagination. |
| `/post/:step` | `PostWizardPage.tsx` | 4-step specification wizard (`/post/basics`, `/post/problem`, `/post/help`, `/post/review`) with draft auto-save. |
| `/ideas/:id/*` | `IdeaDetailPage.tsx` | Specification overview, responses, volunteer queue, cross-idea connections, owner/admin editor, and revision history. |
| `/connections` | `ConnectionsPage.tsx` | Tab 1: Active Connections list & 2D SVG Constellation Map. Tab 2: Admin Connection Activity Log with User ID & Date filters. |
| `/showcase` | `ShowcasePage.tsx` | Gallery of specifications that reached `built` status with live URLs and maker credits. |
| `/u/:username` | `LoginProfilePage.tsx` | Public maker portfolio resolving `@username` handles (and UIDs) with authored specs and built projects. |
| `/login` & `/profile` | `LoginProfilePage.tsx` | Google Sign-In, profile & `@username` editor, saved bookmarks with notes, notification preferences, and account deletion. |
| `/notifications` | `NotificationsPage.tsx` | Real-time inbox for responses, volunteer offers, connections, and status updates. |
| `/about` & `/support` | `AboutSupportPage.tsx` | Creator Ownership Charter, Code of Conduct, security architecture, and non-profit transparency. |
| `/admin`, `/admin/reports`, `/admin/security-check` | `AdminRouteGuard.tsx` + `AdminReportsPage.tsx` | Protected by 3-stage `AdminRouteGuard` & `AdminSecurityLock` (Step 1 Firebase Re-Auth + Step 2 Device Passkey or Google Authenticator 2FA). |

---

## 3. Key Security & Architecture Files

| File | Role |
| :--- | :--- |
| `src/config/adminSecurity.ts` | Timeout constants (`15m` inactivity, `30m` max session, `5m` destructive window) and client brute-force lockout (`5` failures → `60s` cooldown). |
| `src/utils/adminWebAuthnServer.ts` | Server-side Google X.509 RS256 Firebase token verifier, `@simplewebauthn/server` passkey registration/authentication endpoints, `.admin-passkeys.json` persistence, and RFC 6238 Google Authenticator TOTP generator/verifier (`qrcode` + `.admin-totp.json`). |
| `src/utils/adminWebAuthnClient.ts` | Browser WebAuthn client (`@simplewebauthn/browser`) with `X-Client-Origin`/`X-Client-RpId` headers, `auto`/`authenticate`/`register` passkey modes, iframe detection, and Google Authenticator client helpers. |
| `src/components/AdminRouteGuard.tsx` | 3-stage `AdminRouteGuard` and `AdminSecurityLock` component (Step 1 Google/Password Re-auth + Step 2 Biometric Passkey on This Device or Google Authenticator 6-digit TOTP). |
| `src/context/AppContext.tsx` | Volatile in-memory `adminReauth` session state, 1-second expiration watcher, and automatic lock on sign-out, account change, suspension, or timeout. |
| `src/pages/AdminReportsPage.tsx` | Admin Control Panel with **🔒 Lock Admin Panel** button, live session timer, 5-minute destructive action freshness guard, moderation queue, user directory, audit log viewer, and Markdown report download. |
| `firestore.rules` | Hardened Firestore security rules enforcing `isOwnerAdminAccount()`, `isNotSuspended()`, single-step counter transactions, and `isValidAuditLog()`. |
| `scripts/verify-admin-security.ts` | 10-point automated security and Firestore rules verification suite (`npm run test:security`). |

---

## 4. Security Audit Events Logged (`/auditLogs`)

All security events strip sensitive fields (`password`, `token`, `secret`, `privateKey`, `credential`, `assertion`, `clientDataJSON`, `authenticatorData`, `signature`, `totp`) before logging:
- `admin.reauth.success` — Step 1 Firebase re-authentication or Step 2 Google Authenticator TOTP verified
- `admin.reauth.failure` — Step 1 re-authentication or Step 2 Google Authenticator TOTP failed
- `admin.webauthn.success` — Step 2 WebAuthn biometric/passkey registered or verified on this device
- `admin.webauthn.failure` — Step 2 WebAuthn prompt failed, cancelled, or blocked by embedded iframe policy
- `admin.panel.lock` — Manual lock via **🔒 Lock Admin Panel**
- `admin.panel.timeout` — Automatic lock due to 15-minute inactivity or 30-minute max session lifetime
- `admin.panel.access_denied` — Unauthorized account attempted to visit an `/admin*` route

---

## 5. Verification, Build & Deployment Status

| Check | Result | Status |
| :--- | :--- | :--- |
| **Sole-Owner Admin Lock** | Locked exclusively to `cardboardboxmask@gmail.com` (`kETq37KlCWR7k3MqSCa14zszoA22`) in `firestore.rules`, `src/firebase.ts`, and `src/utils/adminWebAuthnServer.ts`. | **PASSED** |
| **Device Passkey (`WebAuthn`)** | Targets this device's platform authenticator (`authenticatorAttachment: 'platform'`), syncs `X-Client-Origin`/`X-Client-RpId`, and persists credentials in `.admin-passkeys.json`. | **PASSED** |
| **Google Authenticator (`RFC 6238 TOTP`)** | Generates scannable QR code + Base32 setup key and verifies 6-digit 30s TOTP codes with timing-safe comparison and replay protection. | **PASSED** |
| **TypeScript Check (`npm run lint`)** | `tsc --noEmit` completed with `0` errors. | **PASSED** |
| **Production Build (`npm run build`)** | Vite production bundle compiled cleanly with `0` errors. | **PASSED** |
| **Automated Security Suite (`npm run test:security`)** | `10 / 10` security assertions passed. | **PASSED** |
| **Firestore Security Rules** | Deployed to `ai-studio-217e3490-8920-49a9-8b94-79ae87bb9ed8`. | **DEPLOYED** |
| **GitHub Repository Sync** | Committed and pushed to `https://github.com/cardboardboxmask/synapse` (`main` branch, commit `82df1ae`), with `dev-dist/`, `.admin-passkeys.json`, and `.admin-totp.json` ignored in `.gitignore`. | **PUSHED** |
