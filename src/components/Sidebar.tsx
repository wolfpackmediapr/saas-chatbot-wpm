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
  Bot,
  LogOut,
  User,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../contexts/AuthContext';
import { getCompanyLogo } from '../lib/supabase/settings';

const mainNavItems = [
  { icon: MessageSquarePlus, label: 'New Chat', path: '/chat/new' },
  { icon: ClipboardCheck, label: 'Launch Checklist', path: '/launch-checklist' },
  { icon: History, label: 'Recent History', path: '/history' },
  { icon: HelpCircle, label: 'Help Center', path: '/help' },
  { icon: Send, label: 'Send Feedback', path: '/feedback' },
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
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                  'hover:bg-secondary',
                  isActive ? 'bg-secondary text-primary' : 'text-secondary-foreground'
                )
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-4 space-y-2 border-t border-secondary">
        {user && (
          <div className="mb-2 p-3 bg-secondary rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <User className="w-4 h-4 text-primary" />
              <span className="truncate">{user.email}</span>
            </div>
          </div>
        )}

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors w-full',
              'hover:bg-secondary',
              isActive ? 'bg-secondary text-primary' : 'text-secondary-foreground'
            )
          }
        >
          <Settings className="w-5 h-5" />
          Settings
        </NavLink>

        <button
          onClick={() => navigate('/subscription')}
          className="w-full bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg px-4 py-2 flex items-center justify-center gap-2 transition-colors"
        >
          <Crown className="w-4 h-4" />
          Upgrade to PRO!
        </button>

        <button
          onClick={handleSignOut}
          className="w-full bg-secondary hover:bg-secondary/70 text-secondary-foreground rounded-lg px-4 py-2 flex items-center justify-center gap-2 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}