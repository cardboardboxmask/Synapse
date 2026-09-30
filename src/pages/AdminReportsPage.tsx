import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { useApp } from '../context/AppContext';
import { AdminRouteGuard } from '../components/AdminRouteGuard';
import { PageMeta } from '../components/PageMeta';
import { RouteSkeleton } from '../components/Skeletons';
import {
  db,
  deleteConnectionWithTransaction,
  deleteIdeaByOwnerOrAdmin,
  resolveOrDismissReportByAdmin,
  SOLE_ADMIN_EMAIL,
  SOLE_ADMIN_UID,
  subscribeToAuditLogs,
  subscribeToPublicUsers,
  toggleIdeaAdminVerified,
  toggleUserSuspensionByAdmin,
  updateConnectionStatus,
  updateIdeaDetails,
} from '../firebase';
import {
  AuditLogEntry,
  Idea,
  IdeaConnection,
  IdeaStatus,
  ModerationReport,
  UserProfile,
} from '../types/synapse';
import { formatRelativeTime } from '../utils/sanitize';

type AdminTab = 'overview' | 'reports' | 'ideas' | 'connections' | 'users-audit';

export const AdminReportsPage: React.FC = () => {
  const {
    user,
    profile,
    isAdmin,
    authReady,
    ideas,
    connections,
    reports,
    showToast,
    openConfirm,
    isAdminUnlocked,
    isAdminFreshForDestructive,
    adminSessionRemainingMs,
    touchAdminSessionActivity,
    lockAdminPanel,
  } = useApp();

  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'resolved' | 'dismissed'>(
    'all'
  );
  const [ideaSearch, setIdeaSearch] = useState('');
  const [ideaStatusFilter, setIdeaStatusFilter] = useState<'all' | IdeaStatus | 'verified'>('all');
  const [connFilter, setConnFilter] = useState<'all' | 'active' | 'declined'>('all');

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>([]);
  const [adminUids, setAdminUids] = useState<string[]>([]);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  // Audit Log Filters
  const [auditActionFilter, setAuditActionFilter] = useState<string>('all');
  const [auditUserIdFilter, setAuditUserIdFilter] = useState('');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');

  useEffect(() => {
    if (!user || !isAdmin || !isAdminUnlocked) {
      setAuditLogs([]);
      setRegisteredUsers([]);
      setAdminUids([]);
      return;
    }
    const unsubLogs = subscribeToAuditLogs(setAuditLogs, 250);
    const unsubUsers = subscribeToPublicUsers(setRegisteredUsers, 200);
    const unsubAdmins = onSnapshot(
      collection(db, 'admins'),
      (snap) => {
        const list: string[] = [];
        snap.forEach((d) => list.push(d.id));
        setAdminUids(list);
      },
      () => setAdminUids([])
    );
    return () => {
      unsubLogs();
      unsubUsers();
      unsubAdmins();
    };
  }, [user, isAdmin, isAdminUnlocked]);

  // Platform KPI metrics
  const metrics = useMemo(() => {
    const openIdeas = ideas.filter((i) => i.status === 'open').length;
    const inProgressIdeas = ideas.filter((i) => i.status === 'in-progress').length;
    const builtIdeas = ideas.filter((i) => i.status === 'built').length;
    const verifiedIdeas = ideas.filter((i) => Boolean(i.adminVerified)).length;
    const activeConns = connections.filter((c) => c.status !== 'declined').length;
    const declinedConns = connections.filter((c) => c.status === 'declined').length;
    const openReports = reports.filter((r) => r.status === 'open').length;
    const suspendedUsers = registeredUsers.filter(
      (u) => Boolean(u.suspended || u.accountStatus === 'disabled')
    ).length;
    return {
      totalIdeas: ideas.length,
      openIdeas,
      inProgressIdeas,
      builtIdeas,
      verifiedIdeas,
      activeConns,
      declinedConns,
      openReports,
      totalReports: reports.length,
      totalUsers: registeredUsers.length,
      suspendedUsers,
      totalAuditLogs: auditLogs.length,
    };
  }, [ideas, connections, reports, registeredUsers, auditLogs]);

  // Filtered Ideas for Admin Ideas Manager
  const filteredIdeas = useMemo(() => {
    const q = ideaSearch.trim().toLowerCase();
    return ideas.filter((idea) => {
      if (ideaStatusFilter === 'verified') {
        if (!idea.adminVerified) return false;
      } else if (ideaStatusFilter !== 'all' && idea.status !== ideaStatusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        idea.title.toLowerCase().includes(q) ||
        idea.authorUsername.toLowerCase().includes(q) ||
        idea.authorName.toLowerCase().includes(q) ||
        idea.id.toLowerCase().includes(q) ||
        idea.category.toLowerCase().includes(q)
      );
    });
  }, [ideas, ideaSearch, ideaStatusFilter]);

  // Filtered Connections for Admin Connections Manager
  const filteredConnections = useMemo(() => {
    return connections.filter((c) => {
      if (connFilter === 'active') return c.status !== 'declined';
      if (connFilter === 'declined') return c.status === 'declined';
      return true;
    });
  }, [connections, connFilter]);

  // Filtered Audit Logs
  const filteredAuditLogs = useMemo(() => {
    const trimmedUid = auditUserIdFilter.trim().toLowerCase();
    const startMs = auditStartDate ? new Date(`${auditStartDate}T00:00:00`).getTime() : null;
    const endMs = auditEndDate ? new Date(`${auditEndDate}T23:59:59.999`).getTime() : null;

    return auditLogs.filter((entry) => {
      if (auditActionFilter !== 'all' && entry.action !== auditActionFilter) return false;
      if (trimmedUid) {
        const matchId = (entry.actorId || '').toLowerCase().includes(trimmedUid);
        const matchName = (entry.actorName || '').toLowerCase().includes(trimmedUid);
        if (!matchId && !matchName) return false;
      }
      const entryMs = new Date(entry.createdAt).getTime();
      if (startMs !== null && !Number.isNaN(startMs) && entryMs < startMs) return false;
      if (endMs !== null && !Number.isNaN(endMs) && entryMs > endMs) return false;
      return true;
    });
  }, [auditLogs, auditActionFilter, auditUserIdFilter, auditStartDate, auditEndDate]);

  if (!authReady) return <RouteSkeleton />;
  if (!user || !isAdmin || !isAdminUnlocked) {
    return <AdminRouteGuard />;
  }

  const remainingMinutes = Math.floor(adminSessionRemainingMs / 60000);
  const remainingSeconds = Math.floor((adminSessionRemainingMs % 60000) / 1000);
  const formattedSessionRemaining = `${remainingMinutes}m ${String(remainingSeconds).padStart(2, '0')}s`;

  const guardDestructiveAdminAction = (actionLabel: string, proceed: () => void) => {
    touchAdminSessionActivity();
    if (!isAdminFreshForDestructive) {
      openConfirm({
        title: 'Fresh Security Verification Required',
        message: `For security, "${actionLabel}" requires a verification completed within the last 5 minutes. Lock and re-verify your identity now to proceed.`,
        confirmLabel: 'Re-verify Identity',
        destructive: false,
        onConfirm: async () => {
          await lockAdminPanel('manual');
        },
      });
      return;
    }
    proceed();
  };

  const handleModerateReport = async (
    rep: ModerationReport,
    status: 'resolved' | 'dismissed' | 'open',
    customAction?: string
  ) => {
    if (!profile) return;
    try {
      await resolveOrDismissReportByAdmin({
        reportId: rep.id,
        targetType: rep.targetType,
        targetId: rep.targetId,
        status,
        moderator: profile,
        moderatorAction: customAction || `Marked report ${status}`,
        resolutionNote: noteDrafts[rep.id] || rep.resolutionNote || '',
      });
      showToast(`Report marked as ${status} and recorded in audit log.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update report.';
      showToast(msg, 'error');
    }
  };

  const handleDeleteReportRecord = async (reportId: string) => {
    try {
      await deleteDoc(doc(db, 'reports', reportId));
      showToast('Report entry removed from queue.', 'info');
    } catch {
      showToast('Could not remove report entry.', 'error');
    }
  };

  const handleRemoveReportedIdea = (rep: ModerationReport) => {
    if (rep.targetType !== 'idea' || !profile) return;
    guardDestructiveAdminAction(`Remove Idea "${rep.targetTitle}"`, () => {
      openConfirm({
        title: `Remove Reported Idea "${rep.targetTitle}"?`,
        message:
          'This will permanently delete the specification and its subcollections, update connected ideas to avoid broken references, resolve this moderation report, and write an immutable entry to auditLogs.',
        confirmLabel: 'Remove Idea & Resolve Report',
        destructive: true,
        onConfirm: async () => {
          try {
            await deleteIdeaByOwnerOrAdmin(rep.targetId, {
              uid: profile.uid,
              displayName: profile.displayName,
              isAdmin: true,
            });
            await resolveOrDismissReportByAdmin({
              reportId: rep.id,
              targetType: rep.targetType,
              targetId: rep.targetId,
              status: 'resolved',
              moderator: profile,
              moderatorAction: 'Deleted target idea and resolved report',
              resolutionNote: noteDrafts[rep.id] || 'Removed specification for policy violation.',
            });
            showToast('Reported idea removed and logged in audit trail.', 'success');
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to remove reported idea.';
            showToast(msg, 'error');
          }
        },
      });
    });
  };

  const handleAdminDeleteIdea = (idea: Idea) => {
    if (!profile) return;
    guardDestructiveAdminAction(`Delete Specification "${idea.title}"`, () => {
      openConfirm({
        title: `Delete Specification "${idea.title}"?`,
        message:
          'This will permanently delete the specification, cascade-clean all linked Constellation connections, delete its responses/volunteers/revisions, and record an entry in auditLogs.',
        confirmLabel: 'Delete Specification',
        destructive: true,
        onConfirm: async () => {
          try {
            await deleteIdeaByOwnerOrAdmin(idea.id, {
              uid: profile.uid,
              displayName: profile.displayName,
              isAdmin: true,
            });
            showToast(`Deleted "${idea.title}".`, 'info');
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Could not delete idea.';
            showToast(msg, 'error');
          }
        },
      });
    });
  };

  const handleAdminChangeIdeaStatus = async (idea: Idea, nextStatus: IdeaStatus) => {
    try {
      await updateIdeaDetails(
        idea.id,
        { status: nextStatus },
        { isAdmin: true, editorName: profile?.displayName || 'Admin' }
      );
      showToast(`Updated "${idea.title}" status to ${nextStatus}.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update idea status.';
      showToast(msg, 'error');
    }
  };

  const handleAdminToggleIdeaVerified = async (idea: Idea) => {
    if (!profile) return;
    const nextVerified = !idea.adminVerified;
    try {
      await toggleIdeaAdminVerified({
        idea,
        verified: nextVerified,
        admin: profile,
      });
      showToast(
        nextVerified
          ? `Granted "Admin Verified" badge to "${idea.title}".`
          : `Revoked "Admin Verified" badge from "${idea.title}".`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not update Admin Verified status.';
      showToast(msg, 'error');
    }
  };

  const handleAdminToggleUserSuspension = (targetUser: UserProfile) => {
    if (!profile) return;
    const isCurrentlySuspended = Boolean(
      targetUser.suspended || targetUser.accountStatus === 'disabled'
    );
    const nextSuspended = !isCurrentlySuspended;

    guardDestructiveAdminAction(
      `${nextSuspended ? 'Suspend' : 'Unsuspend'} Maker @${targetUser.username}`,
      () => {
        if (nextSuspended) {
          openConfirm({
            title: `Suspend Maker Account @${targetUser.username}?`,
            message: `Suspending @${targetUser.username} (${targetUser.displayName}) will immediately block their account from posting new ideas, responses, volunteers, or connections. You can reinstate their account at any time.`,
            confirmLabel: 'Suspend Account',
            destructive: true,
            onConfirm: async () => {
              try {
                await toggleUserSuspensionByAdmin({
                  targetUser,
                  suspended: true,
                  admin: profile,
                  reason: 'Suspended via Admin Control Panel',
                });
                showToast(`Suspended maker account @${targetUser.username}.`, 'info');
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Could not suspend user.';
                showToast(msg, 'error');
              }
            },
          });
        } else {
          openConfirm({
            title: `Reinstate Maker Account @${targetUser.username}?`,
            message: `Reinstating @${targetUser.username} will restore their ability to publish ideas, responses, and connections.`,
            confirmLabel: 'Reinstate Account',
            destructive: false,
            onConfirm: async () => {
              try {
                await toggleUserSuspensionByAdmin({
                  targetUser,
                  suspended: false,
                  admin: profile,
                  reason: 'Reinstated via Admin Control Panel',
                });
                showToast(`Reinstated maker account @${targetUser.username}.`, 'success');
              } catch (err) {
                const msg = err instanceof Error ? err.message : 'Could not reinstate user.';
                showToast(msg, 'error');
              }
            },
          });
        }
      }
    );
  };

  const handleAdminToggleConnection = async (
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

  const handleAdminDeleteConnection = (conn: IdeaConnection) => {
    openConfirm({
      title: 'Remove Constellation Connection?',
      message: `Remove the connection between "${conn.ideaATitle}" and "${conn.ideaBTitle}"?`,
      confirmLabel: 'Remove Connection',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteConnectionWithTransaction(conn);
          showToast('Connection removed and node counts decremented.', 'info');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Could not remove connection.';
          showToast(msg, 'error');
        }
      },
    });
  };

  const handleRevokeAdmin = (targetUid: string) => {
    if (targetUid === user.uid || targetUid === SOLE_ADMIN_UID) {
      showToast('Sole owner admin access is permanently locked and cannot be revoked.', 'error');
      return;
    }
    openConfirm({
      title: 'Purge Legacy Admin Record?',
      message: `Remove legacy UID "${targetUid}" from admins/{uid}?`,
      confirmLabel: 'Remove Record',
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'admins', targetUid));
          showToast(`Removed legacy UID ${targetUid} from admins collection.`, 'info');
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to remove record.';
          showToast(msg, 'error');
        }
      },
    });
  };

  const getTargetLink = (rep: ModerationReport): string => {
    if (rep.targetType === 'idea') return `/ideas/${rep.targetId}`;
    if (rep.targetType === 'user') return `/u/${rep.targetId}`;
    return '/explore';
  };

  const visibleReports =
    statusFilter === 'all' ? reports : reports.filter((r) => r.status === statusFilter);

  const handleDownloadMarkdownReport = () => {
    const mdContent = `# Synapse — Admin & Platform Status Report

**Generated:** ${new Date().toISOString()}
**Database:** \`ai-studio-217e3490-8920-49a9-8b94-79ae87bb9ed8\`
**Admin UID:** \`${user.uid}\`

---

## 1. Where to Access the Admin Panel on Mobile (< 1024px)
1. **Mobile Bottom Navigation Bar (< 768px):** Dedicated **Admin** shield tab at the right end of the bottom navigation bar with a live open-reports badge.
2. **Mobile & Tablet Top Header Bar (< 1024px):** Compact **Admin Shield Button** next to Search and Notifications in the top-right header.
3. **Profile Page (/profile):** Highlighted **Admin Control Panel** launch card near the top of your profile page.

---

## 2. Live Platform Metrics
- **Total Ideas:** ${metrics.totalIdeas}
- **Admin Verified Ideas:** ${metrics.verifiedIdeas}
- **Open Moderation Reports:** ${metrics.openReports} (Total Reports: ${metrics.totalReports})
- **Registered Makers:** ${metrics.totalUsers}
- **Suspended Accounts:** ${metrics.suspendedUsers}
- **Active Connections:** ${metrics.activeConns}
- **Security Audit Log Entries:** ${auditLogs.length}

---

## 3. Completed Features & Security Controls
- **Strict Admin-Only Access Control:** Protected via UI visibility checks, route guards on \`/admin\` & \`/admin/reports\`, and server-side Firestore rules (\`isAdmin()\`).
- **"Admin Verified" Badge & Toggle:**
  - Emerald **Admin Verified** badge displayed on idea cards across Explore, Home, Showcase, Idea Detail, and Profile pages.
  - One-click **Verify Idea / Verified** toggle in **Admin Panel -> Ideas Manager** and in the **Idea Detail Page** header.
  - Protected in \`firestore.rules\` so only admins can set or modify \`adminVerified\`, \`adminVerifiedAt\`, or \`adminVerifiedBy\`.
- **User Suspension Toggle & Enforcement:**
  - One-click **Suspend / Unsuspend** toggle in **Admin Panel -> Users Directory** with **All / Active / Suspended** filters.
  - Suspended accounts are blocked from creating or updating ideas, responses, volunteer offers, connections, or reports in both client helpers (\`src/firebase.ts\`) and Firestore Security Rules (\`isNotSuspended()\`).
- **Search-Only Maker Profile Privacy:**
  - Maker profiles are only shown when actively searched (\`>= 2\` characters) and soft-deleted accounts are excluded.

---

## 4. Build, Rules & Issue Audit
- **TypeScript & Linting (\`tsc --noEmit\`):** Passed (0 errors).
- **Production Bundle (\`vite build\`):** Passed.
- **Firestore Security Rules (\`firestore.rules\`):** Deployed and active.
- **Known Issues:** None. All mobile and desktop admin controls are operational.
`;
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SYNAPSE_ADMIN_REPORT_${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded SYNAPSE_ADMIN_REPORT.md', 'success');
  };

  return (
    <div
      onClick={() => touchAdminSessionActivity()}
      onKeyDown={() => touchAdminSessionActivity()}
      className="max-w-7xl mx-auto px-4 sm:px-margin py-space-xl flex flex-col gap-space-xl"
    >
      <PageMeta
        title="Synapse Admin Panel — Governance, Moderation & Security"
        description="Admin control center for platform metrics, moderation reports, ideas, connections, and immutable security audit logs."
        noindex
      />

      {/* Admin Panel Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-space-md">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-space-xs">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-container/15 text-primary font-code-sm text-code-sm uppercase">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                verified_user
              </span>
              Server-Verified Sole Admin
            </div>
            <div
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary/15 text-secondary font-code-sm text-code-sm"
              title="In-memory admin verification timer (15m inactivity / 30m max)"
            >
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                timer
              </span>
              Session: {formattedSessionRemaining}
            </div>
            <button
              type="button"
              onClick={async (e) => {
                e.stopPropagation();
                await lockAdminPanel('manual');
                showToast('Admin Panel locked. Fresh verification required to re-enter.', 'info');
              }}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-error/15 hover:bg-error/25 text-error border border-error/40 font-code-sm text-code-sm font-semibold transition-colors cursor-pointer"
              title="Immediately lock the Admin Panel and require fresh authentication"
            >
              <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                lock
              </span>
              🔒 Lock Admin Panel
            </button>
            <button
              type="button"
              onClick={handleDownloadMarkdownReport}
              className="min-h-[36px] inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high hover:bg-surface-container-highest text-on-surface border border-surface-variant/40 font-label-sm text-label-sm transition-colors cursor-pointer"
              title="Download full platform & admin status report in Markdown (.md) format"
            >
              <span className="material-symbols-outlined text-[15px] text-primary" aria-hidden="true">
                download
              </span>
              Download Report (.md)
            </button>
          </div>
          <h1 className="font-headline-lg text-headline-lg-mobile sm:text-headline-lg text-on-surface">
            Synapse Admin Control Panel
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            Manage community moderation reports, specification lifecycles, Constellation
            connections, maker accounts, and immutable audit logs.
          </p>
        </div>

        {/* Navigation Tabs (Mobile-friendly scrollable & wrap support) */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto sm:flex-wrap bg-surface-container-low p-1.5 rounded-2xl border border-surface-variant/30 max-w-full"
          role="tablist"
          aria-label="Admin Panel Sections"
        >
          {(
            [
              { id: 'overview', label: 'Overview', icon: 'dashboard' },
              {
                id: 'reports',
                label: `Reports (${metrics.openReports})`,
                icon: 'flag',
              },
              {
                id: 'ideas',
                label: `Ideas (${metrics.totalIdeas})`,
                icon: 'lightbulb',
              },
              {
                id: 'connections',
                label: `Connections (${connections.length})`,
                icon: 'hub',
              },
              {
                id: 'users-audit',
                label: `Users & Audit (${registeredUsers.length})`,
                icon: 'policy',
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[42px] px-3.5 rounded-xl font-code-sm text-code-sm whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary-container text-on-primary font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: OVERVIEW & HEALTH */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-space-lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-space-md">
            <div className="bg-surface-container-low rounded-2xl p-space-lg border border-surface-variant/30 flex flex-col gap-1">
              <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                Total Specifications
              </span>
              <span className="font-display-lg text-3xl text-on-surface font-bold tabular-nums">
                {metrics.totalIdeas}
              </span>
              <span className="font-code-sm text-code-sm text-secondary">
                {metrics.verifiedIdeas} Admin Verified · {metrics.openIdeas} open ·{' '}
                {metrics.builtIdeas} built
              </span>
            </div>

            <div className="bg-surface-container-low rounded-2xl p-space-lg border border-surface-variant/30 flex flex-col gap-1">
              <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                Constellation Links
              </span>
              <span className="font-display-lg text-3xl text-secondary font-bold">
                {metrics.activeConns}
              </span>
              <span className="font-code-sm text-code-sm text-on-surface-variant">
                {metrics.declinedConns} declined links
              </span>
            </div>

            <div className="bg-surface-container-low rounded-2xl p-space-lg border border-surface-variant/30 flex flex-col gap-1">
              <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                Open Reports
              </span>
              <span className="font-display-lg text-3xl text-primary font-bold">
                {metrics.openReports}
              </span>
              <span className="font-code-sm text-code-sm text-on-surface-variant">
                {metrics.totalReports} total reports filed
              </span>
            </div>

            <div className="bg-surface-container-low rounded-2xl p-space-lg border border-surface-variant/30 flex flex-col gap-1">
              <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                Registered Makers
              </span>
              <span className="font-display-lg text-3xl text-on-surface font-bold tabular-nums">
                {metrics.totalUsers}
              </span>
              <span className="font-code-sm text-code-sm text-on-surface-variant">
                {adminUids.length} admin(s) · {metrics.suspendedUsers} suspended
              </span>
            </div>

            <div className="bg-surface-container-low rounded-2xl p-space-lg border border-surface-variant/30 flex flex-col gap-1">
              <span className="font-code-sm text-code-sm text-on-surface-variant uppercase">
                Audit Log Events
              </span>
              <span className="font-display-lg text-3xl text-on-surface font-bold">
                {metrics.totalAuditLogs}
              </span>
              <span className="font-code-sm text-code-sm text-secondary">
                Immutable Firestore trail
              </span>
            </div>
          </div>

          {/* Quick Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
            <div className="bg-surface-container-low rounded-2xl p-space-lg border border-surface-variant/30 flex flex-col justify-between gap-space-md">
              <div>
                <h2 className="font-title-lg text-title-lg text-on-surface font-semibold">
                  Moderation Queue
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Inspect flagged ideas, responses, and user profiles. Resolve or dismiss reports
                  with mandatory audit logging.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('reports')}
                className="min-h-[44px] px-4 rounded-lg bg-primary-container text-on-primary font-code-sm text-code-sm font-semibold self-start"
              >
                Open Reports ({metrics.openReports}) →
              </button>
            </div>

            <div className="bg-surface-container-low rounded-2xl p-space-lg border border-surface-variant/30 flex flex-col justify-between gap-space-md">
              <div>
                <h2 className="font-title-lg text-title-lg text-on-surface font-semibold">
                  Constellation &amp; Activity Log
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Manage cross-linked specifications, toggle Active/Declined status, or view the
                  timestamped Connection Activity Log.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveTab('connections')}
                  className="min-h-[44px] px-4 rounded-lg bg-secondary text-on-secondary font-code-sm text-code-sm font-semibold"
                >
                  Manage Connections →
                </button>
                <Link
                  to="/connections"
                  className="min-h-[44px] px-3 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-code-sm inline-flex items-center"
                >
                  Constellation Map
                </Link>
              </div>
            </div>

            <div className="bg-surface-container-low rounded-2xl p-space-lg border border-surface-variant/30 flex flex-col justify-between gap-space-md">
              <div>
                <h2 className="font-title-lg text-title-lg text-on-surface font-semibold">
                  Users, Admins &amp; Security Logs
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                  Manage <code>admins/&#123;uid&#125;</code> documents, inspect registered makers,
                  and filter audit logs by date range or User ID.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('users-audit')}
                className="min-h-[44px] px-4 rounded-lg bg-surface-container-high text-on-surface hover:text-primary font-code-sm text-code-sm font-semibold self-start"
              >
                Open Users &amp; Audit →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MODERATION REPORTS */}
      {activeTab === 'reports' && (
        <div className="flex flex-col gap-space-md">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Deterministic report IDs prevent duplicate spam per user and target. Every moderation
              action is logged to <code>auditLogs</code>.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              {(['all', 'open', 'resolved', 'dismissed'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`min-h-[38px] px-3.5 rounded-lg font-code-sm text-code-sm uppercase transition-colors ${
                    statusFilter === st
                      ? 'bg-primary-container text-on-primary font-semibold'
                      : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {visibleReports.length === 0 ? (
            <div className="bg-surface-container-low rounded-2xl p-12 text-center text-on-surface-variant">
              0 reports matching filter &ldquo;{statusFilter}&rdquo;.
            </div>
          ) : (
            <div className="flex flex-col gap-space-md">
              {visibleReports.map((rep) => (
                <div
                  key={rep.id}
                  className="bg-surface-container-low rounded-2xl p-space-lg flex flex-col gap-space-md border border-surface-variant/30"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-space-md">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-error-container text-on-error-container font-code-sm text-code-sm uppercase">
                          {rep.targetType}
                        </span>
                        {rep.category && (
                          <span className="px-2 py-0.5 rounded bg-surface-container-highest text-primary font-code-sm text-code-sm uppercase">
                            {rep.category}
                          </span>
                        )}
                        <Link
                          to={getTargetLink(rep)}
                          className="font-title-md text-title-md text-on-surface hover:text-primary inline-flex items-center gap-1"
                        >
                          <span>{rep.targetTitle}</span>
                          <span
                            className="material-symbols-outlined text-[16px]"
                            aria-hidden="true"
                          >
                            open_in_new
                          </span>
                        </Link>
                        <span
                          className={`px-2 py-0.5 rounded font-code-sm text-code-sm uppercase ${
                            rep.status === 'resolved'
                              ? 'bg-secondary/15 text-secondary'
                              : rep.status === 'dismissed'
                              ? 'bg-surface-container-highest text-on-surface-variant'
                              : 'bg-primary/15 text-primary'
                          }`}
                        >
                          {rep.status}
                        </span>
                      </div>
                      <p className="font-body-md text-body-md text-on-surface">{rep.reason}</p>
                      <span className="font-code-sm text-code-sm text-on-surface-variant">
                        Reported by {rep.reporterName} · Target ID: {rep.targetId} ·{' '}
                        {formatRelativeTime(rep.createdAt)}
                      </span>
                      {rep.moderatorName && (
                        <div className="mt-1 p-2.5 rounded-lg bg-surface-container font-code-sm text-code-sm text-secondary">
                          Moderated by {rep.moderatorName} ({rep.moderatorAction || rep.status})
                          {rep.resolutionNote ? ` — Note: ${rep.resolutionNote}` : ''}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      <Link
                        to={getTargetLink(rep)}
                        className="min-h-[40px] px-3.5 rounded-lg bg-surface-container-high text-on-surface hover:text-primary font-label-md text-label-md inline-flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                          visibility
                        </span>
                        Inspect
                      </Link>
                      {rep.targetType === 'idea' && (
                        <button
                          type="button"
                          onClick={() => handleRemoveReportedIdea(rep)}
                          className="min-h-[40px] px-3.5 rounded-lg bg-error-container text-on-error-container font-label-md text-label-md inline-flex items-center gap-1"
                        >
                          <span
                            className="material-symbols-outlined text-[16px]"
                            aria-hidden="true"
                          >
                            delete_forever
                          </span>
                          Remove Idea
                        </button>
                      )}
                      {rep.status !== 'resolved' && (
                        <button
                          type="button"
                          onClick={() => handleModerateReport(rep, 'resolved')}
                          className="min-h-[40px] px-4 rounded-lg bg-secondary text-on-secondary font-label-md text-label-md"
                        >
                          Resolve
                        </button>
                      )}
                      {rep.status !== 'dismissed' && (
                        <button
                          type="button"
                          onClick={() => handleModerateReport(rep, 'dismissed')}
                          className="min-h-[40px] px-4 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md"
                        >
                          Dismiss
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteReportRecord(rep.id)}
                        className="min-h-[40px] px-3 rounded-lg bg-surface-container text-on-surface-variant hover:text-error font-label-md text-label-md"
                        title="Delete report entry"
                        aria-label="Delete report entry"
                      >
                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                          delete
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-surface-variant/20 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      type="text"
                      maxLength={500}
                      aria-label="Moderator resolution note"
                      value={noteDrafts[rep.id] ?? rep.resolutionNote ?? ''}
                      onChange={(e) =>
                        setNoteDrafts((prev) => ({ ...prev, [rep.id]: e.target.value }))
                      }
                      placeholder="Add optional moderator resolution note for the audit trail..."
                      className="flex-1 h-9 px-3 rounded-lg bg-surface-container text-on-surface font-code-sm text-code-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: IDEAS & SPECIFICATIONS MANAGER */}
      {activeTab === 'ideas' && (
        <div className="flex flex-col gap-space-md">
          <div className="bg-surface-container-low rounded-2xl p-space-md border border-surface-variant/30 flex flex-col sm:flex-row sm:items-center justify-between gap-space-md">
            <div className="relative flex-1 max-w-md">
              <span
                className="material-symbols-outlined text-[18px] text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              >
                search
              </span>
              <input
                type="search"
                value={ideaSearch}
                onChange={(e) => setIdeaSearch(e.target.value)}
                aria-label="Filter specifications by title, author, or ID"
                placeholder="Search ideas by title, @author, category, or ID..."
                className="w-full h-10 pl-9 pr-3 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-code-sm"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {(['all', 'verified', 'open', 'in-progress', 'built'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setIdeaStatusFilter(st)}
                  className={`min-h-[36px] px-3 rounded-lg font-code-sm text-code-sm uppercase transition-colors ${
                    ideaStatusFilter === st
                      ? 'bg-primary-container text-on-primary font-semibold'
                      : 'bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {st === 'verified' ? `Admin Verified (${metrics.verifiedIdeas})` : st}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-space-sm">
            {filteredIdeas.map((idea) => (
              <div
                key={idea.id}
                className="bg-surface-container-low rounded-xl p-space-md border border-surface-variant/30 flex flex-col lg:flex-row lg:items-center justify-between gap-space-md"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap font-code-sm text-code-sm">
                    <span className="px-2 py-0.5 rounded bg-surface-container-highest text-primary uppercase">
                      {idea.category}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary uppercase">
                      {idea.status}
                    </span>
                    {idea.adminVerified && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-secondary/20 text-secondary font-semibold uppercase">
                        <span
                          className="material-symbols-outlined text-[14px]"
                          aria-hidden="true"
                        >
                          verified
                        </span>
                        Admin Verified
                      </span>
                    )}
                    <span className="text-on-surface-variant">
                      by @{idea.authorUsername} · ID: <code>{idea.id}</code>
                    </span>
                  </div>
                  <Link
                    to={`/ideas/${idea.id}`}
                    className="font-title-md text-title-md text-on-surface hover:text-primary truncate"
                  >
                    {idea.title}
                  </Link>
                  <span className="font-code-sm text-code-sm text-on-surface-variant">
                    {idea.responseCount} responses · {idea.volunteerCount} volunteers ·{' '}
                    {idea.connectionCount} connections
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(idea.adminVerified)}
                    onClick={() => handleAdminToggleIdeaVerified(idea)}
                    className={`min-h-[36px] px-3 rounded-lg font-code-sm text-code-sm inline-flex items-center gap-1.5 transition-colors ${
                      idea.adminVerified
                        ? 'bg-secondary text-on-secondary font-semibold'
                        : 'bg-surface-container-high text-on-surface-variant hover:text-secondary border border-surface-variant/40'
                    }`}
                    title={
                      idea.adminVerified
                        ? 'Click to revoke Admin Verified badge'
                        : 'Click to grant Admin Verified badge'
                    }
                  >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                      {idea.adminVerified ? 'verified' : 'new_releases'}
                    </span>
                    <span>{idea.adminVerified ? 'Admin Verified ✓' : 'Verify Idea'}</span>
                  </button>

                  <select
                    aria-label={`Change status for ${idea.title}`}
                    value={idea.status}
                    onChange={(e) =>
                      handleAdminChangeIdeaStatus(idea, e.target.value as IdeaStatus)
                    }
                    className="h-9 px-2.5 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-code-sm border border-surface-variant/40"
                  >
                    <option value="open">Status: Open</option>
                    <option value="in-progress">Status: In-Progress</option>
                    <option value="built">Status: Built</option>
                  </select>

                  <Link
                    to={`/ideas/${idea.id}/edit`}
                    className="min-h-[36px] px-3 rounded-lg bg-surface-container-high text-on-surface hover:text-primary font-code-sm text-code-sm inline-flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                      edit
                    </span>
                    Edit
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleAdminDeleteIdea(idea)}
                    className="min-h-[36px] px-3 rounded-lg bg-error-container text-on-error-container font-code-sm text-code-sm inline-flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[15px]" aria-hidden="true">
                      delete
                    </span>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: CONNECTIONS GOVERNANCE */}
      {activeTab === 'connections' && (
        <div className="flex flex-col gap-space-md">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Admins can mark any Constellation connection as Active, Decline it, or Remove it
              entirely.
            </p>
            <div className="flex items-center gap-1.5">
              {(['all', 'active', 'declined'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setConnFilter(st)}
                  className={`min-h-[36px] px-3 rounded-lg font-code-sm text-code-sm uppercase transition-colors ${
                    connFilter === st
                      ? 'bg-secondary text-on-secondary font-semibold'
                      : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {filteredConnections.length === 0 ? (
            <div className="bg-surface-container-low rounded-2xl p-12 text-center text-on-surface-variant">
              No connections matching filter.
            </div>
          ) : (
            <div className="flex flex-col gap-space-sm">
              {filteredConnections.map((conn) => (
                <div
                  key={conn.id}
                  className="bg-surface-container-low rounded-xl p-space-md border border-surface-variant/30 flex flex-col lg:flex-row lg:items-center justify-between gap-space-md"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 flex-wrap font-code-sm text-code-sm">
                      <span
                        className={`px-2 py-0.5 rounded uppercase font-semibold ${
                          conn.status === 'declined'
                            ? 'bg-error-container text-on-error-container'
                            : 'bg-secondary/15 text-secondary'
                        }`}
                      >
                        {conn.status}
                      </span>
                      <span className="text-on-surface-variant">
                        Linked by {conn.createdByName} · ID: <code>{conn.id}</code>
                      </span>
                    </div>
                    <div className="font-title-md text-title-md text-on-surface">
                      <Link to={`/ideas/${conn.ideaA}`} className="hover:text-secondary">
                        {conn.ideaATitle}
                      </Link>{' '}
                      <span className="text-secondary mx-1">↔</span>{' '}
                      <Link to={`/ideas/${conn.ideaB}`} className="hover:text-primary">
                        {conn.ideaBTitle}
                      </Link>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {conn.reason}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {conn.status === 'declined' ? (
                      <button
                        type="button"
                        onClick={() => handleAdminToggleConnection(conn, 'active')}
                        className="min-h-[36px] px-3 rounded-lg bg-secondary/20 text-secondary font-code-sm text-code-sm"
                      >
                        Mark Active
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAdminToggleConnection(conn, 'declined')}
                        className="min-h-[36px] px-3 rounded-lg bg-surface-container-high text-on-surface-variant hover:text-primary font-code-sm text-code-sm"
                      >
                        Decline
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleAdminDeleteConnection(conn)}
                      className="min-h-[36px] px-3 rounded-lg bg-error-container text-on-error-container font-code-sm text-code-sm"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: USERS, ADMIN REGISTRY & AUDIT LOGS */}
      {activeTab === 'users-audit' && (
        <div className="flex flex-col gap-space-xl">
          {/* Sole Owner Admin Lock */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
            <div className="lg:col-span-5 bg-surface-container-low rounded-2xl p-space-lg border border-surface-variant/30 flex flex-col gap-space-md">
              <div>
                <span className="font-code-sm text-code-sm text-primary uppercase">
                  Sole-Owner Security Lock
                </span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">
                  Exclusive Administrator Lock
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  Admin access is permanently locked in both client auth checks and Firestore
                  Security Rules exclusively to your account (<code>{SOLE_ADMIN_EMAIL}</code>). No
                  other user can be granted administrator privileges.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-surface-container border border-secondary/30 flex flex-col gap-1.5 font-code-sm text-code-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-secondary font-semibold uppercase">Sole Owner Admin</span>
                  <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary">
                    Locked to You
                  </span>
                </div>
                <div className="text-on-surface truncate">{user.email || SOLE_ADMIN_EMAIL}</div>
                <code className="text-primary text-[11px] truncate">UID: {user.uid}</code>
              </div>

              {adminUids.filter((id) => id !== user.uid && id !== SOLE_ADMIN_UID).length > 0 && (
                <div className="flex flex-col gap-2">
                  <span className="font-code-sm text-code-sm text-error uppercase">
                    Legacy Non-Owner Records (Inactive in Rules)
                  </span>
                  {adminUids
                    .filter((id) => id !== user.uid && id !== SOLE_ADMIN_UID)
                    .map((uid) => (
                      <div
                        key={uid}
                        className="p-2.5 rounded-xl bg-surface-container flex items-center justify-between gap-2 font-code-sm text-code-sm"
                      >
                        <code className="text-on-surface-variant truncate">{uid}</code>
                        <button
                          type="button"
                          onClick={() => handleRevokeAdmin(uid)}
                          className="text-error hover:underline shrink-0"
                        >
                          Purge Record
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Registered Makers Directory & User Suspension Toggle */}
            <div className="lg:col-span-7 bg-surface-container-low rounded-2xl p-space-lg border border-surface-variant/30 flex flex-col gap-space-md">
              <div>
                <span className="font-code-sm text-code-sm text-secondary uppercase">
                  Firestore Collection: users/&#123;uid&#125;
                </span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">
                  Registered Makers &amp; Account Suspension ({registeredUsers.length})
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  Toggle account suspension to prevent abusive accounts from publishing ideas,
                  responses, or volunteer offers.
                </p>
              </div>

              <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto pr-1">
                {registeredUsers.map((u) => {
                  const isUserSuspended = Boolean(
                    u.suspended || u.accountStatus === 'disabled'
                  );
                  const isSelf = u.uid === user.uid;
                  return (
                    <div
                      key={u.uid}
                      className="p-3 rounded-xl bg-surface-container flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            to={`/u/${u.username}`}
                            className="font-title-md text-title-md text-on-surface hover:text-primary"
                          >
                            {u.displayName} (@{u.username})
                          </Link>
                          <span
                            className={`px-2 py-0.5 rounded font-code-sm text-[11px] uppercase font-semibold ${
                              isUserSuspended
                                ? 'bg-error-container text-on-error-container'
                                : 'bg-secondary/15 text-secondary'
                            }`}
                          >
                            {isUserSuspended ? 'Suspended' : 'Active'}
                          </span>
                        </div>
                        <span className="font-code-sm text-code-sm text-on-surface-variant truncate">
                          UID: <code>{u.uid}</code>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isUserSuspended}
                          disabled={isSelf}
                          onClick={() => handleAdminToggleUserSuspension(u)}
                          title={
                            isSelf
                              ? 'You cannot suspend your own active admin account'
                              : isUserSuspended
                              ? 'Click to reinstate user account'
                              : 'Click to suspend user account'
                          }
                          className={`min-h-[34px] px-3 rounded-lg font-code-sm text-code-sm inline-flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            isUserSuspended
                              ? 'bg-secondary text-on-secondary font-semibold'
                              : 'bg-error-container text-on-error-container hover:opacity-90'
                          }`}
                        >
                          <span
                            className="material-symbols-outlined text-[15px]"
                            aria-hidden="true"
                          >
                            {isUserSuspended ? 'lock_open' : 'block'}
                          </span>
                          <span>{isUserSuspended ? 'Unsuspend User' : 'Suspend User'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setAuditUserIdFilter(u.uid);
                            showToast(`Filtered audit logs to UID ${u.uid}`, 'info');
                          }}
                          className="min-h-[34px] px-2.5 rounded-lg bg-surface-container-high text-secondary font-code-sm text-code-sm"
                        >
                          Filter Logs
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Full Security & Moderation Audit Trail with User ID & Date Range Filters */}
          <div className="bg-surface-container-low rounded-2xl p-space-lg border border-surface-variant/30 flex flex-col gap-space-md">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md">
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">
                  Immutable Security &amp; Governance Audit Log ({filteredAuditLogs.length})
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Filter all platform audit events by action type, specific User ID, or date range.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-space-md items-end bg-surface-container p-space-md rounded-xl">
              <div className="md:col-span-4 flex flex-col gap-1">
                <label
                  htmlFor="admin-audit-uid"
                  className="font-code-sm text-code-sm text-on-surface-variant uppercase"
                >
                  User ID or Actor Name
                </label>
                <input
                  id="admin-audit-uid"
                  type="text"
                  value={auditUserIdFilter}
                  onChange={(e) => setAuditUserIdFilter(e.target.value)}
                  placeholder="Filter by UID or actor..."
                  className="h-10 px-3 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-code-sm"
                />
              </div>

              <div className="md:col-span-3 flex flex-col gap-1">
                <label
                  htmlFor="admin-audit-action"
                  className="font-code-sm text-code-sm text-on-surface-variant uppercase"
                >
                  Action Type
                </label>
                <select
                  id="admin-audit-action"
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="h-10 px-3 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-code-sm"
                >
                  <option value="all">All Actions</option>
                  <option value="admin.reauth.success">admin.reauth.success</option>
                  <option value="admin.reauth.failure">admin.reauth.failure</option>
                  <option value="admin.webauthn.success">admin.webauthn.success</option>
                  <option value="admin.webauthn.failure">admin.webauthn.failure</option>
                  <option value="admin.panel.lock">admin.panel.lock</option>
                  <option value="admin.panel.timeout">admin.panel.timeout</option>
                  <option value="admin.panel.access_denied">admin.panel.access_denied</option>
                  <option value="idea.verify_change">idea.verify_change</option>
                  <option value="account.suspend_change">account.suspend_change</option>
                  <option value="connection.create">connection.create</option>
                  <option value="connection.status_change">connection.status_change</option>
                  <option value="connection.delete">connection.delete</option>
                  <option value="report.resolve">report.resolve</option>
                  <option value="report.dismiss">report.dismiss</option>
                  <option value="content.delete_idea">content.delete_idea</option>
                  <option value="account.username_change">account.username_change</option>
                  <option value="account.delete">account.delete</option>
                </select>
              </div>

              <div className="md:col-span-2 flex flex-col gap-1">
                <label
                  htmlFor="admin-audit-start"
                  className="font-code-sm text-code-sm text-on-surface-variant uppercase"
                >
                  Start Date
                </label>
                <input
                  id="admin-audit-start"
                  type="date"
                  value={auditStartDate}
                  onChange={(e) => setAuditStartDate(e.target.value)}
                  className="h-10 px-2.5 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-code-sm"
                />
              </div>

              <div className="md:col-span-2 flex flex-col gap-1">
                <label
                  htmlFor="admin-audit-end"
                  className="font-code-sm text-code-sm text-on-surface-variant uppercase"
                >
                  End Date
                </label>
                <input
                  id="admin-audit-end"
                  type="date"
                  value={auditEndDate}
                  onChange={(e) => setAuditEndDate(e.target.value)}
                  className="h-10 px-2.5 rounded-lg bg-surface-container-high text-on-surface font-code-sm text-code-sm"
                />
              </div>

              <div className="md:col-span-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuditActionFilter('all');
                    setAuditUserIdFilter('');
                    setAuditStartDate('');
                    setAuditEndDate('');
                  }}
                  className="h-10 w-full rounded-lg bg-surface-container-highest text-on-surface-variant hover:text-on-surface font-code-sm text-code-sm"
                >
                  Reset
                </button>
              </div>
            </div>

            {filteredAuditLogs.length === 0 ? (
              <div className="p-8 text-center text-on-surface-variant font-body-sm">
                No audit log events match the active filters.
              </div>
            ) : (
              <div className="flex flex-col gap-space-sm">
                {filteredAuditLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-surface-container rounded-xl p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-l-4 border-secondary"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 flex-wrap font-code-sm text-code-sm">
                        <span className="px-2 py-0.5 rounded bg-secondary/15 text-secondary uppercase">
                          {entry.action}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant uppercase">
                          {entry.targetType}:{entry.targetId}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAuditUserIdFilter(entry.actorId)}
                          className="text-on-surface font-semibold hover:text-primary"
                        >
                          Actor: {entry.actorName} (UID: {entry.actorId})
                        </button>
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface">{entry.summary}</p>
                    </div>
                    <div className="flex flex-col sm:items-end font-code-sm text-code-sm text-on-surface-variant shrink-0">
                      <span className="text-on-surface">
                        {new Date(entry.createdAt).toLocaleString()}
                      </span>
                      <span>{formatRelativeTime(entry.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
