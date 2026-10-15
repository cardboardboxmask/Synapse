import React from 'react';
import { Link } from 'react-router-dom';
import { PageMeta } from '../components/PageMeta';

export const LegalPage: React.FC<{ type: 'privacy' | 'terms' }> = ({ type }) => {
  const isPrivacy = type === 'privacy';

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-margin py-space-xl flex flex-col gap-space-xl">
      <PageMeta
        title={isPrivacy ? 'Privacy Policy — Synapse' : 'Terms of Service — Synapse'}
        description={
          isPrivacy
            ? 'Plain-language privacy policy for Synapse: no data harvesting, no tracking ads.'
            : 'Plain-language terms of service for Synapse: open collaboration, creator ownership.'
        }
      />

      <div className="bg-surface-container-low rounded-2xl p-space-xl sm:p-10 flex flex-col gap-space-md border border-surface-variant/40">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-container-high text-secondary font-code-sm text-xs w-fit uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-secondary" />
          {isPrivacy ? 'Privacy Policy' : 'Terms of Service'}
        </div>

        <h1 className="font-headline-xl text-headline-lg-mobile sm:text-headline-xl text-on-surface tracking-tight">
          {isPrivacy ? 'Privacy Policy' : 'Terms of Service'}
        </h1>

        <p className="font-body-md text-on-surface-variant leading-relaxed">
          Last updated: October 2026. Plain language, no confusing legal tricks.
        </p>

        {isPrivacy ? (
          <div className="flex flex-col gap-6 text-on-surface font-body-md leading-relaxed pt-2">
            <div>
              <h2 className="font-title-lg text-title-lg font-semibold text-on-surface mb-2">
                1. What We Collect
              </h2>
              <p className="text-on-surface-variant">
                We only collect the information you choose to provide when signing in (via Google Authentication: your display name, email, and profile avatar) and the ideas, responses, volunteer offers, and connection notes you publicly post on Synapse.
              </p>
            </div>

            <div>
              <h2 className="font-title-lg text-title-lg font-semibold text-on-surface mb-2">
                2. No Trackers, No Ad Networks
              </h2>
              <p className="text-on-surface-variant">
                We do not sell your personal information, rent your email address, or embed third-party surveillance ad networks. Synapse is a non-profit, free initiative built by a solo maker.
              </p>
            </div>

            <div>
              <h2 className="font-title-lg text-title-lg font-semibold text-on-surface mb-2">
                3. Public Information
              </h2>
              <p className="text-on-surface-variant">
                Synapse is an open idea registry. Ideas and discussions you post are visible to the public so community members and builders can collaborate with you. You can edit or delete your posted ideas at any time from your profile or idea page.
              </p>
            </div>

            <div>
              <h2 className="font-title-lg text-title-lg font-semibold text-on-surface mb-2">
                4. Account Deletion &amp; Data Rights
              </h2>
              <p className="text-on-surface-variant">
                You can delete your account at any time in your profile settings. When deleted, your account is anonymized, and your personal credentials are removed.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6 text-on-surface font-body-md leading-relaxed pt-2">
            <div>
              <h2 className="font-title-lg text-title-lg font-semibold text-on-surface mb-2">
                1. Ideas Belong to You
              </h2>
              <p className="text-on-surface-variant">
                You retain complete ownership and authorship of any ideas or specifications you post to Synapse. Ideas are shared openly so people can help. Synapse claims no equity, licensing fees, or patent ownership.
              </p>
            </div>

            <div>
              <h2 className="font-title-lg text-title-lg font-semibold text-on-surface mb-2">
                2. Voluntary Collaboration
              </h2>
              <p className="text-on-surface-variant">
                All collaboration, feedback, and volunteer offers on Synapse are voluntary and zero-pressure. Neither posters nor builders are bound by employment contracts, warranties, or delivery commitments through Synapse.
              </p>
            </div>

            <div>
              <h2 className="font-title-lg text-title-lg font-semibold text-on-surface mb-2">
                3. Community Respect &amp; Safety
              </h2>
              <p className="text-on-surface-variant">
                We do not tolerate harassment, hate speech, spam, malicious code, or intellectual property impersonation. The community moderation queue reviews reports, and accounts that violate guidelines will be suspended.
              </p>
            </div>

            <div>
              <h2 className="font-title-lg text-title-lg font-semibold text-on-surface mb-2">
                4. As-Is Service
              </h2>
              <p className="text-on-surface-variant">
                Synapse is provided free of charge on an &ldquo;as is&rdquo; basis for the open-source community. Please use standard maker judgment when testing third-party prototypes or hardware schematics.
              </p>
            </div>
          </div>
        )}

        <div className="pt-6 border-t border-surface-variant/30 flex items-center gap-4">
          <Link
            to="/"
            className="min-h-[44px] px-5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-title-md inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Back to Home
          </Link>
          <Link
            to={isPrivacy ? '/terms' : '/privacy'}
            className="text-primary hover:underline font-label-md"
          >
            {isPrivacy ? 'View Terms of Service' : 'View Privacy Policy'}
          </Link>
        </div>
      </div>
    </div>
  );
};
