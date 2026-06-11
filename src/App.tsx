import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

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
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Home from './pages/Home';
import Chat from './pages/Chat';
import History from './pages/History';
import Settings from './pages/Settings';
import Subscription from './pages/Subscription';
import Help from './pages/Help';
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
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';
import AuthCallback from './pages/AuthCallback';

function App() {
  return (
    <ErrorBoundary>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public marketing pages */}
          <Route path="/" element={<Landing />} />
          <Route path="/pricing" element={<Pricing />} />

          {/* Auth pages */}
          <Route path="/signup" element={<Signup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/auth/callback" element={<AuthCallback />} />

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
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
            <Route path="subscription" element={<Subscription />} />
            <Route path="business-profile" element={<BusinessProfile />} />
            <Route path="agent-setup" element={<AgentSetup />} />
            <Route path="knowledge-base" element={<KnowledgeBase />} />
            <Route path="channel-connections" element={<ChannelConnections />} />
            <Route path="automations" element={<Automations />} />
            <Route path="leads" element={<Leads />} />
            <Route path="agent-test" element={<AgentTest />} />
            <Route path="launch-checklist" element={<LaunchChecklist />} />
            <Route path="help" element={<Help />} />
            <Route path="feedback" element={<Feedback />} />
          </Route>

          {/* Fallback: send unknown paths to landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
