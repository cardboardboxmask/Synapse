import React from 'react';
import { Link, Navigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import { PageMeta } from '../components/PageMeta';
import { RouteSkeleton } from '../components/Skeletons';
import { db, deleteNotification } from '../firebase';
import { UserNotification } from '../types/synapse';
import { formatRelativeTime } from '../utils/sanitize';

export const NotificationsPage: React.FC = () => {
  const { user, authReady, ideas, notifications, unreadCount, showToast } = useApp();

  if (!authReady) return <RouteSkeleton />;
  if (!user) {
    return <Navigate to="/login?returnTo=%2Fnotifications" replace />;
  }

  const isNotificationTargetMissing = (n: UserNotification): boolean => {
    if (n.targetDeleted) return true;
    const match = n.link.match(/^\/ideas\/([^/?#]+)/);
    if (match && match[1]) {
      const targetIdeaId = decodeURIComponent(match[1]);
      return !ideas.some((i) => i.id === targetIdeaId);
    }
    return false;
  };

  const markAsRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, 'users', user.uid, 'notifications', notifId), {
        read: true,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      showToast('Could not update notification.', 'error');
    }
  };

  const handleDeleteNotification = async (notifId: string) => {
    try {
      await deleteNotification(user.uid, notifId);
      showToast('Notification removed.', 'info');
    } catch {
      showToast('Could not delete notification.', 'error');
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    const now = new Date().toISOString();
    await Promise.all(
      unread.map((n) =>
        updateDoc(doc(db, 'users', user.uid, 'notifications', n.id), {
          read: true,
          updatedAt: now,
        })
      )
    );
    showToast('All notifications marked as read.', 'success');
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-margin py-space-xl flex flex-col gap-space-lg">
      <PageMeta
        title="Notifications — Synapse"
        description="Your Synapse notifications for new responses, volunteer offers, connections, and status updates."
        noindex
      />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Notifications</h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Deduplicated alerts for responses, volunteer offers, connection links, and status
            changes.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="min-h-[44px] px-4 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-md text-label-md"
          >
            Mark all as read ({unreadCount})
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="bg-surface-container-low rounded-2xl p-12 text-center flex flex-col items-center gap-space-sm">
          <span className="material-symbols-outlined text-[36px] text-on-surface-variant/60">
            notifications_none
          </span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">
            0 notifications
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
            When someone responds to your idea, offers to help build, or connects a spec, it will
            appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-space-sm">
          {notifications.map((n) => {
            const targetMissing = isNotificationTargetMissing(n);

            return (
              <div
                key={n.id}
                className={`p-space-lg rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-space-md ${
                  n.read
                    ? 'bg-surface-container-low opacity-80'
                    : 'bg-surface-container border-l-4 border-primary-container'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-title-md text-title-md text-on-surface">{n.title}</span>
                    {targetMissing && (
                      <span className="px-2 py-0.5 rounded bg-error-container text-on-error-container font-code-sm text-[11px] uppercase">
                        Target Removed
                      </span>
                    )}
                    <span className="font-code-sm text-code-sm text-on-surface-variant">
                      · {formatRelativeTime(n.updatedAt || n.createdAt)}
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {targetMissing
                      ? 'The target specification associated with this notification is no longer available.'
                      : n.message}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!targetMissing && (
                    <Link
                      to={n.link}
                      onClick={() => !n.read && markAsRead(n.id)}
                      className="min-h-[40px] px-4 rounded-lg bg-surface-container-high text-secondary font-label-md text-label-md inline-flex items-center"
                    >
                      Open
                    </Link>
                  )}
                  {!n.read && (
                    <button
                      type="button"
                      onClick={() => markAsRead(n.id)}
                      className="min-h-[40px] px-3 rounded-lg text-on-surface-variant hover:text-on-surface font-code-sm text-code-sm"
                    >
                      Mark read
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteNotification(n.id)}
                    aria-label="Delete notification"
                    title="Delete notification"
                    className="min-w-[40px] min-h-[40px] rounded-lg bg-surface-container-high text-on-surface-variant hover:text-error flex items-center justify-center"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
