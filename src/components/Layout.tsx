import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { SITE_CONFIG } from '../config/siteConfig';
import { submitReport } from '../firebase';
import { ReportCategory } from '../types/synapse';
import { checkRateLimit } from '../utils/sanitize';
import { GlobalSearchBar } from './GlobalSearchBar';
import { PWAInstallButton } from './PWAInstallButton';

/**
 * Single unified Synapse Logo mark + wordmark (no duplicate logos)
 */
export const SynapseBrandLogo: React.FC<{ size?: 'sm' | 'md' }> = ({ size = 'md' }) => {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span
        className={`${
          size === 'sm' ? 'w-6 h-6' : 'w-8 h-8'
        } rounded-lg bg-surface-container-high border border-surface-variant/60 flex items-center justify-center shrink-0 shadow-sm`}
        aria-hidden="true"
      >
        <svg
          width={size === 'sm' ? '14' : '18'}
          height={size === 'sm' ? '14' : '18'}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="6" cy="12" r="3" fill="#F5A524" />
          <circle cx="18" cy="6" r="2.5" stroke="#44e2cd" strokeWidth="2" />
          <circle cx="18" cy="18" r="2.5" stroke="#ffc77f" strokeWidth="2" />
          <line x1="8.7" y1="10.7" x2="15.5" y2="7.2" stroke="#44e2cd" strokeWidth="1.8" />
          <line x1="8.7" y1="13.3" x2="15.5" y2="16.8" stroke="#F5A524" strokeWidth="1.8" />
        </svg>
      </span>
      <span
        className={`font-headline-sm ${
          size === 'sm' ? 'text-lg' : 'text-headline-sm'
        } font-semibold tracking-tight text-on-surface`}
      >
        Synapse
      </span>
    </span>
  );
};

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    user,
    profile,
    isAdmin,
    isOnline,
    unreadCount,
    reports,
    theme,
    toggleTheme,
    toasts,
    dismissToast,
    showToast,
    reportTarget,
    closeReportModal,
    confirmDialog,
    closeConfirm,
  } = useApp();

  const openReportsCount = reports.filter((r) => r.status === 'open').length;
  const isSuspended = Boolean(profile?.suspended || profile?.accountStatus === 'disabled');

  const navigate = useNavigate();
  const location = useLocation();
  const [reportCategory, setReportCategory] = useState<ReportCategory>('spam');
  const [reportReason, setReportReason] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget) return;
    if (!user || !profile) {
      closeReportModal();
      navigate(`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`);
      return;
    }
    if (reportReason.trim().length < 5) {
      showToast('Please provide a brief reason (at least 5 characters).', 'error');
      return;
    }
    const rl = checkRateLimit(`report-${user.uid}`, 5000);
    if (!rl.allowed) {
      showToast(`Please wait ${rl.waitSeconds}s before submitting another report.`, 'error');
      return;
    }
    setSubmittingReport(true);
    try {
      await submitReport({
        targetType: reportTarget.targetType,
        targetId: reportTarget.targetId,
        targetTitle: reportTarget.targetTitle,
        category: reportCategory,
        reason: reportReason,
        reporter: profile,
      });
      setReportReason('');
      setReportCategory('spam');
      closeReportModal();
      showToast('Report submitted to the volunteer moderation queue.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not submit report. Please try again.';
      showToast(msg, 'error');
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleConfirmExecute = async () => {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    try {
      await confirmDialog.onConfirm();
      closeConfirm();
    } finally {
      setConfirmBusy(false);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface font-body-md">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary-container focus:text-on-primary focus:font-title-md"
      >
        Skip to main content
      </a>

      {/* Top Desktop & Tablet Header */}
      <header className="fixed top-0 w-full z-40 bg-surface-container-lowest/90 backdrop-blur-xl border-b border-surface-variant/40">
        <div className="h-16 max-w-7xl mx-auto px-4 sm:px-margin flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 xl:gap-6 shrink-0">
            <Link
              to="/"
              className="flex items-center min-h-[44px] shrink-0 focus-visible:outline-2 focus-visible:outline-primary-container rounded-lg"
              aria-label="Synapse Home"
            >
              <SynapseBrandLogo size="md" />
            </Link>

            <nav className="hidden lg:flex items-center gap-3 xl:gap-5 shrink-0" aria-label="Main Navigation">
              <NavLink
                to="/explore"
                className={({ isActive }) =>
                  `min-h-[44px] inline-flex items-center whitespace-nowrap font-title-md text-title-md transition-colors focus-visible:outline-2 focus-visible:outline-primary-container rounded px-1 ${
                    isActive
                      ? 'text-on-surface font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`
                }
              >
                Explore
              </NavLink>
              <NavLink
                to="/connections"
                className={({ isActive }) =>
                  `min-h-[44px] inline-flex items-center whitespace-nowrap font-title-md text-title-md transition-colors focus-visible:outline-2 focus-visible:outline-primary-container rounded px-1 ${
                    isActive
                      ? 'text-on-surface font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`
                }
              >
                Connections
              </NavLink>
              <NavLink
                to="/showcase"
                className={({ isActive }) =>
                  `min-h-[44px] inline-flex items-center whitespace-nowrap font-title-md text-title-md transition-colors focus-visible:outline-2 focus-visible:outline-primary-container rounded px-1 ${
                    isActive
                      ? 'text-on-surface font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`
                }
              >
                Showcase
              </NavLink>
              <NavLink
                to="/about"
                className={({ isActive }) =>
                  `min-h-[44px] inline-flex items-center whitespace-nowrap font-title-md text-title-md transition-colors focus-visible:outline-2 focus-visible:outline-primary-container rounded px-1 ${
                    isActive
                      ? 'text-on-surface font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`
                }
              >
                About
              </NavLink>
              <NavLink
                to="/support"
                className={({ isActive }) =>
                  `min-h-[44px] inline-flex items-center whitespace-nowrap font-title-md text-title-md transition-colors focus-visible:outline-2 focus-visible:outline-primary-container rounded px-1 ${
                    isActive
                      ? 'text-on-surface font-semibold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`
                }
              >
                Support
              </NavLink>
              {isAdmin && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    `min-h-[38px] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 font-code-sm text-code-sm uppercase tracking-wider px-3 py-1.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-container text-on-primary font-semibold'
                        : 'bg-surface-container-high text-primary hover:text-on-surface border border-primary/40'
                    }`
                  }
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    admin_panel_settings
                  </span>
                  <span>Admin</span>
                </NavLink>
              )}
            </nav>
          </div>

          {/* Global Search Bar (Ideas, Users, and Built Projects) */}
          <GlobalSearchBar />

          {/* Right Action Cluster */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <PWAInstallButton />

            {isAdmin && (
              <NavLink
                to="/admin"
                aria-label={`Admin Panel${openReportsCount > 0 ? ` (${openReportsCount} open reports)` : ''}`}
                title="Admin Control Panel"
                className={({ isActive }) =>
                  `lg:hidden relative min-w-[40px] min-h-[40px] px-2.5 shrink-0 rounded-lg inline-flex items-center justify-center gap-1 font-code-sm text-[11px] uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-primary-container ${
                    isActive
                      ? 'bg-primary-container text-on-primary font-semibold'
                      : 'bg-surface-container-high text-primary hover:text-on-surface border border-primary/40'
                  }`
                }
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  admin_panel_settings
                </span>
                <span className="hidden sm:inline">Admin</span>
                {openReportsCount > 0 && (
                  <span className="min-w-[16px] h-[16px] px-1 rounded-full bg-error-container text-on-error-container font-code-sm text-[10px] font-bold flex items-center justify-center">
                    {openReportsCount > 9 ? '9+' : openReportsCount}
                  </span>
                )}
              </NavLink>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="min-w-[40px] min-h-[40px] shrink-0 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors focus-visible:outline-2 focus-visible:outline-primary-container"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
                {theme === 'dark' ? 'dark_mode' : 'light_mode'}
              </span>
            </button>

            {user && (
              <Link
                to="/notifications"
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                className="relative min-w-[40px] min-h-[40px] shrink-0 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors focus-visible:outline-2 focus-visible:outline-primary-container"
              >
                <span className="material-symbols-outlined text-[20px]">notifications</span>
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-container text-on-primary font-code-sm text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
            )}

            <Link
              to="/post/basics"
              className="hidden sm:inline-flex items-center justify-center whitespace-nowrap shrink-0 h-10 px-3.5 bg-primary-container text-on-primary font-title-md text-body-sm font-semibold rounded-lg hover:opacity-90 transition-opacity focus-visible:outline-2 focus-visible:outline-primary-container"
            >
              <span className="material-symbols-outlined text-[18px] mr-1">add</span>
              <span>Post idea</span>
            </Link>

            <div className="flex items-center pl-space-xs border-l border-surface-variant/40">
              {user ? (
                <Link
                  to="/profile"
                  aria-label="Your Profile"
                  title={profile?.displayName || user.email || 'Account'}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container-high transition-colors focus-visible:outline-2 focus-visible:outline-primary-container"
                >
                  <span className="w-8 h-8 rounded-full bg-primary text-on-primary font-code-sm text-xs font-bold flex items-center justify-center shrink-0">
                    {(profile?.displayName || user.email || 'U').slice(0, 2).toUpperCase()}
                  </span>
                </Link>
              ) : (
                <Link
                  to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
                  aria-label="Sign in"
                  title="Sign in with Google"
                  className="min-h-[44px] px-3 rounded-lg flex items-center gap-1.5 text-on-surface hover:bg-surface-container-high font-label-md text-label-md transition-colors focus-visible:outline-2 focus-visible:outline-primary-container"
                >
                  <span className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-on-primary text-[18px]">
                      person
                    </span>
                  </span>
                  <span className="hidden xl:inline">Sign in</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main id="main-content" className="w-full pt-16 pb-20 lg:pb-0 flex-1 bg-surface">
        {!isOnline && (
          <div
            role="status"
            aria-live="polite"
            className="bg-primary-container/15 border-b border-primary/40 text-on-surface px-4 py-2.5 text-center font-code-sm text-code-sm flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px] text-primary">wifi_off</span>
            <span>
              Offline mode — browsing cached specifications works normally. Publishing and mutations
              will resume when your connection returns.
            </span>
          </div>
        )}
        {isSuspended && (
          <div
            role="alert"
            className="bg-error-container text-on-error-container border-b border-error/40 px-4 py-2.5 text-center font-code-sm text-code-sm flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              block
            </span>
            <span>
              Your account is currently suspended by a platform administrator. Public browsing remains
              available, but posting ideas, responses, and volunteer offers is disabled.
            </span>
          </div>
        )}
        {children}
      </main>

      {/* Footer */}
      <footer className="w-full bg-surface-container-lowest border-t border-surface-variant/30 py-space-xl pb-24 lg:pb-space-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-margin">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-space-xl pb-space-xl border-b border-surface-variant/20">
            <div className="md:col-span-4 flex flex-col gap-space-md">
              <Link to="/" className="inline-flex items-center w-fit">
                <SynapseBrandLogo size="sm" />
              </Link>
              <p className="font-body-sm text-body-sm text-on-surface-variant max-w-sm leading-relaxed">
                {SITE_CONFIG.tagline}
              </p>
              <div className="flex items-center gap-space-xs">
                <span className="w-2 h-2 rounded-full bg-secondary" />
                <span className="font-label-sm text-label-sm text-secondary uppercase tracking-wider">
                  Decentralized &amp; Non-Profit
                </span>
              </div>
            </div>

            <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-space-lg">
              <div className="flex flex-col gap-space-sm">
                <h3 className="font-title-md text-title-md text-on-surface font-semibold">
                  Explore
                </h3>
                <ul className="flex flex-col gap-space-xs font-body-sm text-body-sm text-on-surface-variant">
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/explore?sort=newest" className="hover:text-on-surface transition-colors">
                      Recent Ideas
                    </Link>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <Link
                      to="/explore?track=guidance"
                      className="hover:text-on-surface transition-colors"
                    >
                      Needs Guidance
                    </Link>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <Link
                      to="/explore?track=builder"
                      className="hover:text-on-surface transition-colors"
                    >
                      Needs a Builder
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col gap-space-sm">
                <h3 className="font-title-md text-title-md text-on-surface font-semibold">
                  Community
                </h3>
                <ul className="flex flex-col gap-space-xs font-body-sm text-body-sm text-on-surface-variant">
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/connections" className="hover:text-on-surface transition-colors">
                      Constellation Map
                    </Link>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/showcase" className="hover:text-on-surface transition-colors">
                      Showcase
                    </Link>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <a
                      href={SITE_CONFIG.discordUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-on-surface transition-colors inline-flex items-center gap-1"
                    >
                      Discord
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    </a>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/support" className="hover:text-on-surface transition-colors">
                      Support Solo Maker
                    </Link>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col gap-space-sm">
                <h3 className="font-title-md text-title-md text-on-surface font-semibold">
                  Legal &amp; Ethics
                </h3>
                <ul className="flex flex-col gap-space-xs font-body-sm text-body-sm text-on-surface-variant">
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/about#ownership" className="hover:text-on-surface transition-colors">
                      Idea Ownership
                    </Link>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/about#conduct" className="hover:text-on-surface transition-colors">
                      Code of Conduct
                    </Link>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/about#security" className="hover:text-on-surface transition-colors">
                      Security Rules
                    </Link>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <a
                      href="/sitemap.xml"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-on-surface transition-colors inline-flex items-center gap-1"
                    >
                      Sitemap XML
                      <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="pt-space-lg flex flex-col sm:flex-row items-center justify-between gap-space-md">
            <p className="font-code-sm text-code-sm text-on-surface-variant">
              © {currentYear} Synapse Network. Open protocol.
            </p>
            <p className="font-code-sm text-code-sm text-on-surface-variant/80 text-center sm:text-right">
              Built by one solo maker for the open web.
            </p>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile bottom navigation"
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-surface-variant/40 grid ${
          isAdmin ? 'grid-cols-6' : 'grid-cols-5'
        } h-16 px-1`}
      >
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg font-label-sm text-[11px] ${
              isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`
          }
        >
          <span className="material-symbols-outlined text-[20px]">home</span>
          <span>Home</span>
        </NavLink>
        <NavLink
          to="/explore"
          className={({ isActive }) =>
            `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg font-label-sm text-[11px] ${
              isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`
          }
        >
          <span className="material-symbols-outlined text-[20px]">explore</span>
          <span>Explore</span>
        </NavLink>
        <NavLink
          to="/post/basics"
          className={({ isActive }) =>
            `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg font-label-sm text-[11px] ${
              isActive ? 'text-primary' : 'text-primary-container'
            }`
          }
        >
          <span className="material-symbols-outlined text-[22px]">add_circle</span>
          <span>Post</span>
        </NavLink>
        <NavLink
          to="/connections"
          className={({ isActive }) =>
            `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg font-label-sm text-[11px] ${
              isActive ? 'text-secondary' : 'text-on-surface-variant hover:text-on-surface'
            }`
          }
        >
          <span className="material-symbols-outlined text-[20px]">hub</span>
          <span>Graph</span>
        </NavLink>
        {isAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg font-label-sm text-[11px] ${
                isActive ? 'text-primary font-semibold' : 'text-primary/90 hover:text-primary'
              }`
            }
          >
            <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
            <span>Admin</span>
            {openReportsCount > 0 && (
              <span className="absolute top-1 right-2 min-w-[14px] h-[14px] px-1 rounded-full bg-error-container text-on-error-container font-code-sm text-[9px] font-bold flex items-center justify-center">
                {openReportsCount > 9 ? '9+' : openReportsCount}
              </span>
            )}
          </NavLink>
        )}
        <NavLink
          to={user ? '/profile' : '/login'}
          className={({ isActive }) =>
            `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg font-label-sm text-[11px] ${
              isActive ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
            }`
          }
        >
          <span className="material-symbols-outlined text-[20px]">person</span>
          <span>{user ? 'Profile' : 'Sign In'}</span>
        </NavLink>
      </nav>

      {/* Global Toast Container */}
      <div
        className="fixed bottom-20 lg:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl shadow-xl border ${
              t.type === 'error'
                ? 'bg-error-container text-on-error-container border-error/40'
                : t.type === 'success'
                ? 'bg-surface-container-highest text-on-surface border-secondary/50'
                : 'bg-surface-container-highest text-on-surface border-surface-variant'
            }`}
          >
            <div className="flex items-center gap-2 font-body-sm text-body-sm">
              <span
                className={`material-symbols-outlined text-[18px] ${
                  t.type === 'error'
                    ? 'text-error'
                    : t.type === 'success'
                    ? 'text-secondary'
                    : 'text-primary'
                }`}
              >
                {t.type === 'error'
                  ? 'error'
                  : t.type === 'success'
                  ? 'check_circle'
                  : 'info'}
              </span>
              <span>{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              className="min-w-[32px] min-h-[32px] flex items-center justify-center text-on-surface-variant hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        ))}
      </div>

      {/* Global Report Modal */}
      {reportTarget && (
        <div
          className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
        >
          <div className="bg-surface-container w-full max-w-md rounded-2xl p-space-xl flex flex-col gap-space-md shadow-2xl border border-surface-variant/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-error">
                <span className="material-symbols-outlined text-[22px]">flag</span>
                <h3 id="report-modal-title" className="font-headline-sm text-headline-sm text-on-surface">
                  Report {reportTarget.targetType}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeReportModal}
                aria-label="Close report modal"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Reporting: <strong className="text-on-surface">{reportTarget.targetTitle}</strong>
            </p>
            <form onSubmit={handleReportSubmit} className="flex flex-col gap-space-md">
              <div>
                <label
                  htmlFor="report-category"
                  className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1"
                >
                  Violation Category
                </label>
                <select
                  id="report-category"
                  value={reportCategory}
                  onChange={(e) => setReportCategory(e.target.value as ReportCategory)}
                  className="w-full h-11 px-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm focus:outline-none focus:ring-1 focus:ring-primary-container"
                >
                  <option value="spam">Spam or unsolicited promotion</option>
                  <option value="harassment">Harassment or abusive conduct</option>
                  <option value="ip-violation">Intellectual property / license violation</option>
                  <option value="malicious-link">Malicious or unsafe external link</option>
                  <option value="misleading">Misleading or fabricated specification</option>
                  <option value="other">Other community rule concern</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="report-reason"
                  className="font-code-sm text-code-sm text-on-surface-variant uppercase block mb-1"
                >
                  Reason for report
                </label>
                <textarea
                  id="report-reason"
                  rows={3}
                  required
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="Spam, abusive content, IP infringement, or off-topic solicitation..."
                  className="w-full p-3 rounded-lg bg-surface-container-high text-on-surface font-body-sm text-body-sm placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary-container"
                />
              </div>
              <div className="flex items-center justify-end gap-space-sm">
                <button
                  type="button"
                  onClick={closeReportModal}
                  className="min-h-[44px] px-4 rounded-lg text-on-surface-variant hover:text-on-surface font-title-md text-title-md"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="min-h-[44px] px-5 rounded-lg bg-error-container text-on-error-container font-title-md text-title-md hover:opacity-90 disabled:opacity-50"
                >
                  {submittingReport ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Global Confirmation Dialog for Destructive Actions */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <div className="bg-surface-container w-full max-w-md rounded-2xl p-space-xl flex flex-col gap-space-md shadow-2xl border border-surface-variant/40">
            <h3
              id="confirm-dialog-title"
              className="font-headline-sm text-headline-sm text-on-surface"
            >
              {confirmDialog.title}
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {confirmDialog.message}
            </p>
            <div className="flex items-center justify-end gap-space-sm pt-space-xs">
              <button
                type="button"
                onClick={closeConfirm}
                disabled={confirmBusy}
                className="min-h-[44px] px-4 rounded-lg text-on-surface-variant hover:text-on-surface font-title-md text-title-md"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmExecute}
                disabled={confirmBusy}
                className={`min-h-[44px] px-5 rounded-lg font-title-md text-title-md ${
                  confirmDialog.destructive
                    ? 'bg-error-container text-on-error-container'
                    : 'bg-primary-container text-on-primary'
                }`}
              >
                {confirmBusy ? 'Working...' : confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
