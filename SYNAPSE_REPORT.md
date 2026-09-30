# Synapse — Complete Architecture, Feature & Implementation Report

## 1. Executive Summary

**Synapse** is a production-ready, multi-page community platform built for independent makers, researchers, and problem-solvers. Designed under the **Synapse Kinetic Minimal** design system, it connects people around two core collaboration tracks:

- **Track A — Needs Guidance**: The creator can build the project themselves and seeks architecture feedback, technical direction, or prior-art validation.
- **Track B — Needs a Builder**: The creator has a well-defined problem and specification and needs volunteer developers, engineers, or researchers to help prototype it.

### Core Product Guarantees
- **Public-First Discovery**: Browsing ideas, responses, volunteer rosters, constellation graphs, showcase builds, and public maker profiles never requires authentication.
- **Action-Only Authentication**: Google Sign-In is requested only when performing write/account actions (posting, responding, volunteering, connecting ideas, bookmarking, reporting, or editing owned content), preserving the user's destination via `?returnTo=...`.
- **Zero-Inflation Principle**: Zero fabricated metrics, fake users, or artificial activity. All counters (`responseCount`, `volunteerCount`, `connectionCount`, `communityCheckSimilar`, `communityCheckNew`) initialize strictly at `0` and update via atomic Firestore transactions.
- **Creator Ownership**: Every idea displays its creator, license (`All Rights Kept`, `CC BY 4.0`, or `MIT`), ownership statement, and current lifecycle status (`Open`, `In Progress`, `Built`).

---

