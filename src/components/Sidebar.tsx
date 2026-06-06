import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  MessageSquarePlus,
  History,
  Settings,
  HelpCircle,
  Crown,
  Send,
  ClipboardCheck,
  Building2,
  Bot,
  BookOpenText,
  PlugZap,
  Zap,
  Play,
  Users,
  LogOut,
  User,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { getCompanyLogo } from '../lib/supabase/settings';

const mainNavItems = [
  { icon: MessageSquarePlus, label: 'New Chat', path: '/dashboard/chat/new' },
  { icon: Building2, label: 'Business Profile', path: '/dashboard/business-profile' },
  { icon: Bot, label: 'Agent Setup', path: '/dashboard/agent-setup' },
  { icon: BookOpenText, label: 'Knowledge Base', path: '/dashboard/knowledge-base' },
  { icon: PlugZap, label: 'Channel Connections', path: '/dashboard/channel-connections' },
  { icon: Zap, label: 'Automations', path: '/dashboard/automations' },
  { icon: Users, label: 'Leads', path: '/dashboard/leads' },
  { icon: Play, label: 'Test Agent', path: '/dashboard/agent-test' },
  { icon: ClipboardCheck, label: 'Launch Checklist', path: '/dashboard/launch-checklist' },
  { icon: History, label: 'Recent History', path: '/dashboard/history' },
  { icon: HelpCircle, label: 'Help Center', path: '/dashboard/help' },
  { icon: Send, label: 'Send Feedback', path: '/dashboard/feedback' },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut } = useAuth();
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    async function loadLogo() {
      try {
        const companyLogo = await getCompanyLogo();
        setLogo(companyLogo);
      } catch (error) {
        console.error('Failed to load logo:', error);
      }
    }
    loadLogo();
  }, []);

  useEffect(() => {
    onClose();
  }, [location.pathname, onClose]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <aside className={cn(
      "w-64 border-r border-secondary bg-secondary/50 flex flex-col h-full transition-transform duration-300 ease-in-out",
      "fixed lg:relative top-0 left-0 z-50 lg:translate-x-0",
      isOpen ? "translate-x-0" : "-translate-x-full"
    )}>
      <div className="p-4">
        <div className="mb-6 flex items-center justify-between lg:justify-center">
          <div className="flex items-center gap-2">
            {logo ? (
              <img src={logo} alt="WolfPack Media Logo" className="h-10 max-w-[180px] object-contain" />
            ) : (
              <div className="flex items-center gap-2 text-xl font-semibold">
                <Bot className="h-6 w-6 text-primary" />
                <span>WolfPack Media</span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-2 hover:bg-secondary rounded-lg transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-2">
          {mainNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all touch-manipulation",
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "hover:bg-secondary text-secondary-foreground hover:text-foreground"
                )
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-secondary">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-secondary-foreground hover:bg-secondary hover:text-foreground transition-colors touch-manipulation"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
