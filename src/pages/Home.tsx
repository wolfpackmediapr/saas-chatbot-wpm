import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Bot, 
  Users, 
  ClipboardCheck, 
  Play, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { getOwnedWpmClient } from '../lib/supabase/wpmClients';
import { listOwnedLeads } from '../lib/supabase/wpmLeads';
import { buildLaunchChecklist, summarizeLaunchChecklist } from '../lib/wpm/launchChecklist';

interface DashboardStats {
  clientName: string;
  leadsCount: number;
  readinessPercent: number;
  nextAction: string;
  nextActionPath: string;
}

export default function Home() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        
        const client = await getOwnedWpmClient();
        const clientName = client?.name || 'Your Business';

        // Leads count
        let leadsCount = 0;
        if (client) {
          const leads = await listOwnedLeads(client.id, 100);
          leadsCount = leads.length;
        }

        // Readiness from launch checklist (basic local + profile completion)
        const items = buildLaunchChecklist();
        const completedKeys: string[] = [];
        if (client) completedKeys.push('client-profile');
        
        const summary = summarizeLaunchChecklist(items, completedKeys);
        const readinessPercent = summary.percentComplete;

        // Next suggested action
        let nextAction = 'Complete Business Profile';
        let nextActionPath = '/dashboard/business-profile';
        
        if (readinessPercent > 30) {
          nextAction = 'Test your AI Agent';
          nextActionPath = '/dashboard/agent-test';
        }
        if (readinessPercent > 60) {
          nextAction = 'Review Launch Checklist';
          nextActionPath = '/dashboard/launch-checklist';
        }

        setStats({
          clientName,
          leadsCount,
          readinessPercent,
          nextAction,
          nextActionPath,
        });
      } catch (err) {
        console.error('Dashboard load error:', err);
        // Fallback
        setStats({
          clientName: 'Your Business',
          leadsCount: 0,
          readinessPercent: 17,
          nextAction: 'Complete Business Profile',
          nextActionPath: '/dashboard/business-profile',
        });
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading || !stats) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-secondary-foreground">Loading your dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-xl">
              <Bot className="h-7 w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Welcome back</h1>
              <p className="text-secondary-foreground">{stats.clientName} • AI DM Agent</p>
            </div>
          </div>
        </div>
        
        <button 
          onClick={() => navigate('/dashboard/launch-checklist')}
          className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-colors"
        >
          <ClipboardCheck className="h-4 w-4" />
          Launch Checklist
        </button>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Readiness Card */}
        <div className="bg-secondary/50 rounded-xl p-5 border border-secondary">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-secondary-foreground">Self-Setup Readiness</span>
            <ClipboardCheck className="h-4 w-4 text-primary" />
          </div>
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-4xl font-bold">{stats.readinessPercent}</span>
            <span className="text-xl text-secondary-foreground">%</span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden mb-2">
            <div 
              className="h-full bg-primary transition-all" 
              style={{ width: `${stats.readinessPercent}%` }}
            />
          </div>
          <p className="text-xs text-secondary-foreground">
            {stats.readinessPercent < 50 ? 'Complete the setup steps to launch' : 'Looking good — keep going'}
          </p>
        </div>

        {/* Leads Card */}
        <div 
          onClick={() => navigate('/dashboard/leads')}
          className="bg-secondary/50 rounded-xl p-5 border border-secondary cursor-pointer hover:border-primary/50 transition-colors group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-secondary-foreground">Leads Captured</span>
            <Users className="h-4 w-4 text-primary" />
          </div>
          <div className="text-4xl font-bold mb-1">{stats.leadsCount}</div>
          <div className="flex items-center text-xs text-secondary-foreground group-hover:text-primary transition-colors">
            View all leads <ArrowRight className="h-3 w-3 ml-1" />
          </div>
        </div>

        {/* Next Action Card */}
        <div 
          onClick={() => navigate(stats.nextActionPath)}
          className="bg-primary/10 border border-primary/30 rounded-xl p-5 cursor-pointer hover:bg-primary/15 transition-colors group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-primary">Recommended Next Step</span>
            <Play className="h-4 w-4 text-primary" />
          </div>
          <div className="text-lg font-semibold mb-1 pr-6">{stats.nextAction}</div>
          <div className="flex items-center text-xs text-primary/80 group-hover:text-primary transition-colors">
            Go to page <ArrowRight className="h-3 w-3 ml-1" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Business Profile', icon: Bot, path: '/dashboard/business-profile', desc: 'Update your brand details' },
            { label: 'Test Agent', icon: Play, path: '/dashboard/agent-test', desc: 'Simulate conversations & leads' },
            { label: 'Automations', icon: ClipboardCheck, path: '/dashboard/automations', desc: 'Connect Zapier / Email / Webhooks' },
            { label: 'Leads', icon: Users, path: '/dashboard/leads', desc: 'View captured prospects' },
          ].map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-start text-left p-4 bg-secondary/50 hover:bg-secondary border border-secondary rounded-xl transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <action.icon className="h-5 w-5 text-primary" />
                <span className="font-medium">{action.label}</span>
              </div>
              <span className="text-xs text-secondary-foreground group-hover:text-foreground">{action.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Getting Started Tip */}
      <div className="bg-secondary/30 rounded-xl p-5 text-sm border border-secondary">
        <div className="flex gap-3">
          <div className="mt-0.5">
            <AlertCircle className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium mb-1">Pro tip for launch</div>
            <p className="text-secondary-foreground">
              Use <strong>Test Agent</strong> to generate sample leads and verify your automations fire correctly before going live with real channels.
              Check the <strong>Launch Checklist</strong> for the full readiness status including live system checks.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
