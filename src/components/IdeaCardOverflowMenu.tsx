import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { MoreVertical, Flag, Link2, Edit3 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SOLE_ADMIN_UID } from '../firebase';
import { Idea } from '../types/synapse';

interface IdeaCardOverflowMenuProps {
  idea: Idea;
  className?: string;
}

export const IdeaCardOverflowMenu: React.FC<IdeaCardOverflowMenuProps> = ({
  idea,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user, openReportModal, showToast, isAdmin } = useApp();

  const isAuthor = Boolean(
    user &&
      (user.uid === idea.authorId ||
        user.uid === idea.authorUid ||
        (isAdmin &&
          (idea.authorId === SOLE_ADMIN_UID ||
            idea.authorUid === SOLE_ADMIN_UID ||
            idea.authorUsername === 'admin' ||
            idea.authorUsername === 'cardboardboxmask')))
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const url = `${window.location.origin}/ideas/${idea.id}`;
      await navigator.clipboard.writeText(url);
      showToast('Idea link copied to clipboard!', 'success');
    } catch {
      showToast('Failed to copy link.', 'error');
    }
    setOpen(false);
  };

  const handleReport = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openReportModal({
      targetType: 'idea',
      targetId: idea.id,
      targetTitle: idea.title,
    });
    setOpen(false);
  };

  return (
    <div className={`relative inline-block ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={`Options for ${idea.title}`}
        aria-haspopup="true"
        aria-expanded={open}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 top-full mt-1.5 w-44 rounded-xl bg-surface-container-high border border-surface-variant/40 shadow-xl py-1 z-30 flex flex-col text-left"
          onClick={(e) => e.stopPropagation()}
        >
          {isAuthor && (
            <Link
              to={`/ideas/${idea.id}/edit`}
              onClick={() => setOpen(false)}
              role="menuitem"
              className="px-3 py-2 text-[13px] font-medium text-on-surface hover:bg-surface-container-highest flex items-center gap-2 transition-colors"
            >
              <Edit3 className="w-4 h-4 text-secondary" />
              <span>Edit idea</span>
            </Link>
          )}

          <button
            type="button"
            onClick={handleCopyLink}
            role="menuitem"
            className="w-full px-3 py-2 text-[13px] font-medium text-on-surface hover:bg-surface-container-highest flex items-center gap-2 transition-colors text-left"
          >
            <Link2 className="w-4 h-4 text-on-surface-variant" />
            <span>Copy link</span>
          </button>

          <button
            type="button"
            onClick={handleReport}
            role="menuitem"
            className="w-full px-3 py-2 text-[13px] font-medium text-error hover:bg-error/10 flex items-center gap-2 transition-colors text-left"
          >
            <Flag className="w-4 h-4 text-error" />
            <span>Report idea</span>
          </button>
        </div>
      )}
    </div>
  );
};
