import React, { useState } from 'react';
import { Zap, ToggleLeft, ToggleRight, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';

interface Automation {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  type: 'webhook' | 'email' | 'crm';
}

export default function Automations() {
  const [automations, setAutomations] = useState<Automation[]>([
    {
      id: 'qualified-lead',
      name: 'Qualified Lead Webhook',
      description: 'Send structured lead data to Zapier / Make / n8n when a prospect shows strong intent.',
      enabled: false,
      type: 'webhook',
    },
    {
      id: 'email-notification',
      name: 'Email Notification',
      description: 'Email your team (via Resend) when a high-value lead is captured.',
      enabled: true,
      type: 'email',
    },
    {
      id: 'crm-sync',
      name: 'CRM Sync',
      description: 'Push new leads and conversation summaries to your CRM.',
      enabled: false,
      type: 'crm',
    },
  ]);

  const [webhookUrl, setWebhookUrl] = useState('');

  const toggleAutomation = (id: string) => {
    setAutomations(prev =>
      prev.map(a =>
        a.id === id ? { ...a, enabled: !a.enabled } : a
      )
    );
  };

  const saveWebhook = () => {
    // In real version this would save to Supabase wpm_integrations
    alert('Webhook saved (demo). In production this will be stored securely and used by the edge function.');
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-semibold">Automations</h1>
        </div>
        <p className="text-secondary-foreground">
          Automatically route qualified leads to your tools. No manual copy-paste.
        </p>
      </div>

      <div className="space-y-4">
        {automations.map((auto) => (
          <div key={auto.id} className="bg-secondary/30 border border-secondary rounded-2xl p-6 flex items-start justify-between gap-6">
            <div className="flex-1">
              <div className="font-semibold text-lg mb-1">{auto.name}</div>
              <p className="text-sm text-secondary-foreground mb-3">{auto.description}</p>
              
              {auto.type === 'webhook' && auto.enabled && (
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder="https://hooks.zapier.com/..."
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full text-sm rounded-lg border border-secondary bg-background px-3 py-2 mb-2"
                  />
                  <button
                    onClick={saveWebhook}
                    className="text-xs px-3 py-1.5 rounded bg-primary/10 text-primary hover:bg-primary/20"
                  >
                    Save Webhook URL
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => toggleAutomation(auto.id)}
              className="mt-1"
            >
              {auto.enabled ? (
                <ToggleRight className="h-8 w-8 text-primary" />
              ) : (
                <ToggleLeft className="h-8 w-8 text-secondary-foreground" />
              )}
            </button>
          </div>
        ))}
      </div>

      <div className="mt-8 text-sm text-secondary-foreground bg-secondary/20 border border-secondary rounded-xl p-4">
        Automations are executed by the secure WPM Actions Processor (Edge Function). 
        They run when the AI marks a conversation as "qualified lead".
      </div>
    </div>
  );
}
