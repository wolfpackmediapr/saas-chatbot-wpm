import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Edit3, Loader2, MessageCircle, PlugZap, Save, ShieldAlert, ShieldCheck } from 'lucide-react';
import {
  listOwnedClientChannels,
  mapChannelRecordToInput,
  saveOwnedClientChannel,
  setOwnedClientChannelActive,
  WpmClientChannelRecord,
} from '../lib/supabase/wpmChannels';
import { getOwnedWpmClient } from '../lib/supabase/wpmClients';
import {
  ChannelProvider,
  ChannelSetupInput,
  ChannelType,
  getChannelCompletion,
  getChannelProviderInstructions,
  getChannelTypeLabel,
  validateChannelInput,
} from '../lib/wpm/channelSetup';

const DEFAULT_CHANNEL: ChannelSetupInput = {
  channel_type: 'instagram',
  provider: 'woztell',
  display_name: '',
  provider_channel_id: '',
  provider_bot_id: '',
  external_page_id: '',
  external_phone_number: '',
  notes: '',
};

const CHANNEL_TYPES: ChannelType[] = ['instagram', 'facebook', 'whatsapp', 'web_chat', 'test'];
const PROVIDERS: ChannelProvider[] = ['woztell', 'meta', 'web'];

function Field({ label, children, error, help }: { label: string; children: React.ReactNode; error?: string; help?: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-secondary-foreground">{label}</span>
      {children}
      {help && <span className="block text-xs text-secondary-foreground">{help}</span>}
      {error && <span className="block text-sm text-red-400">{error}</span>}
    </label>
  );
}

function badgeClass(isActive: boolean): string {
  return isActive ? 'border-primary/30 bg-primary/10 text-primary' : 'border-secondary bg-secondary/60 text-secondary-foreground';
}

