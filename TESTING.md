# Synapse — Security & Access Control Verification Checklist (`TESTING.md`)

This checklist provides step-by-step manual and DevTools/SDK verification procedures to confirm that Firestore Security Rules (`firestore.rules`) and route guards enforce authorization server-side rather than relying solely on UI visibility.

---

## Prerequisites

Prepare two distinct test accounts (plus a signed-out browser session):
- **Account A (Idea Owner)**: Standard maker account (NOT in `admins/{uid}`).
- **Account B (Second Maker / Attacker)**: A second standard maker account (NOT in `admins/{uid}`).
- **Admin Account (Optional for positive admin comparison)**: A UID whose document `admins/{uid}` exists in the Firebase Console (`{ "role": "admin" }`).

> **Important Note on Admin Access**:
> No hardcoded admin email exists anywhere in client code or `firestore.rules`. Admin status is determined exclusively by `exists(/databases/$(database)/documents/admins/$(request.auth.uid))` in Firestore Security Rules.

---

## Test 1: A Second Account Cannot Edit or Delete the First Account's Idea

### 1A. UI Verification
1. Sign in as **Account A** and publish a test idea via `/post/basics` (or select an idea authored by Account A). Record the `<ideaId>` from the URL `/ideas/<ideaId>`.
2. Sign out and sign in as **Account B**.
3. Navigate to `/ideas/<ideaId>` and `/ideas/<ideaId>/edit`.
4. **Expected UI Result**:
   - The **Edit Spec** and **Delete Idea** controls are hidden on `/ideas/<ideaId>`.
   - Navigating directly to `/ideas/<ideaId>/edit` displays an unauthorized/read-only notice rather than an editable form.

### 1B. Direct Firestore SDK / Rules Verification (Bypassing UI)
While signed in as **Account B**, run the following in the browser DevTools console (or via a test snippet using the active Firebase SDK instance):

```ts
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './src/firebase';

// 1. Attempt to edit Account A's idea title or problem statement
await updateDoc(doc(db, 'ideas', '<ideaId>'), {
  title: 'Tampered Title by Account B',
  updatedAt: new Date().toISOString(),
});
// EXPECTED: FirebaseError: [code=permission-denied]: Missing or insufficient permissions.

// 2. Attempt to delete Account A's idea document
await deleteDoc(doc(db, 'ideas', '<ideaId>'));
// EXPECTED: FirebaseError: [code=permission-denied]: Missing or insufficient permissions.
```

- [ ] **Verified**: `updateDoc` on non-counter fields by Account B is rejected with `permission-denied`.
- [ ] **Verified**: `deleteDoc` on Account A's idea by Account B is rejected with `permission-denied`.

---

## Test 2: A Second Account Cannot Approve Its Own Volunteer Offer

### 2A. Setup & UI Verification
1. Sign in as **Account B** and navigate to `/ideas/<ideaId>/volunteers` (where `<ideaId>` belongs to **Account A**).
2. Submit a volunteer offer (`status: 'pending'`). Note that the volunteer document ID is deterministic: `ideas/<ideaId>/volunteers/<Account_B_UID>`.
3. **Expected UI Result**:
   - **Account B** sees **Edit Offer** and **Withdraw Offer** buttons on their pending card, but **never** sees **Accept** or **Decline** buttons (which are restricted to **Account A**, the idea owner).

### 2B. Direct Firestore SDK / Rules Verification (Bypassing UI)
While still signed in as **Account B**, attempt to self-approve the volunteer offer (`status: 'accepted'`) directly against Firestore:

```ts
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from './src/firebase';

const myUid = auth.currentUser!.uid;
await updateDoc(doc(db, 'ideas', '<ideaId>', 'volunteers', myUid), {
  status: 'accepted',
  updatedAt: new Date().toISOString(),
});
// EXPECTED: FirebaseError: [code=permission-denied]: Missing or insufficient permissions.
```

Why it fails in `firestore.rules`:
- Under `match /ideas/{ideaId}/volunteers/{volunteerId}`, transitioning `status` to `'accepted'` or `'declined'` requires `(isIdeaOwner(ideaId) || isAdmin())`. Self-updates by `isOwner(resource.data.userId)` require `request.resource.data.status == resource.data.status && resource.data.status == 'pending'`.

- [ ] **Verified**: Account B cannot self-approve (`status: 'accepted'`) or decline its own volunteer offer.

---

## Test 3: A Counter Cannot Be Incremented by More Than 1 Per Transaction from Client Code

### 3A. Direct Firestore SDK / Rules Verification
While signed in as **Account B** (a non-owner of `<ideaId>`), attempt to inflate `responseCount`, `volunteerCount`, `connectionCount`, `communityCheckSimilar`, or `communityCheckNew` by `+2` (or `+100`) in a single write or transaction:

