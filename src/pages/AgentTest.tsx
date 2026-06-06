import React, { FormEvent, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Play, ShieldAlert } from 'lucide-react';
import { getOwnedWpmClient } from '../lib/supabase/wpmClients';
import { saveTestConversation, listRecentTestConversations, TestConversationRecord } from '../lib/supabase/wpmTestConversations';
import {
  simulateAgentReply,
  validateTestInput,
  TestInput,
  SimulatorChannelType,
} from '../lib/wpm/agentSimulator';
import { supabase } from '../lib/supabase/client';

const CHANNELS: SimulatorChannelType[] = ['whatsapp', 'instagram', 'facebook', 'web_chat'];

const DEFAULT_TEST: TestInput = {
  channel_type: 'whatsapp',
  message: 'Hi, do you do teeth whitening? My name is Maria.',
};

export default function AgentTest() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('Your Business');
  const [agentName, setAgentName] = useState('Luna');

  const [testInput, setTestInput] = useState<TestInput>(DEFAULT_TEST);
  const [result, setResult] = useState<ReturnType<typeof simulateAgentReply> | null>(null);
  const [recentTests, setRecentTests] = useState<TestConversationRecord[]>([]);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [routing, setRouting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validation = validateTestInput(testInput);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const client = await getOwnedWpmClient();
        if (!client) {
          setError('Complete Business Profile first to run test conversations.');
          return;
        }
        if (mounted) {
          setClientId(client.id);
          setBusinessName(client.business_name || 'Your Business');
          const tests = await listRecentTestConversations(client.id);
          setRecentTests(tests);
        }
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Failed to load profile.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, []);

  const update = (field: keyof TestInput, value: string) => {
    setTestInput(prev => ({ ...prev, [field]: value }));
    setResult(null);
    setSuccess(null);
  };

  const handleRunTest = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientId) return;

    const errors = validateTestInput(testInput);
    if (Object.keys(errors).length > 0) {
      setError('Please fix the input fields.');
      return;
    }

    setRunning(true);
    setError(null);
    setSuccess(null);

    try {
      const simulation = simulateAgentReply({
        message: testInput.message,
        business_name: businessName,
        agent_name: agentName,
        knowledge_snippets: [],
      });

      setResult(simulation);

      await saveTestConversation(testInput, clientId, simulation);

      const updated = await listRecentTestConversations(clientId);
      setRecentTests(updated);

      setSuccess('Test conversation saved. Lead signals and automation trigger logged for review.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Test run failed.');
    } finally {
      setRunning(false);
    }
  };

  const handleQueueDemoLead = async () => {
    if (!clientId || !result || !result.should_trigger_automation) return;

    setRouting(true);
    setError(null);
    setSuccess(null);

    try {
      const lead = result.extracted_lead || result.lead_signals;

      // Insert a demo tool execution to simulate automation routing
      const { error: insertError } = await (supabase as any)
        .from('wpm_tool_executions')
        .insert({
          client_id: clientId,
          conversation_id: null, // would be the test conv id in real
          integration_id: null, // demo
          tool_name: 'demo.automation',
          input_payload: {
            lead: lead,
            integration_type: 'zapier_webhook',
            field_map: { fields: Object.keys(lead) },
            note: 'Demo from Test Agent simulator',
          },
          status: 'pending',
        });

      if (insertError) throw insertError;

      setSuccess('Demo lead queued for automations. Run the actions-processor to see it processed (or check DB).');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to queue demo lead.');
    } finally {
      setRouting(false);
    }
  };

  return (
    <div className="min-h-full bg-background p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="rounded-2xl border border-secondary bg-secondary/30 p-6 md:p-8">
          <div className="flex items-center gap-3">
            <Play className="h-7 w-7 text-primary" />
            <div>
              <div className="text-sm text-primary">Step 6 · Pre-Launch Validation</div>
              <h1 className="text-3xl font-bold tracking-tight">Test Agent (Simulator)</h1>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-secondary-foreground">
            Send a sample customer message. The simulator shows the exact reply style, lead extraction, and whether an automation would fire — without touching live channels or real AI credits yet.
          </p>
        </div>

        {error && (
          <div className="flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            <ShieldAlert className="mt-0.5 h-5 w-5" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-primary">
            <CheckCircle2 className="mt-0.5 h-5 w-5" />
            <span>{success}</span>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Test Form */}
          <form onSubmit={handleRunTest} className="space-y-5 rounded-2xl border border-secondary bg-secondary/20 p-6">
            <h2 className="font-semibold">Run a test message</h2>

            {loading ? (
              <div className="flex items-center gap-2 text-secondary-foreground"><Loader2 className="animate-spin h-4 w-4" /> Loading...</div>
            ) : (
              <>
                <label className="block">
                  <span className="text-sm font-medium">Test Channel</span>
                  <select
                    value={testInput.channel_type}
                    onChange={(e) => update('channel_type', e.target.value)}
                    className="mt-1 w-full rounded-lg border border-secondary bg-background px-3 py-2"
                  >
                    {CHANNELS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-medium">Customer message</span>
                  <textarea
                    value={testInput.message}
                    onChange={(e) => update('message', e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-secondary bg-background p-3 font-mono text-sm"
                    placeholder="Hi, do you do teeth whitening?"
                  />
                </label>

                <button
                  type="submit"
                  disabled={running || Object.keys(validation).length > 0}
                  className="w-full rounded-lg bg-primary py-3 font-medium text-primary-foreground flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run simulated test
                </button>

                <p className="text-xs text-secondary-foreground">
                  This is a preview. Real AI + your exact instructions will be used in the live WPM Bridge.
                </p>
              </>
            )}
          </form>

          {/* Result */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-secondary bg-secondary/20 p-6">
              <h2 className="font-semibold mb-4">Simulated Reply</h2>

              {!result ? (
                <p className="text-secondary-foreground text-sm">Run a test above to see the reply, extracted lead, and automation decision.</p>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg bg-background p-4 border border-secondary font-medium whitespace-pre-wrap">
                    {result.reply}
                  </div>

                  <div>
                    <div className="text-xs uppercase tracking-widest text-secondary-foreground mb-1">Lead signals detected</div>
                    <pre className="text-sm bg-background p-3 rounded border border-secondary overflow-auto">{JSON.stringify(result.lead_signals, null, 2)}</pre>
                  </div>

                  <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ${result.should_trigger_automation ? 'bg-green-500/10 text-green-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                    {result.should_trigger_automation ? '✓ Would trigger automation' : 'No automation trigger'}
                  </div>

                  {result.should_trigger_automation && clientId && (
                    <div className="space-y-2">
                      <button
                        onClick={handleQueueDemoLead}
                        disabled={routing}
                        className="w-full mt-2 rounded-lg border border-primary bg-primary/10 py-2 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        {routing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Queue demo lead for automations (test routing)
                      </button>
                      <p className="text-xs text-secondary-foreground text-center">
                        After queuing, go to <strong>Launch Checklist</strong> → Automation Processing to see it in the pending list and run the processor.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent tests */}
        <div className="rounded-2xl border border-secondary bg-secondary/20 p-6">
          <h2 className="font-semibold mb-4">Recent test runs</h2>
          {recentTests.length === 0 ? (
            <p className="text-sm text-secondary-foreground">No tests run yet for this client.</p>
          ) : (
            <div className="space-y-3">
              {recentTests.map((t) => (
                <div key={t.id} className="rounded-lg border border-secondary bg-background/60 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="font-medium">{t.source_channel}</span>
                    <span className="text-secondary-foreground">{new Date(t.created_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-2 text-secondary-foreground">“{t.initial_message}”</div>
                  {t.agent_reply && <div className="mt-2 text-primary">Reply: {t.agent_reply}</div>}
                  {t.lead_extracted && <div className="mt-1 text-xs">Lead: {JSON.stringify(t.lead_extracted)}</div>}
                  {t.automation_triggered && <div className="mt-1 text-green-400 text-xs">Automation would have fired</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