## 2. Technology Stack & Deployment Architecture

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Frontend UI** | React 19 + TypeScript | Component architecture, hooks, strict typing |
| **Routing** | React Router v7 (`BrowserRouter`) | Multi-page URL routing, deep links, query-string filters, code-split lazy routes |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/vite`) | Compiled CSS design tokens, dark/light theme support, 8pt spatial grid |
| **Authentication** | Firebase Authentication | Google Sign-In (`signInWithPopup`) + automatic `users/{uid}` profile provisioning |
| **Database** | Cloud Firestore | Real-time listeners (`onSnapshot`), atomic counter transactions (`runTransaction`), strict security rules |
| **Server & Cloud Run** | Express (`server.ts`) + Vite | Serves `/api/health`, dynamic `/sitemap.xml`, static assets, and SPA fallback (`index.html`) for all deep links |

---

## 3. Complete Route Map (19 Routes + Dynamic Sitemap)

Every screen is a dedicated route with its own URL, browser history support, route-level code splitting (`React.lazy` + `Suspense` skeletons), and dynamic SEO metadata (`SEOHead.tsx`):

| Route | Access | Purpose & Key Capabilities |
| :--- | :--- | :--- |
| `/` | Public | **Home**: Mission hero, primary CTAs, live Firestore recent ideas, 3-step guide, and Two Help Tracks explainer. |
| `/explore` | Public | **Explore Workbench**: URL-synced search & filters (`?q=`, `?cat=`, `?track=`, `?status=`, `?sort=`, `?saved=`, `?page=`), copyable search permalink, and Dev Zero-State toggle. |
| `/ideas/:id` | Public | **Idea Specification**: Full problem/solution/help-wanted spec, 3-step lifecycle stepper (`Open` → `In progress` → `Built`), license & ownership card, **"Does this already exist?"** community check, bookmark button, **"This connects with my idea"** modal, and **"I can help build this"** flow. |
| `/ideas/:id/responses` | Public (Read) / Auth (Write) | **Community Responses**: Filterable thread (`Guidance`, `Offer to build`, `Connection`, `Similar project check`), reference URL support, owner inline edit & delete with atomic counter updates. |
| `/ideas/:id/volunteers` | Public (Read) / Auth (Write) | **Volunteers & Status**: Volunteer roster with role/message, volunteer self-withdrawal, and owner controls to `Accept` / `Decline` offers or transition idea status (`Open`, `In progress`, `Built`). |
| `/ideas/:id/connections` | Public (Read) / Auth (Write) | **Idea Connections**: Displays bidirectional linked ideas, connection reason, creator, status badge (`active`, `pending`, `declined`), owner status controls, and modal to link another idea. |
| `/ideas/:id/edit` | Owner / Admin | **Edit Idea**: Full specification editor, status & license updates, showcase URL/credits/notes fields, and confirmed deletion. |
| `/post/basics` | Protected | **Post Wizard (Step 1/3)**: Title, category, up to 5 normalized tags, and help track (`Needs guidance` vs `Needs a builder`). Auto-saves draft to `localStorage`. |
| `/post/details` | Protected | **Post Wizard (Step 2/3)**: Executive summary, problem statement, proposed specification, help wanted, prior-art notes, license selector, and optional showcase fields. |
| `/post/review` | Protected | **Post Wizard (Step 3/3)**: Full preview of the specification, ownership verification, publish to Firestore, and post-publish celebration view. |
| `/connections` | Public | **Connections & Constellation Map**: List view of active connections (with source, target, reason, creator, status controls) + interactive HTML5 Canvas Constellation Graph (pan, zoom, keyboard navigation, `prefers-reduced-motion` support) + **"Link Two Ideas"** modal. |
| `/showcase` | Public | **Showcase**: Directory of finished community builds (`status === 'built'`) with contributor credits and live repository/demo links. |
| `/showcase/:id` | Public | **Showcase Detail**: Deep-dive view of a completed build, its original specification, build notes, and accepted volunteers. |
| `/about` | Public | **About & Manifesto**: Solo-maker story, core principles, ownership ethics, code of conduct, and Firestore security architecture summary. |
| `/support` | Public | **Support**: Zero-fee community commitment, Discord link, Buy Me a Coffee link (configured in `src/config/siteConfig.ts`), and non-monetary ways to help. |
| `/login` | Public | **Sign In**: Google Sign-In flow with automatic redirect back to `?returnTo=...`. |
| `/profile` | Protected | **Creator Dashboard**: Edit display name, `@username`, and bio; tabs for **My Ideas**, **Saved Bookmarks** (with personal notes), **Volunteering**, and **Connections**. |
| `/u/:username` | Public | **Public Maker Profile**: Public portfolio showing a maker's posted ideas, showcase builds, bio, and a **Report Profile** moderation action. |
| `/notifications` | Protected | **Notification Inbox**: Real-time alerts for new responses, volunteer offers, idea connections, and volunteer status updates, with mark-as-read and delete controls. |
| `/admin/reports` | Admin Only | **Admin Moderation Queue**: Restricted to UIDs in the `admins/{uid}` collection. Filter reports (`all`, `open`, `resolved`, `dismissed`), inspect target links, resolve/dismiss reports, or remove abusive content in one click. |
| `*` (404) | Public | **Not Found**: Custom 404 page with `noindex, nofollow` metadata and recovery navigation. |

---

## 4. Bookmarking & Personal Notes System

Logged-in users can save any idea across Synapse for quick reference:
1. **One-Click Save / Unsave**: Available on every `IdeaCard` (Home, Explore, Showcase, Public Profiles) and in the `IdeaDetailPage` header. Unauthenticated clicks redirect cleanly to `/login?returnTo=...`.
2. **Explore Saved Filter (`/explore?saved=1`)**: Filter the discovery workbench to show only bookmarked ideas, combinable with search, category, track, and sort parameters.
3. **Profile Saved Tab (`/profile?tab=saved`)**: Dedicated management view where users can add, edit, or clear personal research notes (up to 500 characters) on each saved idea.
4. **Private Subcollection Storage**: Stored in `users/{uid}/bookmarks/{ideaId}` and locked by `firestore.rules` so only the bookmark owner can read, create, update, or delete their saved bookmarks.

---

## 5. Dynamic Firestore `sitemap.xml` & SEO Architecture

To maximize search engine discoverability while protecting private routes:

### Dynamic Sitemap Generation
- **Shared Generator**: Connects to Firestore, ensures the 6 founder starter ideas are seeded, and queries all documents in `ideas` and `users`.
- **Included Sitemap URLs**:
  - Core public pages: `/`, `/explore`, `/connections`, `/showcase`, `/about`, `/support`
  - Discovery track & category permalinks: `/explore?track=guidance`, `/explore?track=builder`, `/explore?cat=Software`, `/explore?cat=Hardware`, `/explore?cat=AI`, `/explore?cat=Web`
  - Dynamic routes for **every existing idea in Firestore**:
    - `/ideas/:id`
    - `/ideas/:id/responses`
    - `/ideas/:id/volunteers`
    - `/ideas/:id/connections`
    - `/showcase/:id` (automatically included when `idea.status === 'built'`)
  - Dynamic routes for **public maker profiles**: `/u/founder` and `/u/:username` for all community makers
- **Excluded Private Routes**: `/login`, `/profile`, `/notifications`, `/admin/reports`, `/post/*`, and `/ideas/:id/edit` are excluded from `sitemap.xml`, disallowed in `robots.txt`, and tagged with `<meta name="robots" content="noindex, nofollow" />`.
- **Live Server & Build Sync**:
  - Requesting `GET /sitemap.xml` or `GET /api/sitemap.xml` dynamically queries Firestore and serves fresh XML (`application/xml; charset=utf-8`).
  - Creating, updating, or deleting an idea triggers an automatic background refresh of `/api/sitemap.xml`.
  - Running `npm run sitemap` or `npm run build` regenerates `/public/sitemap.xml` and `/sitemap.xml` on disk.

---

## 6. Firestore Data Model & Security Rules

### Collections Overview
- `users/{uid}`: Public maker profile (`uid`, `displayName`, `username`, `photoURL`, `bio`, `createdAt`, `updatedAt`).
- `users/{uid}/notifications/{notificationId}`: Private inbox notifications (`recipientId`, `type`, `title`, `message`, `link`, `read`, `actorId`, `actorName`, `createdAt`).
- `users/{uid}/bookmarks/{ideaId}`: Private saved idea bookmarks (`userId`, `ideaId`, `ideaTitle`, `ideaSummary`, `ideaCategory`, `ideaHelpTrack`, `note`, `createdAt`).
- `ideas/{ideaId}`: Public idea specifications with strict schema validation and zero-initialized counters.
- `ideas/{ideaId}/responses/{responseId}`: Public responses (`guidance`, `offer-to-build`, `connection`, `similar-check`).
- `ideas/{ideaId}/volunteers/{volunteerId}`: Volunteer offers keyed by `userId` (`pending`, `accepted`, `declined`).
- `connections/{connectionId}`: Bidirectional links between `ideaA` and `ideaB` (`active`, `pending`, `declined`).
- `reports/{reportId}`: Moderation reports created by signed-in users and readable/updatable only by admins.
- `admins/{uid}`: Admin role lookup collection (managed exclusively in the Firebase Console; `allow write: if false;`).

---

## 7. How to Customize & Extend

1. **Community & Support Links**:
   - Edit `src/config/siteConfig.ts` to update `discordUrl`, `buyMeACoffeeUrl`, `githubUrl`, `domain`, or `makerHandle`.
2. **Granting Admin Access**:
   - In the Firebase Console → Firestore Database (`ai-studio-217e3490-8920-49a9-8b94-79ae87bb9ed8`), create a collection named `admins` and add a document whose Document ID is your Firebase Auth `uid`. The **Admin Queue** link (`/admin/reports`) will automatically appear in your header navigation.
3. **Regenerating Sitemap Manually**:
   - Run `npm run sitemap` at any time to sync `/public/sitemap.xml` and `/sitemap.xml` from Firestore, or visit `/sitemap.xml` in the browser.
