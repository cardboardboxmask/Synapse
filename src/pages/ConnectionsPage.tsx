import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { PageMeta } from '../components/PageMeta';
import {
  connectIdeasWithTransaction,
  deleteConnectionWithTransaction,
  subscribeToAuditLogs,
  updateConnectionStatus,
} from '../firebase';
import { AuditLogEntry, IdeaConnection } from '../types/synapse';
import { checkRateLimit, formatRelativeTime } from '../utils/sanitize';
import { BookmarkButton } from '../components/BookmarkButton';
import {
  Link2,
  Network,
  History,
  Shield,
  User,
  Lock,
  ArrowRight,
  X,
} from 'lucide-react';

export const ConnectionsPage: React.FC = () => {
  const { user, profile, isAdmin, ideas, connections, showToast, openConfirm } = useApp();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'connections' | 'activity-log'>('connections');
  const [logFilter, setLogFilter] = useState<'all' | 'status' | 'created' | 'deleted'>('all');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [ideaAId, setIdeaAId] = useState(() => ideas[0]?.id || '');
  const [ideaBId, setIdeaBId] = useState(() => ideas[1]?.id || '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Stream real-time audit logs for Admin review
  useEffect(() => {
    if (!isAdmin) {
      setAuditLogs([]);
      return;
    }
    const unsub = subscribeToAuditLogs((logs) => {
      setAuditLogs(logs.filter((entry) => entry.targetType === 'connection'));
    }, 200);
    return () => unsub();
  }, [isAdmin]);

  // Combine auditLogs with existing connection status timestamps so pre-audit connections also appear in the timeline (Admin only)
  const allConnectionEvents = useMemo(() => {
    if (!isAdmin) return [];
    const combined: AuditLogEntry[] = [...auditLogs];
    const loggedTargetIds = new Set(auditLogs.map((l) => l.targetId));

    for (const conn of connections) {
      if (!loggedTargetIds.has(conn.id)) {
        combined.push({
          id: `conn-init-${conn.id}`,
          actorId: conn.createdBy,
          actorName: conn.createdByName,
          action: 'connection.create',
          targetType: 'connection',
          targetId: conn.id,
          summary: `Linked "${conn.ideaATitle}" ↔ "${conn.ideaBTitle}" (Current status: ${conn.status.toUpperCase()}) — Reason: ${conn.reason}`,
          createdAt: conn.updatedAt || conn.createdAt,
        });
      }
    }

    return combined.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [isAdmin, auditLogs, connections]);

  // Unique actors (User ID + Display Name) for quick User ID selection
  const uniqueLogActors = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of allConnectionEvents) {
      if (entry.actorId && !map.has(entry.actorId)) {
        map.set(entry.actorId, entry.actorName || entry.actorId);
      }
    }
    return Array.from(map.entries()).map(([uid, name]) => ({ uid, name }));
  }, [allConnectionEvents]);

  // Filtered activity logs by action type, specific User ID, and date range
  const connectionActivityHistory = useMemo(() => {
    const trimmedUid = userIdFilter.trim().toLowerCase();
    const startMs = startDateFilter
      ? new Date(`${startDateFilter}T00:00:00`).getTime()
      : null;
    const endMs = endDateFilter
      ? new Date(`${endDateFilter}T23:59:59.999`).getTime()
      : null;

    return allConnectionEvents.filter((entry) => {
      if (logFilter === 'status' && entry.action !== 'connection.status_change') return false;
      if (logFilter === 'created' && entry.action !== 'connection.create') return false;
      if (logFilter === 'deleted' && entry.action !== 'connection.delete') return false;

      if (trimmedUid) {
        const actorIdMatch = (entry.actorId || '').toLowerCase().includes(trimmedUid);
        const actorNameMatch = (entry.actorName || '').toLowerCase().includes(trimmedUid);
        if (!actorIdMatch && !actorNameMatch) return false;
      }

      const entryMs = new Date(entry.createdAt).getTime();
      if (startMs !== null && !Number.isNaN(startMs) && entryMs < startMs) return false;
      if (endMs !== null && !Number.isNaN(endMs) && entryMs > endMs) return false;

      return true;
    });
  }, [allConnectionEvents, logFilter, userIdFilter, startDateFilter, endDateFilter]);

  const applyDatePreset = (days: number | null) => {
    if (days === null) {
      setStartDateFilter('');
      setEndDateFilter('');
      return;
    }
    const now = new Date();
    const endStr = now.toISOString().slice(0, 10);
    const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const startStr = start.toISOString().slice(0, 10);
    setStartDateFilter(startStr);
    setEndDateFilter(endStr);
  };

  const hasActiveLogFilters =
    logFilter !== 'all' ||
    Boolean(userIdFilter.trim()) ||
    Boolean(startDateFilter) ||
    Boolean(endDateFilter);

  // Position nodes in an even constellation ring + inner cluster for 2D map
  const nodePositions = useMemo(() => {
    const count = ideas.length || 1;
    return ideas.map((idea, idx) => {
      const angle = (idx / count) * Math.PI * 2 - Math.PI / 2;
      const radiusX = idx % 2 === 0 ? 230 : 155;
      const radiusY = idx % 2 === 0 ? 125 : 85;
      return {
        idea,
        x: Math.round(350 + Math.cos(angle) * radiusX),
        y: Math.round(180 + Math.sin(angle) * radiusY),
      };
    });
  }, [ideas]);

  const posMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    nodePositions.forEach((n) => map.set(n.idea.id, { x: n.x, y: n.y }));
    return map;
  }, [nodePositions]);

  const selectedIdea = useMemo(
    () => ideas.find((i) => i.id === selectedNodeId) || ideas[0],
    [ideas, selectedNodeId]
  );

  const handleOpenLinkFlow = () => {
    if (!user || !profile) {
      showToast('Sign in with Google to link ideas.', 'info');
      navigate('/login?returnTo=%2Fconnections');
      return;
    }
    if (ideas.length >= 2) {
      setIdeaAId(ideas[0].id);
      setIdeaBId(ideas[1].id);
    }
    setShowLinkModal(true);
  };

  const handleCreateConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (ideaAId === ideaBId) {
      showToast('Please choose two different ideas to connect.', 'error');
      return;
    }
    const ideaA = ideas.find((i) => i.id === ideaAId);
    const ideaB = ideas.find((i) => i.id === ideaBId);
    if (!ideaA || !ideaB) return;
    if (reason.trim().length < 5) {
      showToast('Please explain how these two ideas connect.', 'error');
      return;
    }
    const rl = checkRateLimit(`conn-${profile.uid}`, 4000);
    if (!rl.allowed) {
      showToast(`Please wait ${rl.waitSeconds}s before linking again.`, 'error');
      return;
    }
    setSubmitting(true);
    try {
      await connectIdeasWithTransaction({
        ideaA,
        ideaB,
        reason,
        actor: profile,
      });
      setReason('');
      setShowLinkModal(false);
      showToast('Connection added to the Idea Map!', 'success');
    } catch {
      showToast('Could not create connection.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConnection = (conn: IdeaConnection) => {
    openConfirm({
      title: 'Remove Connection?',
      message: `Remove the connection between "${conn.ideaATitle}" and "${conn.ideaBTitle}"? Only an Admin or the makers connected in this link can perform this action.`,
      confirmLabel: 'Remove Connection',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteConnectionWithTransaction(conn);
          showToast('Connection removed and node counts updated.', 'info');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Could not remove connection.';
          showToast(msg, 'error');
        }
      },
    });
  };

  const handleToggleConnectionStatus = async (
    conn: IdeaConnection,
    nextStatus: 'active' | 'declined'
  ) => {
    try {
      await updateConnectionStatus(conn.id, nextStatus);
      showToast(`Connection status updated to ${nextStatus}.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update connection status.';
      showToast(msg, 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-margin py-space-xl flex flex-col gap-space-xl">
      <PageMeta
        title="Connections — Synapse"
        description="See how related ideas connect in list view and on the interactive Idea Map."
      />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-space-md">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/10 text-secondary font-code-sm text-[13px] mb-space-xs">
            <span className="w-2 h-2 rounded-full bg-secondary" />
            Connections
          </div>
          <h1 className="font-headline-lg text-headline-lg-mobile sm:text-headline-lg text-on-surface">
            Connections
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl mt-1 leading-relaxed">
            See how related ideas connect, browse shared goals, or navigate the visual Idea Map below.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenLinkFlow}
          className="min-h-[48px] px-space-xl rounded-lg bg-secondary text-on-secondary font-title-md text-title-md font-semibold inline-flex items-center gap-2 shadow-md hover:opacity-95 transition-opacity self-start md:self-auto"
        >
          <Link2 className="w-5 h-5" />
          <span>Link your idea</span>
        </button>
      </div>

      {/* Tab Navigation: ONLY shown for admin users */}
      {isAdmin && (
        <div className="flex items-center justify-between border-b border-surface-variant/40 gap-4 flex-wrap">
          <div className="flex items-center gap-2" role="tablist" aria-label="Connections Page Tabs">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'connections'}
              onClick={() => setActiveTab('connections')}
              className={`min-h-[44px] px-4 py-2 font-title-md text-title-md border-b-2 transition-colors inline-flex items-center gap-2 ${
                activeTab === 'connections'
                  ? 'border-secondary text-secondary font-semibold'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Network className="w-4 h-4" />
              <span>Connections</span>
              <span className="px-2 py-0.5 rounded-full bg-surface-container-high font-code-sm text-code-sm">
                {connections.length}
              </span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'activity-log'}
              onClick={() => setActiveTab('activity-log')}
              className={`min-h-[44px] px-4 py-2 font-title-md text-title-md border-b-2 transition-colors inline-flex items-center gap-2 ${
                activeTab === 'activity-log'
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <History className="w-4 h-4" />
              <span>Activity Log (Admin)</span>
              <span className="px-2 py-0.5 rounded-full bg-primary-container/20 text-primary font-code-sm text-code-sm">
                {connectionActivityHistory.length}
              </span>
            </button>
          </div>
        </div>
      )}

      {isAdmin && activeTab === 'activity-log' ? (
        <section className="flex flex-col gap-space-lg">
          <div className="bg-surface-container-low rounded-2xl p-space-xl flex flex-col gap-space-md border border-surface-variant/30">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary-container/15 text-primary font-code-sm text-code-sm uppercase mb-1">
                  <Shield className="w-3.5 h-3.5" />
                  Admin Governance Review
                </div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">
                  Connection Status &amp; Lifecycle Activity Log
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  Timestamped history of connection status updates (Active / Declined), new links, and removals across Synapse.
                </p>
              </div>

              {isAdmin && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { id: 'all', label: 'All Events' },
                      { id: 'status', label: 'Status Updates' },
                      { id: 'created', label: 'Created' },
                      { id: 'deleted', label: 'Removed' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLogFilter(item.id)}
                      className={`min-h-[36px] px-3 rounded-lg font-code-sm text-code-sm transition-colors ${
                        logFilter === item.id
                          ? 'bg-primary-container text-on-primary font-semibold'
                          : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Admin Date Range & User ID Filter Controls */}
            {isAdmin && (
              <div className="bg-surface-container rounded-xl p-space-md border border-surface-variant/30 flex flex-col gap-space-md">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-space-md items-end">
                  {/* Specific User ID Input + Quick Select */}
                  <div className="md:col-span-5 flex flex-col gap-1">
                    <label
                      htmlFor="activity-user-id-filter"
                      className="font-code-sm text-code-sm text-on-surface-variant uppercase"
                    >
                      Filter by User ID or Actor
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <User className="w-4 h-4 text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="activity-user-id-filter"
                          type="text"
                          value={userIdFilter}
                          onChange={(e) => setUserIdFilter(e.target.value)}
                          placeholder="Enter exact User ID (UID) or actor name..."
                          className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-container-high border border-surface-variant/40 font-code-sm text-code-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary-container"
                        />
                      </div>
                      {uniqueLogActors.length > 0 && (
                        <select
                          aria-label="Quick select user ID from logs"
                          value={
                            uniqueLogActors.some((a) => a.uid === userIdFilter)
                              ? userIdFilter
                              : ''
                          }
                          onChange={(e) => setUserIdFilter(e.target.value)}
                          className="h-10 px-2.5 rounded-lg bg-surface-container-high border border-surface-variant/40 font-code-sm text-code-sm text-on-surface max-w-[160px]"
                        >
                          <option value="">All Users</option>
                          {uniqueLogActors.map((actor) => (
                            <option key={actor.uid} value={actor.uid}>
                              {actor.name} ({actor.uid.slice(0, 8)}…)
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>

                  {/* Date Range: Start Date */}
                  <div className="md:col-span-3 flex flex-col gap-1">
                    <label
                      htmlFor="activity-start-date"
                      className="font-code-sm text-code-sm text-on-surface-variant uppercase"
                    >
                      Start Date
                    </label>
                    <input
                      id="activity-start-date"
                      type="date"
                      value={startDateFilter}
                      max={endDateFilter || undefined}
                      onChange={(e) => setStartDateFilter(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-surface-container-high border border-surface-variant/40 font-code-sm text-code-sm text-on-surface focus:outline-none focus:border-primary-container"
                    />
                  </div>

                  {/* Date Range: End Date */}
                  <div className="md:col-span-3 flex flex-col gap-1">
                    <label
                      htmlFor="activity-end-date"
                      className="font-code-sm text-code-sm text-on-surface-variant uppercase"
                    >
                      End Date
                    </label>
                    <input
                      id="activity-end-date"
                      type="date"
                      value={endDateFilter}
                      min={startDateFilter || undefined}
                      onChange={(e) => setEndDateFilter(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-surface-container-high border border-surface-variant/40 font-code-sm text-code-sm text-on-surface focus:outline-none focus:border-primary-container"
                    />
                  </div>

                  {/* Clear Button */}
                  <div className="md:col-span-1 flex justify-end">
                    <button
                      type="button"
                      disabled={!hasActiveLogFilters}
                      onClick={() => {
                        setLogFilter('all');
                        setUserIdFilter('');
                        setStartDateFilter('');
                        setEndDateFilter('');
                      }}
                      className="h-10 w-full px-3 rounded-lg bg-surface-container-highest text-on-surface-variant hover:text-on-surface disabled:opacity-40 font-code-sm text-code-sm transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Quick Date Range Presets & Active Count */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-surface-variant/20 flex-wrap font-code-sm text-code-sm">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-on-surface-variant mr-1">Quick Range:</span>
                    <button
                      type="button"
                      onClick={() => applyDatePreset(0)}
                      className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDatePreset(7)}
                      className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                    >
                      Last 7 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDatePreset(30)}
                      className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                    >
                      Last 30 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDatePreset(null)}
                      className="px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant hover:text-on-surface"
                    >
                      All Dates
                    </button>
                  </div>
                  <span className="text-on-surface-variant">
                    Showing <strong className="text-on-surface">{connectionActivityHistory.length}</strong> of{' '}
                    {allConnectionEvents.length} connection events
                  </span>
                </div>
              </div>
            )}

            {!isAdmin ? (
              <div className="bg-surface-container rounded-xl p-10 text-center flex flex-col items-center gap-space-sm border border-surface-variant/30">
                <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-title-lg text-title-lg text-on-surface font-semibold">
                  Admin Access Required
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
                  The timestamped Connection Activity Log is restricted to Synapse administrators to review connection status changes and moderation events.
                </p>
              </div>
            ) : connectionActivityHistory.length === 0 ? (
              <div className="bg-surface-container rounded-xl p-10 text-center flex flex-col items-center gap-space-sm">
                <History className="w-8 h-8 text-on-surface-variant" />
                <h3 className="font-title-md text-title-md text-on-surface font-semibold">
                  No matching connection activity entries
                </h3>
                <p className="font-body-sm text-body-sm text-on-surface-variant max-w-md">
                  Status updates (Mark Active, Decline), newly created links, and connection removals will appear here with exact timestamps.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-space-sm">
                {connectionActivityHistory.map((entry) => {
                  const isStatusChange = entry.action === 'connection.status_change';
                  const isDelete = entry.action === 'connection.delete';
                  const exactTimestamp = new Date(entry.createdAt).toLocaleString([], {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <div
                      key={entry.id}
                      className="bg-surface-container rounded-xl p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-space-md border-l-4 border-primary"
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-2 flex-wrap font-code-sm text-code-sm">
                          <span
                            className={`px-2 py-0.5 rounded uppercase font-semibold ${
                              isStatusChange
                                ? 'bg-primary-container/20 text-primary'
                                : isDelete
                                ? 'bg-error-container text-on-error-container'
                                : 'bg-secondary/15 text-secondary'
                            }`}
                          >
                            {isStatusChange
                              ? 'Status Update'
                              : isDelete
                              ? 'Connection Removed'
                              : 'Connection Created'}
                          </span>
                          <span className="text-on-surface font-medium">
                            Actor: {entry.actorName}
                          </span>
                          <button
                            type="button"
                            onClick={() => setUserIdFilter(entry.actorId)}
                            title="Click to filter logs by this User ID"
                            className="px-2 py-0.5 rounded bg-surface-container-high text-secondary hover:bg-surface-bright transition-colors"
                          >
                            User ID: {entry.actorId}
                          </button>
                          <span className="text-on-surface-variant">
                            · Conn ID: {entry.targetId}
                          </span>
                        </div>

                        <p className="font-body-md text-body-md text-on-surface">
                          {entry.summary}
                        </p>
                      </div>

                      <div className="flex flex-col sm:items-end shrink-0 font-code-sm text-code-sm text-on-surface-variant">
                        <span className="text-on-surface font-medium">{exactTimestamp}</span>
                        <span>{formatRelativeTime(entry.createdAt)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      ) : (
        <>
          {/* 1. LIST VIEW FIRST */}
          <section className="flex flex-col gap-space-md">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              1. Active Connections List ({connections.length})
            </h2>
          </div>
        </div>

        {connections.length === 0 ? (
          <div className="bg-surface-container-low rounded-2xl p-12 text-center flex flex-col items-center gap-space-md">
            <div className="w-14 h-14 rounded-full bg-secondary/10 text-secondary flex items-center justify-center">
              <Network className="w-7 h-7" />
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface">
              0 connections created yet
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
              Spot two ideas that share hardware components, open schemas, or domain goals? Link
              them so builders can collaborate.
            </p>
            <button
              type="button"
              onClick={handleOpenLinkFlow}
              className="min-h-[44px] px-6 rounded-lg bg-secondary text-on-secondary font-title-md text-title-md font-semibold inline-flex items-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              Link Two Ideas
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {connections.map((conn) => {
              const ideaAObj = ideas.find((i) => i.id === conn.ideaA);
              const ideaBObj = ideas.find((i) => i.id === conn.ideaB);
              const authorAId = conn.ideaAAuthorId || ideaAObj?.authorId;
              const authorBId = conn.ideaBAuthorId || ideaBObj?.authorId;
              const isConnectedMaker = Boolean(
                user &&
                  (user.uid === conn.createdBy ||
                    (authorAId && user.uid === authorAId) ||
                    (authorBId && user.uid === authorBId))
              );
              const canManage = Boolean(user && (isAdmin || isConnectedMaker));

              return (
                <div
                  key={conn.id}
                  className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col justify-between gap-space-md border-l-4 border-secondary"
                >
                  <div className="flex flex-col gap-space-xs">
                    <div className="flex items-center justify-between font-code-sm text-code-sm flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded uppercase ${
                            conn.status === 'active'
                              ? 'bg-secondary/15 text-secondary'
                              : conn.status === 'declined'
                              ? 'bg-error-container text-on-error-container'
                              : 'bg-surface-container-highest text-on-surface-variant'
                          }`}
                        >
                          Status: {conn.status}
                        </span>
                        {canManage && (
                          <span className="px-2 py-0.5 rounded bg-primary-container/15 text-primary uppercase">
                            {isAdmin && !isConnectedMaker ? 'Admin Control' : 'Connected Maker'}
                          </span>
                        )}
                      </div>
                      <span className="text-on-surface-variant">
                        {formatRelativeTime(conn.createdAt)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                      <div className="bg-surface-container p-2.5 rounded-xl">
                        <span className="font-code-sm text-code-sm text-on-surface-variant block uppercase">
                          Source Idea
                        </span>
                        <Link
                          to={`/ideas/${conn.ideaA}`}
                          className="font-title-md text-title-md text-on-surface hover:text-primary line-clamp-1"
                        >
                          {conn.ideaATitle}
                        </Link>
                      </div>
                      <div className="bg-surface-container p-2.5 rounded-xl">
                        <span className="font-code-sm text-code-sm text-secondary block uppercase">
                          Connected Idea
                        </span>
                        <Link
                          to={`/ideas/${conn.ideaB}`}
                          className="font-title-md text-title-md text-on-surface hover:text-primary line-clamp-1"
                        >
                          {conn.ideaBTitle}
                        </Link>
                      </div>
                    </div>

                    <div className="pt-1">
                      <span className="font-code-sm text-code-sm text-on-surface-variant uppercase block">
                        Connection Reason
                      </span>
                      <p className="font-body-sm text-body-sm text-on-surface mt-0.5">
                        {conn.reason}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 font-code-sm text-code-sm text-on-surface-variant pt-2 border-t border-surface-variant/20 flex-wrap">
                    <span>Linked by: {conn.createdByName}</span>
                    {canManage ? (
                      <div className="flex items-center gap-2">
                        {conn.status !== 'active' && (
                          <button
                            type="button"
                            onClick={() => handleToggleConnectionStatus(conn, 'active')}
                            className="px-2.5 py-1 rounded bg-secondary/20 text-secondary hover:bg-secondary hover:text-on-secondary transition-colors"
                          >
                            Mark Active
                          </button>
                        )}
                        {conn.status !== 'declined' && (
                          <button
                            type="button"
                            onClick={() => handleToggleConnectionStatus(conn, 'declined')}
                            className="px-2.5 py-1 rounded bg-surface-container-highest text-on-surface-variant hover:text-on-surface transition-colors"
                          >
                            Decline
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDeleteConnection(conn)}
                          className="px-2.5 py-1 rounded bg-surface-container-highest text-on-surface-variant hover:text-error transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-on-surface-variant/70 text-[12px]">
                        <Lock className="w-3.5 h-3.5" />
                        Admin &amp; connected makers only
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. INTERACTIVE IDEA MAP */}
      <section className="flex flex-col gap-space-md">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-headline-sm text-headline-sm text-on-surface">
              2. Interactive Idea Map
            </h2>
            <p className="font-body-sm text-[13px] text-on-surface-variant">
              See how related ideas connect. Tap or click any idea to inspect it or link it with another.
            </p>
          </div>
          <div className="flex items-center gap-4 font-code-sm text-code-sm">
            <span className="flex items-center gap-1.5 text-primary">
              <span className="w-2.5 h-2.5 rounded-full bg-primary-container" />
              Needs a Builder
            </span>
            <span className="flex items-center gap-1.5 text-tertiary">
              <span className="w-2.5 h-2.5 rounded-full bg-tertiary" />
              Needs Guidance
            </span>
            <span className="flex items-center gap-1.5 text-secondary">
              <span className="w-4 h-0.5 bg-secondary" />
              Connection Edge
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-stretch">
          <div className="lg:col-span-8 bg-surface-container-lowest rounded-2xl p-space-md border border-surface-variant/40 flex items-center justify-center overflow-hidden min-h-[360px]">
            <svg
              viewBox="0 0 700 360"
              className="w-full h-full max-h-[420px] touch-manipulation select-none"
              role="img"
              aria-label="Interactive 2D Idea Map of Synapse Ideas"
            >
              {/* Subtle radial rings */}
              <circle
                cx="350"
                cy="180"
                r="95"
                stroke="#31353f"
                strokeDasharray="4 4"
                fill="none"
                strokeWidth="1"
              />
              <circle
                cx="350"
                cy="180"
                r="195"
                stroke="#31353f"
                strokeDasharray="4 4"
                fill="none"
                strokeWidth="1"
              />

              {/* Explicit Connection Edges in Teal (#44e2cd) for active connections */}
              {connections
                .filter((conn) => conn.status !== 'declined')
                .map((conn) => {
                  const pA = posMap.get(conn.ideaA);
                  const pB = posMap.get(conn.ideaB);
                  if (!pA || !pB) return null;
                  return (
                    <line
                      key={conn.id}
                      x1={pA.x}
                      y1={pA.y}
                      x2={pB.x}
                      y2={pB.y}
                      stroke="#44e2cd"
                      strokeWidth="2.5"
                    />
                  );
                })}

              {/* Nodes */}
              {nodePositions.map(({ idea, x, y }) => {
                const isSelected = selectedIdea?.id === idea.id;
                const strokeColor = idea.helpTrack === 'builder' ? '#F5A524' : '#cbceff';
                return (
                  <g
                    key={idea.id}
                    onClick={() => setSelectedNodeId(idea.id)}
                    className="cursor-pointer"
                    tabIndex={0}
                    role="button"
                    aria-label={`Select node ${idea.title}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedNodeId(idea.id);
                      }
                    }}
                  >
                    {isSelected && (
                      <circle
                        cx={x}
                        cy={y}
                        r="20"
                        fill={strokeColor}
                        fillOpacity="0.18"
                      />
                    )}
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? 13 : 10}
                      fill="#181c25"
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                    <circle cx={x} cy={y} r="4" fill={strokeColor} />
                    <text
                      x={x}
                      y={y + 24}
                      textAnchor="middle"
                      fill="#e2e2e6"
                      fontFamily="Space Grotesk"
                      fontSize="11"
                      fontWeight={isSelected ? '700' : '500'}
                    >
                      {idea.title.split(':')[0].slice(0, 18)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Selected Node Inspector */}
          <div className="lg:col-span-4 bg-surface-container-low rounded-2xl p-space-lg flex flex-col justify-between gap-space-md">
            {selectedIdea ? (
              <>
                <div className="flex flex-col gap-space-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-code-sm text-code-sm text-secondary uppercase">
                      Selected Node
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-surface-container-high font-label-sm text-label-sm uppercase">
                      {selectedIdea.category}
                    </span>
                  </div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface">
                    {selectedIdea.title}
                  </h3>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">
                    {selectedIdea.summary}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedIdea.tags.map((t) => (
                      <span
                        key={t}
                        className="font-code-sm text-code-sm bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-space-md border-t border-surface-variant/30">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/ideas/${selectedIdea.id}`}
                      className="flex-1 min-h-[44px] px-4 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md flex items-center justify-center gap-2 font-semibold hover:opacity-90 transition-opacity"
                    >
                      <span>View idea</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <BookmarkButton idea={selectedIdea} variant="button" />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIdeaAId(selectedIdea.id);
                      handleOpenLinkFlow();
                    }}
                    className="min-h-[44px] px-4 rounded-lg bg-surface-container-high text-secondary font-title-md text-title-md flex items-center justify-center gap-2 hover:bg-surface-bright"
                  >
                    <Network className="w-4 h-4" />
                    <span>Link with another idea</span>
                  </button>
                </div>
              </>
            ) : (
              <p className="text-on-surface-variant">Select an idea on the map.</p>
            )}
          </div>
        </div>
      </section>
        </>
      )}

      {/* Link Two Ideas Modal */}
      {showLinkModal && (
        <div
          className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-surface-container w-full max-w-lg rounded-2xl p-space-xl flex flex-col gap-space-md shadow-2xl border border-surface-variant/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-secondary">
                <Network className="w-6 h-6" />
                <h3 className="font-headline-sm text-headline-sm text-on-surface">
                  Link Two Complementary Ideas
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-on-surface-variant hover:text-on-surface rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateConnection} className="flex flex-col gap-space-md">
              <div>
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                  First Idea
                </label>
                <select
                  value={ideaAId}
                  onChange={(e) => setIdeaAId(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface"
                >
                  {ideas.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                  Second Idea
                </label>
                <select
                  value={ideaBId}
                  onChange={(e) => setIdeaBId(e.target.value)}
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface"
                >
                  {ideas.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1">
                  How do they connect?
                </label>
                <textarea
                  rows={3}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describe the shared protocol, hardware module, or complementary workflow..."
                  className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface"
                />
              </div>

              <div className="flex justify-end gap-space-sm">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="min-h-[44px] px-4 rounded-lg text-on-surface-variant hover:text-on-surface font-title-md text-title-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="min-h-[44px] px-6 rounded-lg bg-secondary text-on-secondary font-title-md text-title-md font-semibold"
                >
                  {submitting ? 'Linking...' : 'Create Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
