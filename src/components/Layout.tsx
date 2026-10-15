import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Moon,
  Sun,
  Bell,
  Plus,
  User,
  LogIn,
  LogOut,
  Bookmark,
  Shield,
  Download,
  WifiOff,
  ExternalLink,
  Home,
  Compass,
  PlusCircle,
  Network,
  X,
  Flag,
  AlertCircle,
  CheckCircle2,
  Info,
  Ban,
  Smartphone,
  Info as InfoIcon,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { SITE_CONFIG } from '../config/siteConfig';
import { submitReport, signOutUser } from '../firebase';
import { ReportCategory } from '../types/synapse';
import { checkRateLimit } from '../utils/sanitize';
import { GlobalSearchBar } from './GlobalSearchBar';
import { PWAInstallButton } from './PWAInstallButton';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { useFeatureVisibility } from '../hooks/useFeatureVisibility';

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
    savedBookmarks,
    reports,
    theme,
    toggleTheme,
    toasts,
    dismissToast,
    reportTarget,
    closeReportModal,
    confirmDialog,
    closeConfirm,
    showToast,
  } = useApp();

  const { showConnections, showShowcase } = useFeatureVisibility();

  const location = useLocation();
  const navigate = useNavigate();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { isInstallable, install, isIOS } = usePWAInstall();

  // Close profile dropdown on outside click or route change
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setProfileMenuOpen(false);
  }, [location.pathname]);

  // Report Modal State
  const [reportCategory, setReportCategory] = useState<ReportCategory>('spam');
  const [reportReason, setReportReason] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTarget) return;

    if (!user) {
      showToast('Please sign in to submit a moderation report.', 'info');
      closeReportModal();
      navigate('/login?returnTo=' + encodeURIComponent(location.pathname));
      return;
    }

    if (!checkRateLimit(`report_${user.uid}`, 60000).allowed) {
      showToast('Too many reports submitted recently. Please wait a minute.', 'error');
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
        reporter: profile || {
          uid: user.uid,
          username: user.displayName || 'member',
          displayName: user.displayName || 'Member',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      showToast('Report submitted. Our moderation team will review it.', 'success');
      setReportReason('');
      closeReportModal();
    } catch {
      showToast('Could not submit report. Please try again.', 'error');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Confirm Dialog Action Handler
  const [confirmBusy, setConfirmBusy] = useState(false);
  const handleConfirmExecute = async () => {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    try {
      await confirmDialog.onConfirm();
      closeConfirm();
    } catch {
      showToast('Action failed. Please try again.', 'error');
    } finally {
      setConfirmBusy(false);
    }
  };

  const isSuspended = profile?.accountStatus === 'disabled' || profile?.suspended === true;
  const currentYear = new Date().getFullYear();
  const openReportsCount = reports.filter((r) => r.status === 'open').length;

  return (
    <div className="min-h-screen flex flex-col bg-surface text-on-surface font-body-md">
      {/* Skip to Main Content Link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-on-primary focus:rounded-lg focus:shadow-lg focus:outline-none"
      >
        Skip to main content
      </a>

      {/* Primary Top App Bar */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface/90 backdrop-blur-md border-b border-surface-variant/40 transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-margin h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Logo & Desktop Nav */}
          <div className="flex items-center gap-4 xl:gap-8 min-w-0 shrink-0">
            <Link
              to="/"
              className="flex items-center min-h-[44px] shrink-0 focus-visible:outline-2 focus-visible:outline-primary-container rounded-lg"
              aria-label="Synapse Home"
            >
              <SynapseBrandLogo size="md" />
            </Link>

            {/* Top nav: Explore, Showcase*, Connections*, About */}
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

              {showShowcase && (
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
              )}

              {showConnections && (
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
              )}

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
            </nav>
          </div>

          {/* Global Search Bar */}
          <GlobalSearchBar />

          {/* Right Action Cluster */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* PWA Install Button on desktop only */}
            <div className="hidden lg:flex">
              <PWAInstallButton />
            </div>

            {/* Theme Toggle on desktop */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="hidden lg:flex min-w-[40px] min-h-[40px] shrink-0 rounded-lg items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors focus-visible:outline-2 focus-visible:outline-primary-container"
            >
              {theme === 'dark' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>

            {user && (
              <Link
                to="/notifications"
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
                className="relative min-w-[40px] min-h-[40px] shrink-0 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors focus-visible:outline-2 focus-visible:outline-primary-container"
              >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary-container text-on-primary font-code-sm text-[10px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
            )}

            {/* Post idea button */}
            <Link
              to="/post/basics"
              className="hidden sm:inline-flex items-center justify-center whitespace-nowrap shrink-0 h-10 px-3.5 bg-primary-container text-on-primary font-title-md text-body-sm font-semibold rounded-lg hover:opacity-90 transition-opacity focus-visible:outline-2 focus-visible:outline-primary-container"
            >
              <Plus className="w-4 h-4 mr-1" />
              <span>Post idea</span>
            </Link>

            {/* Avatar & Profile Menu Dropdown */}
            <div className="relative flex items-center pl-space-xs border-l border-surface-variant/40" ref={profileMenuRef}>
              <button
                type="button"
                onClick={() => setProfileMenuOpen((prev) => !prev)}
                aria-expanded={profileMenuOpen}
                aria-haspopup="true"
                aria-label="Account and settings menu"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-surface-container-high transition-colors focus-visible:outline-2 focus-visible:outline-primary-container"
              >
                {user ? (
                  <span className="w-8 h-8 rounded-full bg-primary text-on-primary font-code-sm text-xs font-bold flex items-center justify-center shrink-0">
                    {(profile?.displayName || user.email || 'U').slice(0, 2).toUpperCase()}
                  </span>
                ) : (
                  <span className="w-8 h-8 rounded-full bg-surface-container-highest border border-surface-variant flex items-center justify-center shrink-0 text-on-surface-variant">
                    <User className="w-4 h-4" />
                  </span>
                )}
              </button>

              {/* Profile Dropdown Menu */}
              {profileMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-72 rounded-2xl bg-surface-container border border-surface-variant/60 shadow-2xl z-50 p-3 flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-100"
                >
                  {user ? (
                    <div className="px-2 py-1.5 flex items-center gap-2.5 border-b border-surface-variant/30 pb-2.5">
                      <span className="w-10 h-10 rounded-full bg-primary text-on-primary font-code-sm text-sm font-bold flex items-center justify-center shrink-0">
                        {(profile?.displayName || user.email || 'U').slice(0, 2).toUpperCase()}
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-title-md text-title-md text-on-surface truncate font-semibold">
                          {profile?.displayName || 'User'}
                        </span>
                        <span className="font-body-sm text-[13px] text-on-surface-variant truncate">
                          {user.email || `@${profile?.username || 'member'}`}
                        </span>
                        {isAdmin && (
                          <span className="mt-1 w-fit px-1.5 py-0.5 rounded text-[11px] font-code-sm font-semibold bg-primary/20 text-primary border border-primary/40">
                            Admin Account
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="px-2 py-1.5 border-b border-surface-variant/30 pb-2">
                      <p className="font-title-md text-title-md font-semibold text-on-surface">Welcome to Synapse</p>
                      <p className="font-body-sm text-[13px] text-on-surface-variant">Sign in to post ideas and collaborate</p>
                      <Link
                        to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
                        onClick={() => setProfileMenuOpen(false)}
                        className="mt-2 w-full min-h-[38px] flex items-center justify-center gap-2 bg-primary-container text-on-primary rounded-lg font-title-md text-title-md font-semibold hover:opacity-90 transition-opacity"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Sign in with Google</span>
                      </Link>
                    </div>
                  )}

                  {/* Guest Saved Ideas quick link */}
                  {!user && savedBookmarks.length > 0 && (
                    <div className="flex flex-col gap-0.5 border-b border-surface-variant/30 pb-1.5">
                      <Link
                        to="/login?returnTo=%2Fprofile%23saved-ideas"
                        onClick={() => setProfileMenuOpen(false)}
                        className="min-h-[40px] px-2.5 rounded-lg flex items-center justify-between text-on-surface hover:bg-surface-container-high transition-colors text-[14px]"
                      >
                        <div className="flex items-center gap-2.5">
                          <Bookmark className="w-4 h-4 text-primary" />
                          <span>Saved Ideas (on this device)</span>
                        </div>
                        <span className="px-1.5 py-0.5 rounded-full bg-surface-container-highest text-primary font-code-sm text-[11px] font-bold">
                          {savedBookmarks.length}
                        </span>
                      </Link>
                    </div>
                  )}

                  {/* Profile & User links */}
                  {user && (
                    <div className="flex flex-col gap-0.5">
                      <Link
                        to="/profile"
                        onClick={() => setProfileMenuOpen(false)}
                        className="min-h-[40px] px-2.5 rounded-lg flex items-center gap-2.5 text-on-surface hover:bg-surface-container-high transition-colors text-[14px]"
                      >
                        <User className="w-4 h-4 text-on-surface-variant" />
                        <span>Your Profile</span>
                      </Link>
                      <Link
                        to="/profile#saved-ideas"
                        onClick={() => setProfileMenuOpen(false)}
                        className="min-h-[40px] px-2.5 rounded-lg flex items-center justify-between text-on-surface hover:bg-surface-container-high transition-colors text-[14px]"
                      >
                        <div className="flex items-center gap-2.5">
                          <Bookmark className="w-4 h-4 text-primary" />
                          <span>Saved Ideas</span>
                        </div>
                        {savedBookmarks.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-surface-container-highest text-primary font-code-sm text-[11px] font-bold">
                            {savedBookmarks.length}
                          </span>
                        )}
                      </Link>
                      <Link
                        to="/notifications"
                        onClick={() => setProfileMenuOpen(false)}
                        className="min-h-[40px] px-2.5 rounded-lg flex items-center justify-between text-on-surface hover:bg-surface-container-high transition-colors text-[14px]"
                      >
                        <div className="flex items-center gap-2.5">
                          <Bell className="w-4 h-4 text-on-surface-variant" />
                          <span>Notifications</span>
                        </div>
                        {unreadCount > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-primary-container text-on-primary font-code-sm text-[11px] font-bold">
                            {unreadCount}
                          </span>
                        )}
                      </Link>
                    </div>
                  )}

                  {/* Admin Panel Entry - ONLY for Admin */}
                  {isAdmin && (
                    <div className="border-t border-surface-variant/30 pt-1">
                      <Link
                        to="/admin"
                        onClick={() => setProfileMenuOpen(false)}
                        className="min-h-[42px] px-2.5 rounded-lg flex items-center justify-between bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 transition-colors text-[14px] font-semibold"
                      >
                        <div className="flex items-center gap-2.5">
                          <Shield className="w-4 h-4" />
                          <span>Admin Panel</span>
                        </div>
                        {openReportsCount > 0 && (
                          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-error-container text-on-error-container font-code-sm text-[10px] font-bold flex items-center justify-center">
                            {openReportsCount}
                          </span>
                        )}
                      </Link>
                    </div>
                  )}

                  {/* Theme Toggle & Install App in Avatar Menu */}
                  <div className="border-t border-surface-variant/30 pt-1 flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        toggleTheme();
                      }}
                      className="min-h-[40px] w-full px-2.5 rounded-lg flex items-center justify-between text-on-surface hover:bg-surface-container-high transition-colors text-[14px]"
                    >
                      <div className="flex items-center gap-2.5">
                        {theme === 'dark' ? (
                          <Moon className="w-4 h-4 text-on-surface-variant" />
                        ) : (
                          <Sun className="w-4 h-4 text-on-surface-variant" />
                        )}
                        <span>Theme</span>
                      </div>
                      <span className="text-on-surface-variant text-[13px] capitalize font-medium">
                        {theme === 'dark' ? 'Dark' : 'Light'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        if (isInstallable) {
                          install();
                        } else {
                          setShowInstallGuideModal(true);
                        }
                      }}
                      className="min-h-[40px] w-full px-2.5 rounded-lg flex items-center justify-between text-on-surface hover:bg-surface-container-high transition-colors text-[14px]"
                    >
                      <div className="flex items-center gap-2.5">
                        <Smartphone className="w-4 h-4 text-secondary" />
                        <span>Install App</span>
                      </div>
                      <span className="text-secondary text-[12px] font-code-sm">PWA</span>
                    </button>
                  </div>

                  {/* Sign Out (if logged in) */}
                  {user && (
                    <div className="border-t border-surface-variant/30 pt-1">
                      <button
                        type="button"
                        onClick={async () => {
                          setProfileMenuOpen(false);
                          try {
                            await signOutUser();
                            showToast('Signed out successfully.', 'info');
                          } catch {
                            showToast('Could not sign out.', 'error');
                          }
                        }}
                        className="min-h-[40px] w-full px-2.5 rounded-lg flex items-center gap-2.5 text-error hover:bg-error-container/20 transition-colors text-[14px]"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Sign out</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area with safe area padding */}
      <main id="main-content" className="w-full pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-0 flex-1 bg-surface">
        {!isOnline && (
          <div
            role="status"
            aria-live="polite"
            className="bg-primary-container/15 border-b border-primary/40 text-on-surface px-4 py-2.5 text-center font-code-sm text-code-sm flex items-center justify-center gap-2"
          >
            <WifiOff className="w-4 h-4 text-primary" />
            <span>
              Offline mode — browsing cached ideas works normally. Publishing and changes
              will resume when your connection returns.
            </span>
          </div>
        )}
        {isSuspended && (
          <div
            role="alert"
            className="bg-error-container text-on-error-container border-b border-error/40 px-4 py-2.5 text-center font-code-sm text-code-sm flex items-center justify-center gap-2"
          >
            <Ban className="w-4 h-4 text-error" />
            <span>
              Your account is currently suspended by a platform administrator. Public browsing remains
              available, but posting ideas, responses, and volunteer offers is disabled.
            </span>
          </div>
        )}
        {children}
      </main>

      {/* Footer */}
      <footer className="w-full bg-surface-container-lowest border-t border-surface-variant/30 py-space-xl pb-[calc(5rem+env(safe-area-inset-bottom,0px))] lg:pb-space-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-margin">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-space-xl pb-space-xl border-b border-surface-variant/20">
            <div className="md:col-span-4 flex flex-col gap-space-md">
              <Link to="/" className="inline-flex items-center w-fit">
                <SynapseBrandLogo size="sm" />
              </Link>
              <p className="font-body-sm text-[13px] text-on-surface-variant max-w-sm leading-relaxed">
                {SITE_CONFIG.tagline}
              </p>
              <div className="flex items-center gap-space-xs">
                <span className="w-2 h-2 rounded-full bg-secondary" />
                <span className="font-label-sm text-[13px] text-secondary tracking-wider font-medium">
                  Free and volunteer-run
                </span>
              </div>
            </div>

            <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-space-lg">
              <div className="flex flex-col gap-space-sm">
                <h3 className="font-title-md text-title-md text-on-surface font-semibold">
                  Explore
                </h3>
                <ul className="flex flex-col gap-space-xs font-body-sm text-[13px] text-on-surface-variant">
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/explore" className="hover:text-on-surface transition-colors">
                      Browse All Ideas
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
                <ul className="flex flex-col gap-space-xs font-body-sm text-[13px] text-on-surface-variant">
                  {showConnections && (
                    <li className="min-h-[44px] flex items-center">
                      <Link
                        to="/connections"
                        title="See how related ideas connect"
                        className="hover:text-on-surface transition-colors"
                      >
                        Idea Map
                      </Link>
                    </li>
                  )}
                  {showShowcase && (
                    <li className="min-h-[44px] flex items-center">
                      <Link to="/showcase" className="hover:text-on-surface transition-colors">
                        Showcase
                      </Link>
                    </li>
                  )}
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/about" className="hover:text-on-surface transition-colors">
                      About Synapse
                    </Link>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <a
                      href={SITE_CONFIG.githubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-on-surface transition-colors inline-flex items-center gap-1"
                    >
                      <span>GitHub</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <a
                      href={SITE_CONFIG.buyMeACoffeeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-on-surface transition-colors inline-flex items-center gap-1"
                    >
                      <span>Support Solo Maker</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col gap-space-sm">
                <h3 className="font-title-md text-title-md text-on-surface font-semibold">
                  Ethos &amp; Conduct
                </h3>
                <ul className="flex flex-col gap-space-xs font-body-sm text-[13px] text-on-surface-variant">
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/about#principles" className="hover:text-on-surface transition-colors">
                      Idea Ownership
                    </Link>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/about#conduct" className="hover:text-on-surface transition-colors">
                      Code of Conduct
                    </Link>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/privacy" className="hover:text-on-surface transition-colors">
                      Privacy Policy
                    </Link>
                  </li>
                  <li className="min-h-[44px] flex items-center">
                    <Link to="/terms" className="hover:text-on-surface transition-colors">
                      Terms of Service
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="pt-space-lg flex flex-col sm:flex-row items-center justify-between gap-space-md text-[13px] text-on-surface-variant">
            <p>
              © {currentYear} Synapse. Free and open community. Ideas belong to their creators.
            </p>
            <div className="flex items-center gap-space-md">
              <Link to="/privacy" className="hover:text-on-surface transition-colors">
                Privacy
              </Link>
              <span>·</span>
              <Link to="/terms" className="hover:text-on-surface transition-colors">
                Terms
              </Link>
              <span>·</span>
              <Link to="/about" className="hover:text-on-surface transition-colors">
                About
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (360px viewport optimized) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-surface-variant/40 px-2 py-1 flex items-center justify-around pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))]"
      >
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg font-label-sm text-[12px] px-2 ${
              isActive ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'
            }`
          }
        >
          <Home className="w-5 h-5" />
          <span>Home</span>
        </NavLink>
        <NavLink
          to="/explore"
          className={({ isActive }) =>
            `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg font-label-sm text-[12px] px-2 ${
              isActive ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'
            }`
          }
        >
          <Compass className="w-5 h-5" />
          <span>Explore</span>
        </NavLink>
        <NavLink
          to="/post/basics"
          className={({ isActive }) =>
            `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg font-label-sm text-[12px] px-2 ${
              isActive ? 'text-primary font-semibold' : 'text-primary'
            }`
          }
        >
          <PlusCircle className="w-6 h-6 text-primary" />
          <span>Post</span>
        </NavLink>

        {showConnections ? (
          <NavLink
            to="/connections"
            title="See how related ideas connect"
            className={({ isActive }) =>
              `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg font-label-sm text-[12px] px-2 ${
                isActive ? 'text-secondary font-semibold' : 'text-on-surface-variant hover:text-on-surface'
              }`
            }
          >
            <Network className="w-5 h-5" />
            <span>Idea Map</span>
          </NavLink>
        ) : (
          <NavLink
            to="/about"
            className={({ isActive }) =>
              `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg font-label-sm text-[12px] px-2 ${
                isActive ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'
              }`
            }
          >
            <InfoIcon className="w-5 h-5" />
            <span>About</span>
          </NavLink>
        )}

        <NavLink
          to={user ? '/profile' : '/login'}
          className={({ isActive }) =>
            `min-h-[44px] flex flex-col items-center justify-center gap-0.5 rounded-lg font-label-sm text-[12px] px-2 ${
              isActive ? 'text-primary font-semibold' : 'text-on-surface-variant hover:text-on-surface'
            }`
          }
        >
          <User className="w-5 h-5" />
          <span>{user ? 'Profile' : 'Sign In'}</span>
        </NavLink>
      </nav>

      {/* PWA Install Guide Modal when opened from Avatar Menu */}
      {showInstallGuideModal && (
        <div
          className="fixed inset-0 z-50 bg-surface-container-lowest/80 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-modal-title"
        >
          <div className="bg-surface-container w-full max-w-md rounded-2xl p-space-xl flex flex-col gap-space-md shadow-2xl border border-surface-variant/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-secondary">
                <Download className="w-5 h-5" />
                <h3
                  id="pwa-install-modal-title"
                  className="font-headline-sm text-headline-sm text-on-surface font-semibold"
                >
                  Install Synapse App
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallGuideModal(false)}
                aria-label="Close installation guide"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
              {isIOS
                ? 'To install Synapse on iOS: tap the Share button in Safari, then tap "Add to Home Screen".'
                : 'To install Synapse on Chrome or Android: tap the browser menu (⋮) and select "Install app" or "Add to Home screen".'}
            </p>

            <button
              type="button"
              onClick={() => setShowInstallGuideModal(false)}
              className="mt-2 min-h-[44px] w-full bg-primary-container text-on-primary font-title-md text-title-md font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              Got it
            </button>
          </div>
        </div>
      )}

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
              {t.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-error shrink-0" />
              ) : t.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-secondary shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-primary shrink-0" />
              )}
              <span>{t.message}</span>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              className="min-w-[32px] min-h-[32px] flex items-center justify-center text-on-surface-variant hover:text-on-surface"
            >
              <X className="w-4 h-4" />
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
                <Flag className="w-5 h-5" />
                <h3 id="report-modal-title" className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Report {reportTarget.targetType}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeReportModal}
                aria-label="Close report modal"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-on-surface-variant hover:text-on-surface"
              >
                <X className="w-5 h-5" />
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
                  <option value="misleading">Misleading or fabricated idea</option>
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
              className="font-headline-sm text-headline-sm text-on-surface font-semibold"
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
