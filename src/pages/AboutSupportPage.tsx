import React from 'react';
import { Link } from 'react-router-dom';
import { Coffee, Code2, ExternalLink, Lock, Handshake, Eye, Compass, Plus } from 'lucide-react';
import { PageMeta } from '../components/PageMeta';
import { SITE_CONFIG } from '../config/siteConfig';

export const AboutSupportPage: React.FC = () => {
  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-margin py-space-xl flex flex-col gap-space-xl">
      <PageMeta
        title="Why Synapse exists"
        description="Free, volunteer-run community where makers, researchers, and problem-solvers share ideas, offer guidance, and build prototypes together."
      />

      {/* Hero Section */}
      <section className="bg-surface-container-low rounded-2xl p-space-xl sm:p-12 flex flex-col gap-space-md shadow-lg relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary-container/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high text-secondary font-code-sm text-code-sm w-fit uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-secondary" />
          <span>Independent &amp; Volunteer-Run</span>
        </div>

        <h1 className="font-headline-xl text-headline-lg-mobile sm:text-headline-xl text-on-surface tracking-tight">
          Why Synapse exists
        </h1>

        {/* Short story (3-4 sentences) */}
        <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed max-w-3xl">
          Synapse was started by an independent developer who wanted a clean, honest home for unbuilt ideas.
          Too many great sparks get forgotten in private notes simply because the person with the problem doesn’t know how to code, while builders spend months searching for worthwhile projects.
          Here, anyone can freely post an idea to find technical feedback, complementary concepts, or volunteer collaborators without algorithmic ads, monetization traps, or intellectual property claims.
          It is built to remain public infrastructure where curious people build things together.
        </p>

        {/* Action Buttons: Buy Me a Coffee + GitHub + Explore + Post */}
        <div className="flex flex-wrap items-center gap-space-md pt-space-sm">
          <a
            href={SITE_CONFIG.buyMeACoffeeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[48px] px-space-xl rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-2 hover:opacity-95 transition-opacity shadow-md"
          >
            <Coffee className="w-5 h-5" />
            <span>Support on Buy Me a Coffee</span>
            <ExternalLink className="w-4 h-4 opacity-75" />
          </a>

          <Link
            to="/github"
            className="min-h-[48px] px-space-xl rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-title-md text-title-md inline-flex items-center gap-2 transition-colors shadow-sm"
          >
            <Code2 className="w-5 h-5 text-secondary" />
            <span>GitHub &amp; Open Source</span>
          </Link>

          <Link
            to="/explore"
            className="min-h-[48px] px-space-xl rounded-lg bg-surface-container-highest hover:bg-surface-bright text-on-surface font-title-md text-title-md inline-flex items-center gap-2 transition-colors"
          >
            <Compass className="w-5 h-5 text-primary" />
            <span>Browse ideas</span>
          </Link>

          <Link
            to="/post/basics"
            className="min-h-[48px] px-space-lg rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface font-title-md text-title-md inline-flex items-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Post an Idea</span>
          </Link>
        </div>
      </section>

      {/* 3 Core Principles Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-space-lg" id="principles">
        {/* Card 1 */}
        <div className="bg-surface-container rounded-2xl p-space-lg flex flex-col gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            Ideas stay with their posters
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
            Synapse claims zero intellectual property, zero licensing fees, and zero equity. You retain
            authorship and choose whether your post keeps All Rights, uses CC BY 4.0, or uses MIT.
          </p>
        </div>

        {/* Card 2 */}
        <div className="bg-surface-container rounded-2xl p-space-lg flex flex-col gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-secondary/15 text-secondary flex items-center justify-center">
            <Handshake className="w-5 h-5" />
          </div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            Free and volunteer-run
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
            Whether an idea needs guidance or needs a builder, collaboration is always free,
            optional, and zero-pressure. Help with a quick architecture review or team up for a prototype.
          </p>
        </div>

        {/* Card 3 */}
        <div className="bg-surface-container rounded-2xl p-space-lg flex flex-col gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-tertiary/15 text-tertiary flex items-center justify-center">
            <Eye className="w-5 h-5" />
          </div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            Honest counts
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
            We never invent stats, fake testimonials, or artificial engagement metrics. Every
            counter starts at zero and reflects genuine community responses, volunteers, and connections.
          </p>
        </div>
      </section>

      {/* Frequently Asked Questions (FAQ) Section */}
      <section className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-lg">
        <div className="flex flex-col gap-2">
          <span className="text-primary font-code-sm text-xs font-semibold uppercase tracking-wider">
            FAQ &amp; Help
          </span>
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Frequently Asked Questions
          </h2>
          <p className="font-body-md text-on-surface-variant">
            Everything you need to know about sharing ideas, collaborating, and open access on Synapse.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
          <div className="bg-surface-container p-5 rounded-xl border border-surface-variant/30 flex flex-col gap-2">
            <h3 className="font-title-lg text-title-lg text-on-surface font-semibold">
              What is Synapse?
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Synapse is a free, volunteer-run open protocol and community platform where makers, researchers, and students post real-world problem specifications, connect complementary specs, and volunteer to build prototypes.
            </p>
          </div>

          <div className="bg-surface-container p-5 rounded-xl border border-surface-variant/30 flex flex-col gap-2">
            <h3 className="font-title-lg text-title-lg text-on-surface font-semibold">
              Who owns the ideas posted on Synapse?
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Ideas belong 100% to their creators. Synapse operates on an open-access model with no platform fees, paywalls, or forced copyright assignments.
            </p>
          </div>

          <div className="bg-surface-container p-5 rounded-xl border border-surface-variant/30 flex flex-col gap-2">
            <h3 className="font-title-lg text-title-lg text-on-surface font-semibold">
              How can I volunteer to build a prototype?
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Browse any idea on the Explore page, view its problem specification and help track requirements, and offer to volunteer or connect your own complementary idea.
            </p>
          </div>

          <div className="bg-surface-container p-5 rounded-xl border border-surface-variant/30 flex flex-col gap-2">
            <h3 className="font-title-lg text-title-lg text-on-surface font-semibold">
              Is Synapse open source?
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
              Yes! The entire Synapse codebase and platform are open source under the MIT License, deployable on GitHub Pages with automated GitHub Actions.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
