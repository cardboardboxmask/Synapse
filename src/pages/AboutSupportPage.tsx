import React from 'react';
import { Link } from 'react-router-dom';
import { PageMeta } from '../components/PageMeta';
import { SITE_CONFIG } from '../config/siteConfig';

interface AboutSupportPageProps {
  mode: 'about' | 'support';
}

export const AboutSupportPage: React.FC<AboutSupportPageProps> = ({ mode }) => {
  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-margin py-space-xl flex flex-col gap-space-xl">
      <PageMeta
        title={
          mode === 'support'
            ? 'Support Solo Maker — Synapse'
            : 'About Synapse & Solo Maker Manifesto'
        }
        description="Honest solo-maker story, non-profit principles, open idea ownership rules, and Firestore security rules."
      />

      {/* Hero Card */}
      <section className="bg-surface-container-low rounded-2xl p-space-xl sm:p-12 flex flex-col gap-space-md shadow-lg relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-primary-container/10 rounded-full blur-3xl pointer-events-none" />
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high text-secondary font-code-sm text-code-sm w-fit uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-secondary" />
          {mode === 'support' ? 'Support Open Infrastructure' : 'Solo Maker Manifesto'}
        </div>
        <h1 className="font-headline-xl text-headline-lg-mobile sm:text-headline-xl text-on-surface tracking-tight">
          {mode === 'support'
            ? 'Built by one solo maker. Free for everyone.'
            : 'Why Synapse exists: an open home for unbuilt ideas.'}
        </h1>
        <p className="font-body-lg text-body-lg text-on-surface-variant leading-relaxed max-w-3xl">
          Synapse was built by one independent developer who wanted a clean, honest place where
          anyone can share an idea—software first, hardware, architecture, or public utility
          tooling—and find either technical guidance or a volunteer builder without ads, fees, or IP
          traps.
        </p>

        {/* Action Buttons from single editable config file (src/config/siteConfig.ts) */}
        <div className="flex flex-wrap items-center gap-space-md pt-space-sm">
          <a
            href={SITE_CONFIG.discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[48px] px-space-xl rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-title-md text-title-md inline-flex items-center gap-2 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[20px] text-secondary">forum</span>
            <span>Join Discord</span>
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
          </a>

          <a
            href={SITE_CONFIG.buyMeACoffeeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[48px] px-space-xl rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-2 hover:opacity-95 transition-opacity shadow-md"
          >
            <span className="material-symbols-outlined text-[20px]">local_cafe</span>
            <span>Buy Me a Coffee</span>
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
          </a>

          <Link
            to="/post/basics"
            className="min-h-[48px] px-space-lg rounded-lg bg-surface-container text-on-surface-variant hover:text-on-surface font-title-md text-title-md inline-flex items-center gap-2 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>Post an Idea</span>
          </Link>
        </div>
        <p className="font-code-sm text-code-sm text-on-surface-variant/80">
          Config note: Community URLs are stored in a single editable file at{' '}
          <code>src/config/siteConfig.ts</code>.
        </p>
      </section>

      {/* Core Principles */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-space-lg" id="ownership">
        <div className="bg-surface-container rounded-2xl p-space-lg flex flex-col gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-primary/15 text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px]">lock_open</span>
          </div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            1. Ideas Stay With Their Posters
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
            Synapse claims zero intellectual property, zero licensing fees, and zero equity. You
            choose whether your post keeps All Rights, uses CC BY 4.0, or uses MIT.
          </p>
        </div>

        <div className="bg-surface-container rounded-2xl p-space-lg flex flex-col gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-secondary/15 text-secondary flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px]">volunteer_activism</span>
          </div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            2. Volunteer-Run &amp; No-Commitment
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
            Whether an idea needs guidance or needs a builder, volunteering is always free,
            optional, and zero-pressure. Help with a 5-minute architecture review or build a full
            prototype.
          </p>
        </div>

        <div className="bg-surface-container rounded-2xl p-space-lg flex flex-col gap-space-sm">
          <div className="w-10 h-10 rounded-lg bg-tertiary/15 text-tertiary flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px]">visibility</span>
          </div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            3. Honest Counts, Zero Vanity
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
            We never invent stats, fake testimonials, or artificial engagement numbers. Every
            counter starts at 0 and reflects real community responses, volunteers, and connections.
          </p>
        </div>
      </section>

      {/* Code of Conduct */}
      <section
        id="conduct"
        className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-md"
      >
        <div className="flex items-center gap-2 text-primary">
          <span className="material-symbols-outlined text-[22px]">handshake</span>
          <h2 className="font-headline-md text-headline-md text-on-surface">
            Community Code of Conduct
          </h2>
        </div>
        <ul className="list-disc pl-5 space-y-2 font-body-md text-body-md text-on-surface-variant">
          <li>
            <strong className="text-on-surface">Critique specs, never people:</strong> When giving
            guidance or flagging similar existing projects, keep feedback technical, constructive,
            and kind.
          </li>
          <li>
            <strong className="text-on-surface">Respect creator attribution:</strong> Always honor
            the poster’s chosen license (All Rights Kept, CC BY, or MIT) and credit contributors on
            the Showcase.
          </li>
          <li>
            <strong className="text-on-surface">No spam or commercial solicitation:</strong>{' '}
            Synapse is a non-profit maker registry, not a paid agency lead board. Use the Report
            button on any page to flag violations.
          </li>
        </ul>
      </section>

      {/* Plain-Language Firestore Security Rules Explanation */}
      <section
        id="security"
        className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-md border border-surface-variant/40"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-secondary">
            <span className="material-symbols-outlined text-[22px]">shield_lock</span>
            <h2 className="font-headline-md text-headline-md text-on-surface">
              Firestore Security Rules (Plain-Language Summary)
            </h2>
          </div>
          <span className="font-code-sm text-code-sm text-secondary bg-secondary/10 px-2.5 py-1 rounded">
            Strict Rules Deployed
          </span>
        </div>

        <p className="font-body-md text-body-md text-on-surface-variant">
          Synapse never uses open test-mode rules. Every database collection is protected by strict
          server-enforced Firestore security rules:
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
          <div className="bg-surface-container p-space-md rounded-xl">
            <h3 className="font-title-md text-title-md text-on-surface mb-1">
              Public Reading &amp; Authenticated Creation
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Anyone can browse ideas, responses, volunteers, and connections without signing in.
              Only signed-in users can create new ideas, responses, volunteer offers, or connections
              (with their own <code>request.auth.uid</code>).
            </p>
          </div>

          <div className="bg-surface-container p-space-md rounded-xl">
            <h3 className="font-title-md text-title-md text-on-surface mb-1">
              Strict Ownership on Edits &amp; Deletes
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Only an idea’s author can edit or delete their idea, change its lifecycle status (
              <code>open</code>, <code>in-progress</code>, <code>built</code>), or accept/decline
              volunteers. Only a response’s author can edit or delete their response.
            </p>
          </div>

          <div className="bg-surface-container p-space-md rounded-xl">
            <h3 className="font-title-md text-title-md text-on-surface mb-1">
              Transactional Counter Protection
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              New ideas must start with all counters at <code>0</code>. Clients cannot set arbitrary
              counter numbers—non-owners can only increment or decrement counters by at most{' '}
              <code>1</code> inside atomic Firestore transactions.
            </p>
          </div>

          <div className="bg-surface-container p-space-md rounded-xl">
            <h3 className="font-title-md text-title-md text-on-surface mb-1">
              User Privacy &amp; Admin-Only Reports
            </h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Users can only write to their own <code>users/&#123;uid&#125;</code> profile and read
              their own <code>notifications</code>. Moderation <code>reports</code> can be submitted
              by any signed-in user, but can only be read or resolved by UIDs listed in the{' '}
              <code>admins</code> collection.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
