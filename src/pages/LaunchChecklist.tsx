import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, ClipboardCheck, ExternalLink, Rocket, ShieldCheck } from 'lucide-react';
import {
  buildLaunchChecklist,
  getNextLaunchAction,
  summarizeLaunchChecklist,
} from '../lib/wpm/launchChecklist';
import { cn } from '../lib/utils';

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

export default function LaunchChecklist() {
  const items = useMemo(() => buildLaunchChecklist(), []);
  const [completedKeys, setCompletedKeys] = useState<string[]>(loadCompletedKeys);
  const summary = summarizeLaunchChecklist(items, completedKeys);
  const nextAction = getNextLaunchAction(items, completedKeys);

  const toggleItem = (key: string) => {
    setCompletedKeys((current) => {
      const next = current.includes(key)
        ? current.filter((completedKey) => completedKey !== key)
        : [...current, key];
      saveCompletedKeys(next);
      return next;
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
                  WPM AI DM Agent launch control
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Launch Checklist</h1>
                  <p className="mt-3 text-secondary-foreground">
                    A setup-person view for getting the Woztell → WPM bridge → OpenAI → Woztell loop ready before adding more features.
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

        <section className="rounded-2xl border border-secondary bg-secondary/20 p-4 md:p-6">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Setup sequence</h2>
              <p className="text-sm text-secondary-foreground">Check off each step as it is verified in the real workspace.</p>
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