```ts
import { doc, runTransaction } from 'firebase/firestore';
import { db } from './src/firebase';

const ideaRef = doc(db, 'ideas', '<ideaId>');

await runTransaction(db, async (tx) => {
  const snap = await tx.get(ideaRef);
  const current = snap.data()?.communityCheckNew || 0;
  tx.update(ideaRef, {
    communityCheckNew: current + 5, // Illegal jump (> 1)
    updatedAt: new Date().toISOString(),
  });
});
// EXPECTED: FirebaseError: [code=permission-denied]: Missing or insufficient permissions.
```

Also test mutating two unrelated counters simultaneously or decrementing below `0`:

```ts
await runTransaction(db, async (tx) => {
  const snap = await tx.get(ideaRef);
  const data = snap.data()!;
  tx.update(ideaRef, {
    responseCount: (data.responseCount || 0) + 10,
    updatedAt: new Date().toISOString(),
  });
});
// EXPECTED: FirebaseError: [code=permission-denied]: Missing or insufficient permissions.
```

Why it fails in `firestore.rules`:
- `isSingleStepCounterTransaction()` enforces `isValidCounterStep(field)` on every counter field (`next >= 0 && (next == prev || next == prev + 1 || next == prev - 1)`) and locks all specification fields (`title`, `summary`, `problem`, `solution`, `authorId`, `status`, `licenseType`, etc.) against modification.

- [ ] **Verified**: Incrementing any counter by `> 1` or `< -1` in a transaction is rejected with `permission-denied`.

---

## Test 4: A Non-Admin Cannot Read `/admin/reports` or the `/connections` Activity Log

### 4A. UI Route Verification
1. Sign in as **Account B** (where `admins/<Account_B_UID>` does **not** exist in Firestore).
2. Navigate to `/admin/reports`.
   - **Expected UI Result**: Renders the **"Admin Access Required"** lock screen (`noindex`), displaying Account B's UID and zero report or audit records.
3. Navigate to `/connections` and click the **Activity Log** tab.
   - **Expected UI Result**: The tab badge reads `Admin`, `allConnectionEvents` is empty (`[]`), and the panel renders the **"Admin Access Required"** lock screen with zero connection activity entries exposed.

### 4B. Direct Firestore SDK / Rules Verification
While signed in as **Account B**, attempt to query `reports` or `auditLogs` directly:

```ts
import { collection, getDocs } from 'firebase/firestore';
import { db } from './src/firebase';

// 1. Attempt to read moderation reports
await getDocs(collection(db, 'reports'));
// EXPECTED: FirebaseError: [code=permission-denied]: Missing or insufficient permissions.

// 2. Attempt to read auditLogs (used by /admin/reports and /connections Activity Log)
await getDocs(collection(db, 'auditLogs'));
// EXPECTED: FirebaseError: [code=permission-denied]: Missing or insufficient permissions.
```

- [ ] **Verified**: Non-admin users cannot read `/admin/reports` or `reports` collection documents.
- [ ] **Verified**: Non-admin users cannot read the `/connections` Activity Log or `auditLogs` collection documents.

---

## Test 5: A Signed-Out User Is Redirected to `/login` with `returnTo` Preserved and Returned Correctly After Sign-In

### 5A. Step-by-Step Verification
1. Sign out completely (verify the header shows **Sign in**).
2. Navigate directly to each protected route or action while signed out:
   - `/profile` → Redirects immediately to `/login?returnTo=%2Fprofile`
   - `/notifications` → Redirects immediately to `/login?returnTo=%2Fnotifications`
   - `/post/basics` → Redirects immediately to `/login?returnTo=%2Fpost%2Fbasics`
   - `/admin/reports` → Redirects immediately to `/login?returnTo=%2Fadmin%2Freports`
   - Clicking **Link your idea** on `/connections` → Redirects to `/login?returnTo=%2Fconnections`
3. While on `/login?returnTo=%2Fconnections` (or `/login?returnTo=%2Fpost%2Fbasics`), complete sign-in via **Continue with Google** (or Email & Password).
4. **Expected Result**:
   - Immediately upon authentication, `LoginPage` reads the validated internal `returnTo` query parameter and navigates (`replace: true`) directly back to `/connections` (or `/post/basics`).
   - Open-redirect protection: If a malicious URL such as `/login?returnTo=https://evil.example.com` or `/login?returnTo=//evil.example.com` is visited, `LoginPage` rejects the external URL and safely falls back to `/profile`.

- [ ] **Verified**: Signed-out visits to protected routes redirect to `/login?returnTo=...` with the encoded path preserved.
- [ ] **Verified**: Signing in returns the user to the exact `returnTo` route.
- [ ] **Verified**: External/protocol-relative `returnTo` values are rejected and fall back to `/profile`.
