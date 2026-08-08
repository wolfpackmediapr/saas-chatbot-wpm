import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Rocket,
  ShieldCheck,
  RefreshCw,
  Play,
  ArrowRight,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  buildLaunchChecklist,
  getNextLaunchAction,
  summarizeLaunchChecklist,
  EMPTY_EVIDENCE,
  type LaunchEvidence,
} from '../lib/wpm/launchChecklist';
import { fetchLaunchEvidence } from '../lib/supabase/launchStatus';
import { getOwnedWpmClient } from '../lib/supabase/wpmClients';
import { supabase } from '../lib/supabase/client';
import { cn } from '../lib/utils';

interface ToolExecution {
  id: string;
  status: string;
  tool_name?: string;
  created_at: string;
}

export default function LaunchChecklist() {
  const navigate = useNavigate();
  const items = useMemo(() => buildLaunchChecklist(), []);

  const [evidence, setEvidence] = useState<LaunchEvidence>(EMPTY_EVIDENCE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const [pendingAutomations, setPendingAutomations] = useState(0);
  const [recentExecutions, setRecentExecutions] = useState<ToolExecution[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [triggerNotice, setTriggerNotice] = useState<string | null>(null);

  const summary = summarizeLaunchChecklist(items, evidence);
  const nextAction = getNextLaunchAction(items, evidence);

  const loadAutomations = useCallback(async () => {
    if (!supabase) return;
    try {
      const client = await getOwnedWpmClient();
      if (!client) return;

      const [pending, recent] = await Promise.all([
        supabase
          .from('wpm_tool_executions')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', client.id)
          .eq('status', 'pending'),
        supabase
          .from('wpm_tool_executions')
          .select('id, status, tool_name, created_at')
          .eq('client_id', client.id)
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      setPendingAutomations(pending.count ?? 0);
      setRecentExecutions((recent.data ?? []) as ToolExecution[]);
    } catch (err) {
      console.error('[launch] automation status failed:', err);
    }
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const next = await fetchLaunchEvidence();
      setEvidence(next);
      setCheckedAt(new Date());
      await loadAutomations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check your setup. Try again.');
    }
  }, [loadAutomations]);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleProcessNow = async () => {
    if (!supabase) return;
    setTriggering(true);
    setTriggerNotice(null);
    try {
      const { error: fnError } = await supabase.functions.invoke('wpm-trigger-automations', {
        method: 'POST',
      });
      if (fnError) throw fnError;
      setTriggerNotice('Queued automations sent for delivery.');
      await loadAutomations();
    } catch (err) {
      setTriggerNotice(
        err instanceof Error ? `Could not run delivery: ${err.message}` : 'Could not run delivery.',
      );
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="min-h-full bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header + progress */}
        <section className="overflow-hidden rounded-2xl border border-secondary bg-secondary/30">
          <div className="relative p-6 md:p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-transparent to-accent/20" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm text-primary">
                  <Rocket className="h-4 w-4" />
                  Go live
                </div>
                <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Launch Checklist</h1>
                <p className="text-secondary-foreground">
                  Every step below is checked against your account — nothing here is ticked by hand.
                </p>
              </div>

              <div className="rounded-xl border border-secondary bg-background/80 p-5 shadow-lg backdrop-blur">
                <div className="text-sm text-secondary-foreground">Progress</div>
                <div className="mt-1 text-4xl font-bold tabular-nums">{summary.percentComplete}%</div>
                <div className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
                    style={{ width: `${summary.percentComplete}%` }}
                  />
                </div>
                <div className="mt-3 text-sm text-secondary-foreground">
                  {summary.completed} of {summary.total} steps done
                </div>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Status + next action */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-secondary bg-secondary/30 p-5">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
              <span className="font-semibold">Status</span>
            </div>
            <p className="mt-3 text-xl font-bold">
              {loading ? 'Checking…' : summary.launchReady ? 'Ready to go live' : 'Not ready yet'}
            </p>
            <p className="mt-2 text-sm text-secondary-foreground">
              {summary.requiredBlockers.length === 0
                ? 'All required steps are done.'
                : `${summary.requiredBlockers.length} required step${
                    summary.requiredBlockers.length === 1 ? '' : 's'
                  } left.`}
            </p>
          </div>

          <div className="rounded-xl border border-secondary bg-secondary/30 p-5 md:col-span-2">
            <div className="flex items-center gap-2 text-primary">
              <ClipboardCheck className="h-5 w-5" />
              <span className="font-semibold">Do this next</span>
            </div>
            {nextAction ? (
              <>
                <p className="mt-3 text-xl font-bold">{nextAction.title}</p>
                <p className="mt-1 text-sm text-secondary-foreground">{nextAction.description}</p>
                {nextAction.route && (
                  <button
                    onClick={() => navigate(nextAction.route!)}
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-hover"
                  >
                    {nextAction.routeLabel}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
              </>
            ) : (
              <p className="mt-3 text-xl font-bold">Everything is set up. You're live.</p>
            )}
          </div>
        </section>

        {/* Steps */}
        <section className="rounded-2xl border border-secondary bg-secondary/20 p-4 md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Setup steps</h2>
              <p className="text-sm text-secondary-foreground">
                {checkedAt
                  ? `Checked at ${checkedAt.toLocaleTimeString()}`
                  : 'Reading your account…'}
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-lg border border-secondary bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
              {refreshing ? 'Checking…' : 'Re-check'}
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => {
              const complete = item.isComplete(evidence);
              return (
                <div
                  key={item.key}
                  className={cn(
                    'rounded-xl border p-4 transition-colors',
                    complete ? 'border-primary/40 bg-primary/10' : 'border-secondary bg-background/60',
                  )}
                >
                  <div className="flex gap-4">
                    <div className="pt-0.5">
                      {loading ? (
                        <Loader2 className="h-6 w-6 animate-spin text-secondary-foreground" />
                      ) : complete ? (
                        <CheckCircle2 className="h-6 w-6 text-primary" />
                      ) : (
                        <Circle className="h-6 w-6 text-secondary-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-secondary-foreground">Step {index + 1}</span>
                        {item.required ? (
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
                            Required
                          </span>
                        ) : (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                            Optional
                          </span>
                        )}
                      </div>
                      <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
                      <p className="mt-1 text-sm text-secondary-foreground">{item.description}</p>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <p
                          className={cn(
                            'text-sm font-medium',
                            complete ? 'text-primary' : 'text-secondary-foreground',
                          )}
                        >
                          {loading ? 'Checking…' : item.detail(evidence)}
                        </p>
                        {!complete && item.route && (
                          <button
                            onClick={() => navigate(item.route!)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                          >
                            {item.routeLabel}
                            <ArrowRight className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Lead delivery */}
        <section className="rounded-2xl border border-secondary bg-secondary/20 p-4 md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Lead delivery</h2>
              <p className="text-sm text-secondary-foreground">
                Qualified leads waiting to be sent to your integrations.
              </p>
            </div>
            <button
              onClick={handleProcessNow}
              disabled={triggering}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {triggering ? 'Sending…' : 'Send now'}
            </button>
          </div>

          {triggerNotice && (
            <div className="mb-4 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
              {triggerNotice}
            </div>
          )}

          <div className="rounded-lg border border-secondary bg-background p-4">
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold tabular-nums text-primary">{pendingAutomations}</div>
              <div>
                <div className="font-semibold">Waiting to send</div>
                <div className="text-sm text-secondary-foreground">
                  {pendingAutomations === 0
                    ? 'Nothing queued.'
                    : 'These deliver automatically; use Send now to push them immediately.'}
                </div>
              </div>
            </div>
          </div>

          {recentExecutions.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-sm font-medium text-secondary-foreground">Recent deliveries</div>
              <div className="space-y-2">
                {recentExecutions.map((execution) => (
                  <div
                    key={execution.id}
                    className="flex flex-col gap-2 rounded-lg border border-secondary bg-background/70 p-3 text-sm md:flex-row md:items-center md:justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{execution.tool_name || 'automation'}</span>
                      <span
                        className={cn(
                          'rounded px-2 py-0.5 text-xs',
                          execution.status === 'completed'
                            ? 'bg-green-500/20 text-green-400'
                            : execution.status === 'pending'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-red-500/20 text-red-400',
                        )}
                      >
                        {execution.status}
                      </span>
                    </div>
                    <div className="text-xs text-secondary-foreground">
                      {new Date(execution.created_at).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
