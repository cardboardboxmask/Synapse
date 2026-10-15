# Synapse — Open Protocol Idea Registry

> Free, volunteer-run community where makers, researchers, and students post real-world problem specifications, connect complementary specs, offer guidance, or volunteer to build prototypes.

[![Deploy to GitHub Pages](https://github.com/cardboardboxmask/Synapse/actions/workflows/deploy.yml/badge.svg)](https://github.com/cardboardboxmask/Synapse/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-teal.svg)](https://opensource.org/licenses/MIT)
[![PWA Ready](https://img.shields.io/badge/PWA-Offline%20First-44e2cd.svg)](#)

---

## 🚀 GitHub Hosting (GitHub Pages)

This project is fully configured for hosting on **GitHub Pages** (`https://cardboardboxmask.github.io/Synapse/` or custom domains).

### Method 1: Automated Deployment via GitHub Actions (Recommended)

1. Push this repository to GitHub:
   ```bash
   git remote add origin https://github.com/cardboardboxmask/Synapse.git
   git add .
   git commit -m "feat: complete GitHub Pages hosting setup"
   git push -u origin main
   ```
2. In your GitHub repository:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Every commit pushed to the `main` branch will automatically build and deploy via `.github/workflows/deploy.yml`!

### Method 2: One-Command CLI Deployment

If you prefer to deploy directly from your local terminal:
```bash
npm run deploy
```
This runs `npm run build:gh-pages` and pushes the production build directly to the `gh-pages` branch with `--dotfiles` (including `404.html` and `.nojekyll`).

---

## ⚙️ Firebase Authentication on GitHub Pages

Because Firebase Authentication restricts logins to verified web origins for security:
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select your project (`gen-lang-client-0790726163`).
3. Navigate to **Authentication** > **Settings** > **Authorized domains**.
4. Click **Add domain** and enter your GitHub Pages domain:
   - `cardboardboxmask.github.io` (or your custom domain).

---

## 🛠️ Local Development

### Prerequisites
- Node.js 20+
- npm or pnpm

### Quick Start
```bash
# 1. Install dependencies
npm install

# 2. Start local development server on port 3000
npm run dev

# 3. Test production build locally
npm run build
npm run preview
```

---

## 🏗️ Architecture & Features

- **Single-Page App Routing on GitHub Pages**: Includes `public/404.html` and `index.html` redirection decoder to support deep URL refreshes on GitHub Pages without 404 errors.
- **Bypass Jekyll Processing**: Includes `public/.nojekyll` to ensure Vite chunk assets (`dist/assets/*.js`) are properly served by GitHub Pages.
- **Dynamic Base Path**: Vite and React Router (`basename`) dynamically adapt to root domains or sub-paths (`/synapse/`).
- **Authentic Problem Specifications**: 12 curated real-world problem statements (Transit, Healthcare, Education, AI, Sensors, Agriculture) under official admin curation.
- **PWA & Offline First**: Pre-caches assets and Google Fonts via Workbox service worker for resilience in low-connectivity areas.
- **Role & Audit Security**: Firestore security rules, sole-owner administration, WebAuthn step-up authentication, and platform moderation logging.

---

## 📜 License

Distributed under the MIT License. Ideas, specs, and problem descriptions shared by makers remain the intellectual property of their respective creators under open Creative Commons and open-source licenses.
