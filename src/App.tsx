import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import Signup from './pages/Signup';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Landing from './pages/Landing';
import Pricing from './pages/Pricing';

function App() {
  return (
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
  );
}

export default App;
