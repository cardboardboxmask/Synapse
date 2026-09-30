import React from 'react';
import { Link } from 'react-router-dom';
import { PageMeta } from '../components/PageMeta';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-margin py-24 text-center flex flex-col items-center gap-space-lg">
      <PageMeta
        title="404 Page Not Found — Synapse"
        description="The requested route does not exist in the Synapse network."
      />
      <div className="w-16 h-16 rounded-2xl bg-surface-container-high text-primary flex items-center justify-center font-headline-md font-bold">
        404
      </div>
      <div className="flex flex-col gap-space-xs">
        <span className="font-code-sm text-code-sm text-secondary uppercase tracking-widest">
          Unlinked Coordinates
        </span>
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          This route does not exist in the registry
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant max-w-md mx-auto">
          The URL you followed may be broken or the specification node may have been removed by its
          creator.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-space-md">
        <Link
          to="/"
          className="min-h-[48px] px-space-xl rounded-lg bg-primary-container text-on-primary font-title-md text-title-md inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">home</span>
          Return Home
        </Link>
        <Link
          to="/explore"
          className="min-h-[48px] px-space-xl rounded-lg bg-surface-container-high text-on-surface font-title-md text-title-md inline-flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">explore</span>
          Explore Ideas
        </Link>
      </div>
    </div>
  );
};
