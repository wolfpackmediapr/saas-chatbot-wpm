import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom';

// Old standalone pages now live as Settings tabs; preserve query params
// (e.g. Stripe's ?checkout=success) across the redirect.
function SettingsTabRedirect({ tab }: { tab: string }) {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  params.set('tab', tab);
  return <Navigate to={`/dashboard/settings?${params.toString()}`} replace />;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8 text-center">
          <div>
            <h1 className="text-2xl font-bold mb-2">Something went wrong</h1>
            <p className="text-muted-foreground mb-4">{(this.state.error as Error).message}</p>
            <button className="underline" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
import { AuthProvider } from './contexts/AuthContext';
import { NotificationsProvider } from './contexts/NotificationsContext';
import { ToastProvider } from './components/ui/Toast';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import Feedback from './pages/Feedback';
import LaunchChecklist from './pages/LaunchChecklist';
import BusinessProfile from './pages/BusinessProfile';
import AgentSetup from './pages/AgentSetup';
import KnowledgeBase from './pages/KnowledgeBase';
import ChannelConnections from './pages/ChannelConnections';
import Automations from './pages/Automations';
import AgentTest from './pages/AgentTest';
import Leads from './pages/Leads';
import Inbox from './pages/Inbox';
import Signup from './pages/Signup';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';
import AuthCallback from './pages/AuthCallback';

function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
    <ToastProvider>
    <NotificationsProvider>
      <BrowserRouter>
        <Routes>
          {/* Public marketing pages */}
          <Route path="/" element={<Landing />} />
          <Route path="/pricing" element={<Pricing />} />

          {/* Auth pages */}
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          {/* resetPassword() has always redirected here. Without this route the
              catch-all sent every reset link to the marketing homepage. */}
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          {/* Google sign-in lands here, not on /auth/callback: that path is the
              Meta channel-connection popup's redirect URI, registered with Meta.
              Landing straight on /dashboard would race the guard instead. */}
          <Route
            path="/auth/complete"
            element={<AuthCallback errorPath="/login" errorLabel="Back to sign in" />}
          />

          {/* Protected App (now under /dashboard to free up root for marketing) */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Home />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="chat/new" element={<Chat />} />
            <Route path="chat/:threadId" element={<Chat />} />
            <Route path="settings" element={<Settings />} />
            <Route path="subscription" element={<SettingsTabRedirect tab="plan" />} />
            <Route path="business-profile" element={<BusinessProfile />} />
            <Route path="agent-setup" element={<AgentSetup />} />
            <Route path="knowledge-base" element={<KnowledgeBase />} />
            <Route path="channel-connections" element={<ChannelConnections />} />
            <Route path="automations" element={<Automations />} />
            <Route path="leads" element={<Leads />} />
            <Route path="agent-test" element={<AgentTest />} />
            <Route path="launch-checklist" element={<LaunchChecklist />} />
            <Route path="help" element={<SettingsTabRedirect tab="help" />} />
            <Route path="feedback" element={<Feedback />} />
          </Route>

          {/* Fallback: send unknown paths to landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </NotificationsProvider>
    </ToastProvider>
    </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
