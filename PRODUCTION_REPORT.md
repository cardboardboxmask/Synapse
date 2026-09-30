# Synapse — Complete End-to-End Platform & Production Architecture Report

---

## 1. Executive Summary & Product Philosophy

**Synapse** is a decentralized, non-profit community platform built by a solo maker where independent thinkers, tinkerers, and engineers share raw specifications, connect complementary ideas, and collaborate to build them in the open—without paywalls, algorithms, or corporate gatekeeping.

### Core Product Pillars
1. **Two Explicit Collaboration Tracks**:
   - **Needs Guidance (`guidance`)**: The author is building the project themselves and wants architectural feedback, domain critiques, or technical pointers.
   - **Needs a Builder (`builder`)**: The author is sharing an open specification and looking for a co-builder or maker to bring it to life.
2. **Explicit Creator Ownership & Licensing**:
   - Every idea carries an explicit creator-selected license: **All Rights Kept (`all-rights-kept`)**, **Creative Commons Attribution (`cc-by`)**, or **MIT Open Specification (`mit`)**.
3. **Anti-Bloat / Anti-AI-Slop Discipline**:
   - Zero AI chatbots, zero fake popularity metrics, zero paywalls, and zero engagement-bait dark patterns.
4. **6 Curated Founder Starter Specifications**:
   - Bootstrapped automatically into Firestore on first load (`LocalMesh`, `OpenPaperclip`, `PromptDiff`, `SyncShelf`, `SolarStitch`, `Formless`) so the platform is immediately explorable.

---

## 2. Design System — "The Nocturnal Observatory"

- **Color Palette**:
  - **Surface Hierarchy**: Deep obsidian background (`#10131b` / `surface-container-lowest` `#0b0e16`, `surface-container-low` `#181c25`, `surface-container` `#1c2029`, `surface-container-high` `#272a34`, `surface-container-highest` `#31353f`) with full **Dark / Light Theme** toggle persisted in `localStorage`.
  - **Primary Accent (Amber)**: `#ffc77f` / `#F5A524` (`Needs a Builder`, primary CTAs, active highlights).
  - **Secondary Accent (Teal)**: `#44e2cd` (`Constellation Connections`, verified links, active badges).
  - **Tertiary Accent (Indigo)**: `#cbceff` (`Needs Guidance` track).
- **Typography**:
  - **Headlines**: `Space Grotesk`
  - **Body & Long-form Specifications**: `Plus Jakarta Sans`
  - **Metadata, Timestamps, Badges & Code**: `JetBrains Mono`
- **Accessibility & Touch Ergonomics**:
  - Minimum `44px × 44px` interactive touch targets, keyboard focus rings, ARIA landmarks, and mobile bottom navigation bar.

---

## 3. Complete Route Map & Page Architecture

