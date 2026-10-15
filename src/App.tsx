/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AdminRouteGuard } from './components/AdminRouteGuard';
import { Layout } from './components/Layout';
import { RouteSkeleton } from './components/Skeletons';

// Code-split routes using React.lazy
const HomePage = React.lazy(() =>
  import('./pages/HomePage').then((m) => ({ default: m.HomePage }))
);
const ExplorePage = React.lazy(() =>
  import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage }))
);
const IdeaDetailPage = React.lazy(() =>
  import('./pages/IdeaDetailPage').then((m) => ({ default: m.IdeaDetailPage }))
);
const PostWizardPage = React.lazy(() =>
  import('./pages/PostWizardPage').then((m) => ({ default: m.PostWizardPage }))
);
const ConnectionsPage = React.lazy(() =>
  import('./pages/ConnectionsPage').then((m) => ({ default: m.ConnectionsPage }))
);
const ShowcasePage = React.lazy(() =>
  import('./pages/ShowcasePage').then((m) => ({ default: m.ShowcasePage }))
);
const AboutSupportPage = React.lazy(() =>
  import('./pages/AboutSupportPage').then((m) => ({ default: m.AboutSupportPage }))
);
const LoginPage = React.lazy(() =>
  import('./pages/LoginProfilePage').then((m) => ({ default: m.LoginPage }))
);
const ProfilePage = React.lazy(() =>
  import('./pages/LoginProfilePage').then((m) => ({ default: m.ProfilePage }))
);
const PublicUserProfilePage = React.lazy(() =>
  import('./pages/LoginProfilePage').then((m) => ({ default: m.PublicUserProfilePage }))
);
const NotificationsPage = React.lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);
const AdminReportsPage = React.lazy(() =>
  import('./pages/AdminReportsPage').then((m) => ({ default: m.AdminReportsPage }))
);
const GitHubPage = React.lazy(() =>
  import('./pages/GitHubPage').then((m) => ({ default: m.GitHubPage }))
);
const NotFoundPage = React.lazy(() =>
  import('./pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage }))
);
const LegalPage = React.lazy(() =>
  import('./pages/LegalPage').then((m) => ({ default: m.LegalPage }))
);

function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname, hash]);
  return null;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMessage: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface text-on-surface flex items-center justify-center p-6">
          <div className="bg-surface-container-low max-w-lg w-full rounded-2xl p-8 flex flex-col gap-4 border border-error/40">
            <h1 className="font-headline-md text-headline-md text-error">
              Something went wrong
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant break-words">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, errorMessage: '' });
                window.location.href = '/';
              }}
              className="min-h-[44px] px-5 rounded-lg bg-primary-container text-on-primary font-title-md text-title-md self-start"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const appBasename =
  window.location.pathname.startsWith('/Synapse') ? '/Synapse' : undefined;

export default function App() {
  return (
    <AppErrorBoundary>
      <BrowserRouter basename={appBasename}>
        <AppProvider>
          <ScrollManager />
          <Layout>
            <Suspense fallback={<RouteSkeleton />}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/ideas/:id" element={<IdeaDetailPage tab="overview" />} />
                <Route path="/ideas/:id/responses" element={<IdeaDetailPage tab="responses" />} />
                <Route
                  path="/ideas/:id/volunteers"
                  element={<IdeaDetailPage tab="volunteers" />}
                />
                <Route
                  path="/ideas/:id/connections"
                  element={<IdeaDetailPage tab="connections" />}
                />
                <Route path="/ideas/:id/edit" element={<IdeaDetailPage tab="edit" />} />
                <Route path="/post" element={<Navigate to="/post/basics" replace />} />
                <Route path="/post/basics" element={<PostWizardPage step={1} />} />
                <Route path="/post/details" element={<PostWizardPage step={2} />} />
                <Route path="/post/collaborate" element={<PostWizardPage step={3} />} />
                <Route path="/post/review" element={<PostWizardPage step={4} />} />
                <Route path="/connections" element={<ConnectionsPage />} />
                <Route path="/showcase" element={<ShowcasePage />} />
                <Route path="/showcase/:id" element={<ShowcasePage />} />
                <Route path="/about" element={<AboutSupportPage />} />
                <Route path="/support" element={<Navigate to="/about" replace />} />
                <Route path="/github" element={<GitHubPage />} />
                <Route path="/open-source" element={<Navigate to="/github" replace />} />
                <Route path="/terms" element={<LegalPage type="terms" />} />
                <Route path="/privacy" element={<LegalPage type="privacy" />} />
                <Route path="/sitemap" element={<Navigate to="/explore" replace />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/u/:username" element={<PublicUserProfilePage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route
                  path="/admin"
                  element={
                    <AdminRouteGuard>
                      <AdminReportsPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path="/admin/reports"
                  element={
                    <AdminRouteGuard>
                      <AdminReportsPage />
                    </AdminRouteGuard>
                  }
                />
                <Route
                  path="/admin/security-check"
                  element={
                    <AdminRouteGuard>
                      <AdminReportsPage />
                    </AdminRouteGuard>
                  }
                />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Suspense>
          </Layout>
        </AppProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  );
}
