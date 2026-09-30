import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Idea } from '../types/synapse';

interface BookmarkButtonProps {
  idea: Idea;
  variant?: 'icon' | 'button';
  className?: string;
}

export const BookmarkButton: React.FC<BookmarkButtonProps> = ({
  idea,
  variant = 'icon',
  className = '',
}) => {
  const { user, isBookmarked, toggleBookmark, showToast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);

  const saved = isBookmarked(idea.id);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      showToast('Sign in with Google to save ideas to your profile.', 'info');
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }

    if (busy) return;
    setBusy(true);
    try {
      await toggleBookmark(idea);
    } finally {
      setBusy(false);
    }
  };

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-pressed={saved}
        title={saved ? 'Remove from your saved bookmarks' : 'Save idea to your profile for quick access'}
        className={`min-h-[44px] px-3.5 rounded-lg font-title-md text-title-md flex items-center gap-1.5 transition-all focus-visible:outline-2 focus-visible:outline-primary-container ${
          saved
            ? 'bg-primary-container/20 text-primary border border-primary/40 hover:bg-primary-container/30'
            : 'bg-surface-container hover:bg-surface-container-high text-on-surface'
        } ${className}`}
      >
        <span className="material-symbols-outlined text-[18px]">
          {saved ? 'bookmark_added' : 'bookmark'}
        </span>
        <span>{saved ? 'Saved' : 'Bookmark'}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? `Remove "${idea.title}" from bookmarks` : `Save "${idea.title}" to bookmarks`}
      title={saved ? 'Saved to profile (click to remove)' : 'Save idea to profile'}
      className={`min-w-[38px] min-h-[38px] rounded-lg flex items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-primary-container ${
        saved
          ? 'bg-primary-container/20 text-primary hover:bg-primary-container/30'
          : 'bg-surface-container-high/70 hover:bg-surface-bright text-on-surface-variant hover:text-on-surface'
      } ${className}`}
    >
      <span className="material-symbols-outlined text-[19px]">
        {saved ? 'bookmark_added' : 'bookmark'}
      </span>
    </button>
  );
};