| Route | Component | Capabilities |
| :--- | :--- | :--- |
| `/` | `LandingPage.tsx` | Hero section, live platform metrics, track explainer (`Needs Guidance` vs `Needs a Builder`), featured specifications, and built showcase highlights. |
| `/explore` | `ExplorePage.tsx` | Full-text multi-field search, category filters (`Software`, `Hardware`, `AI`, `Web`, `Other`), track filters, status filters (`open`, `in-progress`, `built`), license filters, tag filtering, sorting (`Newest`, `Most Responses`, `Most Connected`), and cursor-based pagination. |
| `/post/:step` | `PostWizardPage.tsx` | 4-Step Specification Wizard (`/post/basics`, `/post/problem`, `/post/help`, `/post/review`) with real-time similarity detection ("Does this already exist?"), magic-byte validated diagram upload, license selection, and versioned `localStorage` draft auto-save (`v2`). |
| `/ideas/:id` | `IdeaDetailPage.tsx` | Overview specification workspace, lifecycle status transitions (`open → in-progress → built`), community novelty check (`Looks New` vs `Similar Exists`), bookmarking, and sharing. |
| `/ideas/:id/responses` | `IdeaDetailPage.tsx` | Structured community responses (`Guidance`, `Offer to Build`, `Connection`, `Similar Check`) with inline author editing, deletion, and reference URLs. |
| `/ideas/:id/volunteers` | `IdeaDetailPage.tsx` | Volunteer queue where makers offer to build (`pending → accepted / declined`), owners manage offers, and volunteers can edit or withdraw pending offers. |
| `/ideas/:id/connections` | `IdeaDetailPage.tsx` | Cross-linked ideas for the specification with governance controls restricted to Admin and the connected makers. |
| `/ideas/:id/edit` | `IdeaDetailPage.tsx` | Owner/Admin specification editor + **Specification Revision History** (`ideas/{ideaId}/revisions`). |
| `/connections` | `ConnectionsPage.tsx` | **Tab 1 — Active Connections & Graph**: Structured list view first + Interactive 2D SVG Constellation Map. **Tab 2 — Activity Log**: Admin-only timestamped history of connection status updates with **User ID** and **Date Range** filters. |
| `/showcase` | `ShowcasePage.tsx` | Gallery of specifications that reached `built` status, displaying live project URLs, builder credits, and build notes. |
| `/u/:username` | `PublicProfilePage.tsx` | Public maker portfolio resolving `@username` handles (and legacy UIDs) with authored specs, built projects, and account status handling. |
| `/login` & `/profile` | `LoginProfilePage.tsx` | Google OAuth sign-in, profile editor, atomic `@username` handle changer, avatar uploader, saved bookmarks manager (with personal notes), notification preferences, and full account deletion cleanup. |
| `/notifications` | `NotificationsPage.tsx` | Real-time inbox for responses, volunteer offers, connections, and status changes with mark-as-read, delete, and orphaned-target cleanup. |
| `/about` | `AboutPage.tsx` | Mission, Creator Ownership Charter, Code of Conduct, and Firestore Security architecture overview. |
| `/support` | `SupportPage.tsx` | Non-profit solo-maker transparency page (hosting breakdown, non-commercial pledge, community contribution pathways). |
| `/admin/reports` | `AdminReportsPage.tsx` | Admin moderation dashboard with status filters (`open`, `resolved`, `dismissed`), moderator resolution notes, direct target deletion, and immutable **Security & Moderation Audit Log** viewer. |

---

## 4. Global Header Search Bar (`GlobalSearchBar.tsx`)

Integrated directly into the top navigation bar (`Layout.tsx`) with a responsive mobile search modal and global `⌘K` / `Ctrl+K` shortcut:
- **Real-Time Categorized Search**:
  1. **Ideas**: Searches open and in-progress specifications across title, summary, problem, solution, category, and `#tags` (`/ideas/:id`).
  2. **Projects**: Searches built showcase projects (`status === 'built'` or with `showcaseUrl`) across title, summary, credits, and build notes (`/ideas/:id`).
  3. **Users**: Streams public maker profiles from Firestore (`users`) combined with idea authors to match `@username`, display name, and bio (`/u/:username`).
- **Scope Tabs & Keyboard Navigation**:
  - Instant scope filter pills (**All**, **Ideas**, **Projects**, **Users**) with live counts.
  - Full `↑` / `↓` arrow key navigation, `Enter` to open highlighted item or jump to `/explore?q=...`, and `Esc` to close.

---

## 5. Active Connections Governance & Admin Activity Log

### 5.1 Strict Access Control on Active Connections
- Each connection document (`connections/{connectionId}`) records:
  - `ideaA`, `ideaATitle`, `ideaAAuthorId`, `ideaAAuthorName`
  - `ideaB`, `ideaBTitle`, `ideaBAuthorId`, `ideaBAuthorName`
  - `createdBy`, `createdByName`, `reason`, `status` (`active` | `pending` | `declined`), `createdAt`, `updatedAt`
- **Admin & Connected Makers Only**:
  - Enforced in both `assertCanManageConnection` (`src/firebase.ts`) and `match /connections/{connectionId}` (`firestore.rules`).
  - **Only an Admin or the people connected with each other** (`createdBy`, `ideaA` owner, or `ideaB` owner) can **Decline**, **Mark Active**, or **Remove** a connection.
  - All other visitors see a read-only `Admin & connected makers only` lock indicator.
  - Declined connections are automatically excluded from drawing active edges on the 2D Constellation Map.