export default function ChannelConnections() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [channels, setChannels] = useState<WpmClientChannelRecord[]>([]);
  const [channel, setChannel] = useState<ChannelSetupInput>(DEFAULT_CHANNEL);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validationErrors = useMemo(() => validateChannelInput(channel), [channel]);
  const completion = useMemo(() => getChannelCompletion(channels), [channels]);
  const providerInstructions = useMemo(() => getChannelProviderInstructions(channel.provider ?? 'woztell'), [channel.provider]);

  useEffect(() => {
    let mounted = true;

    async function loadChannels() {
      try {
        setLoading(true);
        const client = await getOwnedWpmClient();

        if (!client) {
          if (mounted) setError('Create your Business Profile before connecting channels.');
          return;
        }

        const existingChannels = await listOwnedClientChannels(client.id);
        if (mounted) {
          setClientId(client.id);
          setChannels(existingChannels);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load channel mappings.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadChannels();

    return () => {
      mounted = false;
    };
  }, []);

  const updateField = (field: keyof ChannelSetupInput, value: string) => {
    setChannel((current) => ({ ...current, [field]: value }));
    setSuccess(null);
  };

  const handleChannelTypeChange = (channelType: ChannelType) => {
    setChannel((current) => ({
      ...current,
      channel_type: channelType,
      provider: channelType === 'test' || channelType === 'web_chat' ? 'web' : current.provider === 'web' ? 'woztell' : current.provider,
    }));
    setSuccess(null);
  };

  const reloadChannels = async (ownedClientId: string) => {
    const nextChannels = await listOwnedClientChannels(ownedClientId);
    setChannels(nextChannels);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!clientId) {
      setError('Create your Business Profile before saving channel setup.');
      return;
    }

    const errors = validateChannelInput(channel);
    if (Object.keys(errors).length > 0) {
      setError('Fix the highlighted fields before saving.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await saveOwnedClientChannel(channel, clientId);
      await reloadChannels(clientId);
      setChannel(DEFAULT_CHANNEL);
      setSuccess('Channel mapping saved. Secrets remain server-side only.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save channel mapping.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (record: WpmClientChannelRecord) => {
    setChannel({ ...DEFAULT_CHANNEL, ...mapChannelRecordToInput(record) });
    setSuccess(null);
  };

  const handleToggleActive = async (record: WpmClientChannelRecord) => {
    if (!clientId) return;

    try {
      setError(null);
      await setOwnedClientChannelActive(record.id, clientId, !record.is_active);
      await reloadChannels(clientId);
      setSuccess(record.is_active ? 'Channel paused.' : 'Channel activated.');
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Failed to update channel status.');
    }
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
                  <PlugZap className="h-4 w-4" />
                  Step 4 · Channel connections
                </div>
                <div>
                  <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Channel Connections</h1>
                  <p className="mt-3 text-secondary-foreground">
                    Map Instagram, Facebook, WhatsApp, web chat, or test channels to the client. Store routing IDs only; tokens stay in the WPM Bridge backend.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-secondary bg-background/80 p-5 shadow-lg backdrop-blur">
                <div className="text-sm text-secondary-foreground">Channel readiness</div>
                <div className="mt-1 text-4xl font-bold">{completion.percentComplete}%</div>
                <div className="mt-2 h-2 w-56 overflow-hidden rounded-full bg-secondary">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all" style={{ width: `${completion.percentComplete}%` }} />
                </div>
                <div className="mt-3 text-sm text-secondary-foreground">
                  {completion.activeCount} active · {completion.liveCount} live · {completion.testCount} test
                </div>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
            <ShieldAlert className="mt-0.5 h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4 text-primary">
            <CheckCircle2 className="mt-0.5 h-5 w-5" />
            <span>{success}</span>
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-secondary bg-secondary/20 p-5 md:p-6">
            {loading ? (
              <div className="flex items-center gap-3 text-secondary-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading channel mappings...
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">{channel.id ? 'Edit channel mapping' : 'Add channel mapping'}</h2>
                  {channel.id && (
                    <button type="button" onClick={() => setChannel(DEFAULT_CHANNEL)} className="rounded-lg border border-secondary px-3 py-2 text-sm hover:bg-secondary">
                      New channel
                    </button>
                  )}
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Channel type" error={validationErrors.channel_type}>
                    <select value={channel.channel_type} onChange={(event) => handleChannelTypeChange(event.target.value as ChannelType)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary">
                      {CHANNEL_TYPES.map((type) => (
                        <option key={type} value={type}>{getChannelTypeLabel(type)}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Provider">
                    <select value={channel.provider} onChange={(event) => updateField('provider', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary">
                      {PROVIDERS.map((provider) => (
                        <option key={provider} value={provider}>{getChannelProviderInstructions(provider).label}</option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Display name" error={validationErrors.display_name}>
                    <input value={channel.display_name} onChange={(event) => updateField('display_name', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="Instagram DMs / WhatsApp Sales" />
                  </Field>

                  <Field label="Woztell channel ID" error={validationErrors.provider_channel_id} help="Safe mapping ID. Do not paste BotAPI tokens.">
                    <input value={channel.provider_channel_id} onChange={(event) => updateField('provider_channel_id', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="wzt-channel-id" />
                  </Field>

                  <Field label="Woztell bot ID">
                    <input value={channel.provider_bot_id} onChange={(event) => updateField('provider_bot_id', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="provider bot id" />
                  </Field>

                  <Field label="Meta page ID">
                    <input value={channel.external_page_id} onChange={(event) => updateField('external_page_id', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="Facebook / Instagram page ID" />
                  </Field>

                  <Field label="WhatsApp phone number">
                    <input value={channel.external_phone_number} onChange={(event) => updateField('external_phone_number', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="Business WhatsApp number" />
                  </Field>

                  <Field label="Notes">
                    <input value={channel.notes} onChange={(event) => updateField('notes', event.target.value)} className="w-full rounded-lg border border-secondary bg-background px-3 py-2 outline-none focus:border-primary" placeholder="Setup status, inbox owner, pending step" />
                  </Field>
                </div>

                <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5" />
                    <div>
                      <div className="font-semibold">Secret-safe setup</div>
                      <p className="mt-1">{providerInstructions.secretWarning}</p>
                    </div>
                  </div>
                </div>

                <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {channel.id ? 'Update channel' : 'Save channel'}
                </button>
              </>
            )}
          </form>

          <aside className="space-y-5">
            <div className="rounded-2xl border border-secondary bg-secondary/20 p-5">
              <h2 className="font-semibold">Provider guide</h2>
              <div className="mt-3 text-sm text-secondary-foreground">
                <p className="font-medium text-foreground">{providerInstructions.label}</p>
                <p className="mt-2">{providerInstructions.summary}</p>
                <p className="mt-4 font-medium text-foreground">Browser-safe fields</p>
                <ul className="mt-2 space-y-1">
                  {providerInstructions.safeFields.map((field) => <li key={field}>• {field}</li>)}
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border border-secondary bg-secondary/20 p-5">
              <h2 className="font-semibold">Launch blockers</h2>
              {completion.blockers.length === 0 ? (
                <p className="mt-3 text-sm text-primary">At least one active channel is mapped.</p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm text-secondary-foreground">
                  {completion.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}
                </ul>
              )}
            </div>
          </aside>
        </section>

        <section className="rounded-2xl border border-secondary bg-secondary/20 p-5 md:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Saved channels</h2>
            <span className="text-sm text-secondary-foreground">{channels.length} mapped</span>
          </div>

          {channels.length === 0 ? (
            <p className="mt-4 text-secondary-foreground">No channels yet. Add a test channel or a live Woztell/Meta mapping above.</p>
          ) : (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {channels.map((record) => (
                <article key={record.id} className="rounded-xl border border-secondary bg-background/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-secondary-foreground">
                        <MessageCircle className="h-4 w-4" />
                        {getChannelTypeLabel(record.channel_type)} · {record.provider}
                      </div>
                      <h3 className="mt-1 font-semibold">{record.display_name}</h3>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-xs ${badgeClass(record.is_active)}`}>{record.is_active ? 'active' : 'paused'}</span>
                  </div>

                  <div className="mt-3 space-y-1 text-sm text-secondary-foreground">
                    {record.provider_channel_id && <p>Channel ID: {record.provider_channel_id}</p>}
                    {record.external_page_id && <p>Page ID: {record.external_page_id}</p>}
                    {record.external_phone_number && <p>Phone: {record.external_phone_number}</p>}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button type="button" onClick={() => handleEdit(record)} className="inline-flex items-center gap-2 rounded-lg border border-secondary px-3 py-2 text-sm hover:bg-secondary">
                      <Edit3 className="h-4 w-4" />
                      Edit
                    </button>
                    <button type="button" onClick={() => handleToggleActive(record)} className="rounded-lg border border-secondary px-3 py-2 text-sm hover:bg-secondary">
                      {record.is_active ? 'Pause' : 'Activate'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
