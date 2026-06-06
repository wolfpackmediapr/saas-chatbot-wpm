import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, ClipboardCheck, ExternalLink, Rocket, ShieldCheck, RefreshCw, Play, List } from 'lucide-react';
import {
  buildLaunchChecklist,
  getNextLaunchAction,
  summarizeLaunchChecklist,
} from '../lib/wpm/launchChecklist';
import { cn } from '../lib/utils';
import { getOwnedWpmClient } from '../lib/supabase/wpmClients';
import { supabase } from '../lib/supabase/client';

const STORAGE_KEY = 'wpm-launch-checklist-completed';

function loadCompletedKeys(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

function saveCompletedKeys(keys: string[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

interface AutomationStatus {
  pending: number;
  recent: Array<{
    id: string;
    status: string;
    tool_name?: string;
    created_at: string;
    output_payload?: any;
  }>;
  error?: string;
}

export default function LaunchChecklist() {
  const items = useMemo(() => buildLaunchChecklist(), []);
  const [completedKeys, setCompletedKeys] = useState<string[]>(loadCompletedKeys);
  const summary = summarizeLaunchChecklist(items, completedKeys);
  const nextAction = getNextLaunchAction(items, completedKeys);

  const [readiness, setReadiness] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  const [automationStatus, setAutomationStatus] = useState<AutomationStatus | null>(null);
  const [loadingAutomations, setLoadingAutomations] = useState(false);

  const [triggerResult, setTriggerResult] = useState<any>(null);
  const [triggering, setTriggering] = useState(false);

  const toggleItem = (key: string) => {
    setCompletedKeys((current) => {
      const next = current.includes(key)
        ? current.filter((completedKey) => completedKey !== key)
        : [...current, key];
      saveCompletedKeys(next);
      return next;
    });
  };

  const runReadinessCheck = async () => {
    setChecking(true);
    try {
      const client = await getOwnedWpmClient();
      if (!client) {
        setReadiness({ error: 'No client profile found. Complete Business Profile first.' });
        return;
      }

      // Lightweight client-side readiness using existing tables (no secret needed)
      const [channels, profiles, instructions, knowledge, integrations] = await Promise.all([
        supabase.from('wpm_client_channels').select('id', { count: 'exact', head: true }).eq('client_id', client.id).eq('is_active', true),
        supabase.from('wpm_bot_profiles').select('id', { count: 'exact', head: true }).eq('client_id', client.id).eq('is_active', true),
        supabase.from('wpm_bot_instructions').select('id', { count: 'exact', head: true }).eq('client_id', client.id).eq('is_active', true),
        supabase.from('wpm_knowledge_sources').select('id', { count: 'exact', head: true }).eq('client_id', client.id).eq('status', 'ready'),
        supabase.from('wpm_integrations').select('id', { count: 'exact', head: true }).eq('client_id', client.id).eq('is_active', true),
      ]);

      const report = {
        client: client.business_name || client.id,
        channels: channels.count ?? 0,
        botProfiles: profiles.count ?? 0,
        instructions: instructions.count ?? 0,
        readyKnowledge: knowledge.count ?? 0,
        automations: integrations.count ?? 0,
        timestamp: new Date().toISOString(),
      };

      setReadiness(report);
    } catch (e) {
      setReadiness({ error: e instanceof Error ? e.message : 'Readiness check failed' });
    } finally {
      setChecking(false);
    }
  };

  const loadAutomationStatus = async () => {
    setLoadingAutomations(true);
    try {
      const client = await getOwnedWpmClient();
      if (!client) {
        setAutomationStatus({ pending: 0, recent: [], error: 'No client profile found. Complete Business Profile first.' });
        return;
      }

      // Pending count
      const { count: pendingCount } = await supabase
        .from('wpm_tool_executions')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id)
        .eq('status', 'pending');

      // Recent executions (last 8)
      const { data: recentData } = await supabase
        .from('wpm_tool_executions')
        .select('id, status, tool_name, created_at, output_payload')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(8);

      setAutomationStatus({
        pending: pendingCount ?? 0,
        recent: (recentData ?? []) as any,
      });
    } catch (e) {
      setAutomationStatus({
        pending: 0,
        recent: [],
        error: e instanceof Error ? e.message : 'Failed to load automation status',
      });
    } finally {
      setLoadingAutomations(false);
    }
  };

  const handleProcessNow = async () => {
    setTriggering(true);
    setTriggerResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('wpm-trigger-automations', {
        method: 'POST',
      });
      if (error) throw error;
      setTriggerResult(data);
      // Auto refresh status after processing
      await loadAutomationStatus();
    } catch (e) {
      setTriggerResult({ error: e instanceof Error ? e.message : 'Failed to trigger processor' });
    } finally {
      setTriggering(false);
    }
  };

  const copyProcessorCommand = () => {
    const secret = 'YOUR_WPM_ACTION_PROCESSOR_SECRET_HERE';
    const command = `curl -X POST \\\\
  \"https://upthfjkxbsqtipzoeecd.supabase.co/functions/v1/wpm-actions-processor?secret=${secret}\" \\\\
  -H \"x-action-secret: ${secret}\" \\\\
  -H \"Content-Type: application/json\"`;

    navigator.clipboard.writeText(command).then(() => {
      alert('Curl command copied! Replace YOUR_WPM_ACTION_PROCESSOR_SECRET_HERE with your real secret (set in Supabase Edge Function secrets or your .env).');
    });
  };

  return (
    <div className="min-h-full bg-background p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="overflow-hidden rounded-2xl border border-secondary bg-secondary/30">
          <div className="relative p-6 md:p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/20" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm text-primary">
                  <Rocket className="h-4 w-4" />
                  WPM AI DM Agent self-setup control
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Launch Checklist</h1>
                  <p className="mt-3 text-secondary-foreground">
                    A client-operated launch flow for getting the Woztell → WPM bridge → OpenAI → Woztell loop ready without requiring WPM support.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-secondary bg-background/80 p-5 shadow-lg backdrop-blur">
                <div className="text-sm text-secondary-foreground">Progress</div>
                <div className="mt-1 text-4xl font-bold">{summary.percentComplete}%</div>
                <div className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
                    style={{ width: `${summary.percentComplete}%` }}
                  />
                </div>
                <div className="mt-3 text-sm text-secondary-foreground">
                  {summary.completed} of {summary.total} steps completed
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-secondary bg-secondary/30 p-5">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
              <span className="font-semibold">Launch status</span>
            </div>
            <p className="mt-3 text-2xl font-bold">
              {summary.launchReady ? 'Ready for client launch' : 'Not launch-ready yet'}
            </p>
            <p className="mt-2 text-sm text-secondary-foreground">
              {summary.requiredBlockers.length} required blocker{summary.requiredBlockers.length === 1 ? '' : 's'} remaining.
            </p>
          </div>

          <div className="rounded-xl border border-secondary bg-secondary/30 p-5 md:col-span-2">
            <div className="flex items-center gap-2 text-primary">
              <ClipboardCheck className="h-5 w-5" />
              <span className="font-semibold">Next action</span>
            </div>
            {nextAction ? (
              <>
                <p className="mt-3 text-2xl font-bold">{nextAction.title}</p>
                <p className="mt-2 text-sm text-secondary-foreground">{nextAction.action}</p>
              </>
            ) : (
              <p className="mt-3 text-2xl font-bold">All checklist items are complete.</p>
            )}
          </div>
        </section>

        {/* Real Readiness Check */}
        <section className="rounded-2xl border border-secondary bg-secondary/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <RefreshCw className="h-5 w-5" /> System Readiness Check
              </h2>
              <p className="text-sm text-secondary-foreground">Live counts from your Supabase data (no secrets exposed).</p>
            </div>
            <button
              onClick={runReadinessCheck}
              disabled={checking}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {checking ? 'Checking...' : 'Run Check'}
            </button>
          </div>

          {readiness && (
            <div className="mt-4 rounded-lg border border-secondary bg-background p-4 text-sm">
              {readiness.error ? (
                <div className="text-red-400">{readiness.error}</div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>Channels: <span className="font-semibold">{readiness.channels}</span></div>
                  <div>Bot Profiles: <span className="font-semibold">{readiness.botProfiles}</span></div>
                  <div>Instructions: <span className="font-semibold">{readiness.instructions}</span></div>
                  <div>Ready Knowledge: <span className="font-semibold">{readiness.readyKnowledge}</span></div>
                  <div>Automations: <span className="font-semibold">{readiness.automations}</span></div>
                </div>
              )}
              <div className="mt-2 text-xs text-secondary-foreground">
                {readiness.timestamp && `Checked ${new Date(readiness.timestamp).toLocaleTimeString()}`}
              </div>
            </div>
          )}
        </section>

        {/* Automation Delivery Status + Processor Trigger */}
        <section className="rounded-2xl border border-secondary bg-secondary/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Play className="h-5 w-5" /> Automation Processing &amp; Delivery
              </h2>
              <p className="text-sm text-secondary-foreground">
                See queued leads from the Test Agent / live bridge and trigger delivery to Zapier, webhooks, or email.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleProcessNow}
                disabled={triggering || loadingAutomations}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                <Play className="h-4 w-4" />
                {triggering ? 'Processing...' : 'Process Now'}
              </button>
              <button
                onClick={loadAutomationStatus}
                disabled={loadingAutomations}
                className="inline-flex items-center gap-2 rounded-lg border border-secondary bg-background px-4 py-2 text-sm font-medium hover:bg-secondary disabled:opacity-60"
              >
                <List className="h-4 w-4" />
                {loadingAutomations ? 'Loading...' : 'Refresh Status'}
              </button>
            </div>
          </div>

          {triggerResult && (
            <div className="mb-4 rounded-lg border border-primary/40 bg-primary/5 p-4 text-sm">
              {triggerResult.error ? (
                <div className="text-red-400">Error: {triggerResult.error}</div>
              ) : (
                <div>
                  <div className="font-semibold text-primary">Processor triggered successfully</div>
                  <div className="mt-1 text-secondary-foreground">{triggerResult.message}</div>
                  {triggerResult.processorResult && (
                    <pre className="mt-2 text-xs bg-background p-2 rounded overflow-auto">
                      {JSON.stringify(triggerResult.processorResult, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}

          {automationStatus && (
            <div className="space-y-4">
              {automationStatus.error && (
                <div className="text-red-400 text-sm">{automationStatus.error}</div>
              )}

              <div className="rounded-lg border border-secondary bg-background p-4">
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold text-primary">{automationStatus.pending}</div>
                  <div>
                    <div className="font-semibold">Pending automations</div>
                    <div className="text-sm text-secondary-foreground">Executions waiting to be delivered</div>
                  </div>
                </div>
              </div>

              {automationStatus.recent.length > 0 && (
                <div>
                  <div className="text-sm font-medium mb-2 text-secondary-foreground">Recent executions (newest first)</div>
                  <div className="space-y-2">
                    {automationStatus.recent.map((exec) => (
                      <div key={exec.id} className="rounded-lg border border-secondary bg-background/70 p-3 text-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs text-secondary-foreground">{exec.id.slice(0, 8)}…</span>
                          <span className="ml-2 font-medium">{exec.tool_name || 'automation'}</span>
                          <span className={`ml-2 px-2 py-0.5 rounded text-xs ${exec.status === 'completed' ? 'bg-green-500/20 text-green-400' : exec.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                            {exec.status}
                          </span>
                        </div>
                        <div className="text-xs text-secondary-foreground">
                          {new Date(exec.created_at).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Play className="h-5 w-5 text-primary" />
              <span className="font-semibold">Process pending automations</span>
            </div>
            <p className="text-sm text-secondary-foreground mb-4">
              The processor runs queued leads through your configured automations (Zapier, custom webhooks, or email via Resend).
              Use the "Process Now" button above (authenticated for owners) or the curl for manual/cron use.
            </p>

            <div className="bg-background rounded-lg p-4 font-mono text-xs overflow-auto mb-4 border border-secondary">
              curl -X POST \<br />
              &nbsp;&nbsp;"https://upthfjkxbsqtipzoeecd.supabase.co/functions/v1/wpm-actions-processor?secret=YOUR_SECRET" \<br />
              &nbsp;&nbsp;-H "x-action-secret: YOUR_SECRET"
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={copyProcessorCommand}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Copy curl command
              </button>

              <button
                onClick={loadAutomationStatus}
                className="inline-flex items-center gap-2 rounded-lg border border-secondary bg-background px-4 py-2 text-sm font-medium hover:bg-secondary"
              >
                Check status again
              </button>
            </div>

            <div className="mt-4 text-xs text-secondary-foreground space-y-1">
              <div>• "Process Now" button uses your login (no secret needed in browser).</div>
              <div>• Set <code className="bg-secondary px-1">WPM_ACTION_PROCESSOR_SECRET</code> and optionally <code className="bg-secondary px-1">RESEND_API_KEY</code> / <code className="bg-secondary px-1">RESEND_FROM</code> in Supabase secrets for full functionality.</div>
              <div>• Use the <strong>Test Agent</strong> page to queue demo leads and verify end-to-end routing.</div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-secondary bg-secondary/20 p-4 md:p-6">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Setup sequence</h2>
              <p className="text-sm text-secondary-foreground">Complete each self-setup step and let the system expose blockers before launch.</p>
            </div>
            <a
              href="https://upthfjkxbsqtipzoeecd.supabase.co/functions/v1/woztell-webhook"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-secondary px-3 py-2 text-sm text-secondary-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              Webhook URL
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => {
              const completed = completedKeys.includes(item.key);
              return (
                <button
                  key={item.key}
                  onClick={() => toggleItem(item.key)}
                  className={cn(
                    'w-full rounded-xl border p-4 text-left transition-colors',
                    completed
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-secondary bg-background/60 hover:bg-secondary/50',
                  )}
                >
                  <div className="flex gap-4">
                    <div className="pt-1">
                      {completed ? (
                        <CheckCircle2 className="h-6 w-6 text-primary" />
                      ) : (
                        <Circle className="h-6 w-6 text-secondary-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-secondary-foreground">Step {index + 1}</span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs uppercase tracking-wide text-secondary-foreground">
                          {item.stage}
                        </span>
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                          {item.owner}
                        </span>
                        {item.required && (
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">Required</span>
                        )}
                      </div>
                      <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
                      <p className="mt-1 text-sm text-secondary-foreground">{item.description}</p>
                      <p className="mt-3 rounded-lg bg-secondary/60 p-3 text-sm">{item.action}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