### 5.2 Admin Connection Activity Log & Filtering System (`/connections`)
- Dedicated **Activity Log** tab on `ConnectionsPage` streaming real-time `connection.create`, `connection.status_change`, and `connection.delete` audit events from `auditLogs` (merged with baseline connection timestamps).
- **Multi-Dimensional Admin Filters**:
  - **Event Type**: `All Events`, `Status Updates`, `Created`, `Removed`.
  - **Specific User ID Filter**: Text input matching exact/partial `User ID` (`actorId`) or actor name, a quick-select dropdown of all unique actors in the logs, and clickable `User ID: <uid>` badges on every log entry.
  - **Date Range Filter**: Inclusive **Start Date** (`00:00:00`) and **End Date** (`23:59:59.999`) date pickers, quick range presets (**Today**, **Last 7 Days**, **Last 30 Days**, **All Dates**), live filtered counter (`Showing X of Y connection events`), and one-click **Reset**.

---

## 6. Firestore Data Model, Security Rules & Concurrency Hardening

### 6.1 Firestore Collections & Subcollections
- `users/{uid}` — Public maker profile (`uid`, `displayName`, `username`, `photoURL`, `avatarUrl`, `bio`, `deleted`, `notificationPrefs`, `createdAt`, `updatedAt`).
  - `users/{uid}/notifications/{notificationId}` — Deduplicated user notifications (`notif_{type}_{actorId}_{targetId}`).
  - `users/{uid}/bookmarks/{ideaId}` — Saved idea bookmarks with personal notes.
- `usernames/{username}` — Registry enforcing unique lowercase `@username` handles.
- `ideas/{ideaId}` — Core specification documents with atomic counters (`responseCount`, `volunteerCount`, `connectionCount`, `communityCheckSimilar`, `communityCheckNew`).
  - `ideas/{ideaId}/revisions/{revisionId}` — Immutable edit history snapshots.
  - `ideas/{ideaId}/responses/{responseId}` — Community responses.
  - `ideas/{ideaId}/volunteers/{volunteerId}` — Volunteer offers (`volunteerId == userId`).
- `connections/{connectionId}` — Normalized cross-idea links (`min(idA,idB)__max(idA,idB)`).
- `reports/{reportId}` — Deterministic moderation reports (`report_{type}_{targetId}_{reporterId}`).
- `auditLogs/{logId}` — Immutable security and admin audit trail.
- `admins/{uid}` — Admin privilege registry (checked server-side in `firestore.rules` via `exists(/databases/$(database)/documents/admins/$(request.auth.uid))`).

### 6.2 Concurrency & Cascading Integrity
- **Transaction Retry Wrapper (`executeTransactionWithRetry`)**: Automatically retries Firestore transactions on transient contention (`aborted` / `failed-precondition`).
- **Single-Step Counter Guard (`isSingleStepCounterTransaction`)**: Firestore rules verify that non-owner counter updates only modify counter fields by at most `±1` per transaction.
- **Cascading Idea & Account Deletion**:
  - Deleting an idea cleans up dependent connections (decrementing peer `connectionCount`), responses, volunteers, and revisions.
  - Deleting an account purges private bookmarks/notifications, releases the `@username` claim, deletes zero-engagement ideas, and anonymizes ideas that have community contributions.

---

## 7. Media Validation, Offline Resilience & Cloud Run Server (`server.ts`)

- **Magic-Byte Media Validation (`src/utils/mediaPolicy.ts`)**:
  - Inspects binary file headers (`JPEG`, `PNG`, `WebP`), enforces file size caps, and blocks SVG/scriptable uploads.
- **Offline & Draft Resilience**:
  - Live online/offline banner in `Layout.tsx`, fail-fast `assertOnlineForMutation` checks before writes, and schema-versioned (`v2`) `localStorage` draft persistence in the Post Wizard.
- **Express + Vite Production Server (`server.ts`)**:
  - Configured for Cloud Run on port `3000` with HTTP security headers (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`), sliding-window IP rate limiting, `/health` readiness endpoint, dynamic `/robots.txt` and `/sitemap.xml` endpoints, and graceful `SIGTERM`/`SIGINT` shutdown handlers.
