import React from 'react';

export const RouteSkeleton: React.FC = () => {
  return (
    <div
      className="max-w-7xl mx-auto px-margin py-space-xl w-full animate-pulse"
      role="status"
      aria-label="Loading page content"
    >
      <div className="h-6 w-48 bg-surface-container-high rounded-full mb-space-md" />
      <div className="h-12 w-3/4 max-w-xl bg-surface-container-high rounded-xl mb-space-sm" />
      <div className="h-5 w-2/3 max-w-lg bg-surface-container rounded-lg mb-space-xl" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className="bg-surface-container-low rounded-2xl p-space-lg h-64 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="h-5 w-28 bg-surface-container-high rounded-full" />
              <div className="h-7 w-full bg-surface-container-high rounded-lg" />
              <div className="h-4 w-5/6 bg-surface-container rounded" />
              <div className="h-4 w-2/3 bg-surface-container rounded" />
            </div>
            <div className="h-10 w-full bg-surface-container rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
};

export const IdeaCardSkeletonGrid: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-lg">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-surface-container-low rounded-2xl p-space-lg h-72 flex flex-col justify-between animate-pulse"
        >
          <div className="space-y-3">
            <div className="flex justify-between">
              <div className="h-5 w-24 bg-surface-container-high rounded-full" />
              <div className="h-5 w-16 bg-surface-container-high rounded-full" />
            </div>
            <div className="h-6 w-full bg-surface-container-high rounded-lg" />
            <div className="h-4 w-11/12 bg-surface-container rounded" />
            <div className="h-4 w-3/4 bg-surface-container rounded" />
          </div>
          <div className="h-12 w-full bg-surface-container rounded-xl" />
        </div>
      ))}
    </div>
  );
};
