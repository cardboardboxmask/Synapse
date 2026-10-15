import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GitBranch,
  GitFork,
  Star,
  ExternalLink,
  Copy,
  Check,
  Terminal,
  Layers,
  ShieldCheck,
  Globe,
  Code2,
  Sparkles,
  BookOpen,
  ArrowRight,
  HeartHandshake,
  CheckCircle2,
} from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { SITE_CONFIG } from '../config/siteConfig';
import { useApp } from '../context/AppContext';

export const GitHubPage: React.FC = () => {
  const { showToast } = useApp();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedKey(key);
        showToast('Copied to clipboard!', 'success');
        setTimeout(() => setCopiedKey(null), 2500);
      })
      .catch(() => {
        showToast('Failed to copy to clipboard', 'error');
      });
  };

  const cloneCommand = `git clone https://github.com/cardboardboxmask/Synapse.git\ncd Synapse\nnpm install\nnpm run dev`;
  const ghPagesCommand = `npm run build:gh-pages`;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-margin py-space-xl flex flex-col gap-space-2xl">
      <PageMeta
        title="Open Source & GitHub Pages — Synapse"
        description="Synapse repository on GitHub: open-source idea registry, local setup instructions, GitHub Pages automated deployment, and contribution guidelines."
      />

      {/* Hero Section */}
      <section className="bg-surface-container-low rounded-3xl p-6 sm:p-space-2xl border border-surface-variant/30 flex flex-col gap-space-lg relative overflow-hidden shadow-sm">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-80 h-80 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary font-code-sm text-xs font-semibold">
            <Globe className="w-3.5 h-3.5" />
            GitHub Pages Ready
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant font-code-sm text-xs font-semibold">
            <GitBranch className="w-3.5 h-3.5" />
            main branch
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container text-on-surface-variant font-code-sm text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            MIT / Open Source
          </span>
        </div>

        <div className="flex flex-col gap-space-sm max-w-3xl">
          <h1 className="font-headline-xl text-headline-xl sm:text-4xl text-on-surface font-bold tracking-tight">
            Synapse on GitHub
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed">
            Synapse is an open protocol and community platform connecting real-world problem solvers,
            makers, and student builders. The entire codebase is open source and configured for automated continuous deployment to <strong>GitHub Pages</strong>.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <a
            href={SITE_CONFIG.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-5 rounded-xl bg-primary text-on-primary font-label-md font-semibold inline-flex items-center gap-2 hover:bg-primary/90 transition-all shadow-sm"
          >
            <Code2 className="w-4 h-4" />
            <span>View on GitHub</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </a>

          <a
            href={`${SITE_CONFIG.githubUrl}/stargazers`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md font-medium inline-flex items-center gap-2 border border-surface-variant/40 transition-colors"
          >
            <Star className="w-4 h-4 text-secondary fill-secondary/20" />
            <span>Star Repository</span>
          </a>

          <a
            href={`${SITE_CONFIG.githubUrl}/fork`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md font-medium inline-flex items-center gap-2 border border-surface-variant/40 transition-colors"
          >
            <GitFork className="w-4 h-4" />
            <span>Fork Project</span>
          </a>

          <a
            href={`${SITE_CONFIG.githubUrl}/issues`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md font-medium inline-flex items-center gap-2 border border-surface-variant/40 transition-colors"
          >
            <span>Open Issue</span>
          </a>
        </div>
      </section>

      {/* Grid: Quick Start & GitHub Pages Deployment */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-space-xl">
        {/* Quick Start Terminal */}
        <div className="bg-surface-container rounded-2xl p-6 flex flex-col gap-space-md border border-surface-variant/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-primary" />
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                Local Development
              </h2>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(cloneCommand, 'clone')}
              className="text-xs font-code-sm text-primary hover:text-primary-container inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low border border-surface-variant/40"
              title="Copy commands"
            >
              {copiedKey === 'clone' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-success" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Clone the repository and run the development environment locally on Node.js 20+:
          </p>

          <pre className="bg-surface-container-lowest text-on-surface p-4 rounded-xl font-code-sm text-xs sm:text-sm overflow-x-auto border border-surface-variant/20 leading-relaxed">
            <code>{cloneCommand}</code>
          </pre>

          <div className="flex flex-col gap-2 pt-2 text-xs text-on-surface-variant font-body-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <span>Runs with Vite 8 development server on port 3000.</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
              <span>Full hot reload and local offline-first fallback capabilities.</span>
            </div>
          </div>
        </div>

        {/* GitHub Pages Deployment Workflow */}
        <div className="bg-surface-container rounded-2xl p-6 flex flex-col gap-space-md border border-surface-variant/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-secondary" />
              <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                GitHub Pages Deployment
              </h2>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(ghPagesCommand, 'build-gh')}
              className="text-xs font-code-sm text-primary hover:text-primary-container inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-container-low border border-surface-variant/40"
              title="Copy build command"
            >
              {copiedKey === 'build-gh' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-success" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Automated deployment is configured using <strong>GitHub Actions</strong>. Push to the <code>main</code> branch to deploy, or trigger a manual build:
          </p>

          <pre className="bg-surface-container-lowest text-on-surface p-4 rounded-xl font-code-sm text-xs sm:text-sm overflow-x-auto border border-surface-variant/20 leading-relaxed">
            <code>{ghPagesCommand}</code>
          </pre>

          <div className="flex flex-col gap-2 pt-2 text-xs text-on-surface-variant font-body-sm">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
              <span><code>.github/workflows/deploy.yml</code> handles build & upload artifacts automatically.</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
              <span><code>public/404.html</code> routing fallback preserves deep client-side links on GitHub Pages.</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
              <span><code>public/.nojekyll</code> prevents Jekyll from interfering with bundled assets.</span>
            </div>
          </div>
        </div>
      </section>

      {/* Repository Highlights */}
      <section className="flex flex-col gap-space-lg">
        <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
          Key Architecture Pillars
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
          <div className="bg-surface-container-low p-5 rounded-2xl border border-surface-variant/20 flex flex-col gap-2">
            <Layers className="w-6 h-6 text-primary mb-1" />
            <h3 className="font-title-md text-title-md text-on-surface font-semibold">
              Authentic Problem Data
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              12 carefully curated, real-world specifications across transit, education, healthcare, accessibility, and agriculture. Zero fake comments or mock counters.
            </p>
          </div>

          <div className="bg-surface-container-low p-5 rounded-2xl border border-surface-variant/20 flex flex-col gap-2">
            <ShieldCheck className="w-6 h-6 text-secondary mb-1" />
            <h3 className="font-title-md text-title-md text-on-surface font-semibold">
              Admin & Role Hardening
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Sole-owner administration with WebAuthn passkey step-up checks, audit logging, and Firestore security rules to protect the community.
            </p>
          </div>

          <div className="bg-surface-container-low p-5 rounded-2xl border border-surface-variant/20 flex flex-col gap-2">
            <Sparkles className="w-6 h-6 text-primary mb-1" />
            <h3 className="font-title-md text-title-md text-on-surface font-semibold">
              PWA & Offline First
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Progressive Web App with cache-first fonts and service workers. Students and makers in low-connectivity areas can view cached ideas anywhere.
            </p>
          </div>
        </div>
      </section>

      {/* Contributing Guidelines */}
      <section className="bg-surface-container-low rounded-2xl p-6 sm:p-space-xl border border-surface-variant/30 flex flex-col sm:flex-row items-center justify-between gap-space-lg">
        <div className="flex flex-col gap-1 max-w-2xl">
          <div className="flex items-center gap-2">
            <HeartHandshake className="w-5 h-5 text-primary" />
            <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
              Want to Contribute to Synapse?
            </h3>
          </div>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Whether you want to propose a new problem specification, fix a bug, or volunteer to build a prototype for an open idea, the Synapse community welcomes your PRs and discussions.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/explore"
            className="min-h-[44px] px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md font-semibold inline-flex items-center gap-2 transition-colors"
          >
            <span>Explore Ideas</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <a
            href={`${SITE_CONFIG.githubUrl}/blob/main/README.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-5 rounded-xl bg-primary text-on-primary font-label-md font-semibold inline-flex items-center gap-2 hover:bg-primary/90 transition-all shadow-sm"
          >
            <BookOpen className="w-4 h-4" />
            <span>Read Docs</span>
          </a>
        </div>
      </section>
    </div>
  );
};
