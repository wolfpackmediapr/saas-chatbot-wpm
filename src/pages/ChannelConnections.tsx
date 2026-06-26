import React, { useState, useEffect } from 'react';
import { PlugZap, CheckCircle2, AlertCircle, Instagram, MessageCircle, ExternalLink, Bot, RefreshCw, Wifi } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  getOwnedWpmClient,
  listClientChannels,
  upsertClientChannel,
  deactivateClientChannel,
  listBotProfiles,
  assignChannelBot,
  type WpmBotProfileRecord,
  type WpmClientChannel,
} from '../lib/supabase/wpmClients';
import { supabase } from '../lib/supabase/client';
import MetaAccountSelectModal, { MetaPage } from '../components/MetaAccountSelectModal';
import { loadFacebookSDK } from '../lib/facebook';

interface Channel {
  id: string;
  name: string;
  platform: 'whatsapp' | 'instagram' | 'facebook';
  provider: 'woztell' | 'meta';
  status: 'connected' | 'disconnected' | 'pending';
  phoneOrHandle?: string;
  channelId?: string;
}

const CHANNEL_CONFIG: Record<string, Omit<Channel, 'status'>> = {
  wa: { id: 'wa', name: 'WhatsApp Business', platform: 'whatsapp', provider: 'woztell' },
  ig: { id: 'ig', name: 'Instagram DMs', platform: 'instagram', provider: 'meta' },
  fb: { id: 'fb', name: 'Facebook Messenger', platform: 'facebook', provider: 'meta' },
};

const META_APP_ID = import.meta.env.VITE_META_APP_ID || '928985544799600';
const META_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_metadata',
  'pages_manage_posts', 'pages_manage_engagement', 'instagram_basic',
  'instagram_manage_insights', 'instagram_manage_messages', 'pages_messaging',
  'business_management',
].join(',');

// sessionStorage flag set before FB.login() to detect if the page reloaded
// mid-flow (redirect mode) so we can recover via FB.getLoginStatus().
const FB_LOGIN_PENDING_KEY = 'fb_meta_login_pending';

export default function ChannelConnections() {
  const [channels, setChannels] = useState<Channel[]>(
    Object.values(CHANNEL_CONFIG).map(c => ({ ...c, status: 'disconnected' }))
  );
  const [connecting, setConnecting] = useState<string | null>(null);
  const [pendingChannelId, setPendingChannelId] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [connectedRows, setConnectedRows] = useState<WpmClientChannel[]>([]);
  const [agents, setAgents] = useState<WpmBotProfileRecord[]>([]);
  const [assigning, setAssigning] = useState<string | null>(null);

  const [sdkReady, setSdkReady] = useState(false);
  const [metaPopupPending, setMetaPopupPending] = useState(false);
  const [metaPages, setMetaPages] = useState<MetaPage[] | null>(null);
  const [metaLongLivedToken, setMetaLongLivedToken] = useState<string | null>(null);
  const [metaUserId, setMetaUserId] = useState<string | null>(null);
  const [isSavingMeta, setIsSavingMeta] = useState(false);

  // webhook verification state
  const [verifyingWebhook, setVerifyingWebhook] = useState<string | null>(null);
  const [webhookStatuses, setWebhookStatuses] = useState<Record<string, boolean | null>>({});
  const [justConnected, setJustConnected] = useState<{ name: string; type: string; webhookSubscribed: boolean }[] | null>(null);

  useEffect(() => {
    loadChannels();

    loadFacebookSDK(META_APP_ID).then(() => {
      setSdkReady(true);
      console.log('[Meta] FB SDK initialized, FB.init() called');

      // ── Redirect-mode recovery ────────────────────────────────────────────
      // If FB.login() navigated the main tab instead of opening a popup, the
      // page reloads with either a token in the URL hash OR the FB cookie set.
      // We handle both cases so the Select Accounts modal still appears.

      // Case 1: Implicit token in URL hash (#access_token=...)
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const hashToken = hash.get('access_token');
      if (hashToken) {
        console.log('[Meta] Found access_token in URL hash — redirect mode completed');
        window.history.replaceState(null, '', window.location.pathname);
        sessionStorage.removeItem(FB_LOGIN_PENDING_KEY);
        setMetaPopupPending(true);
        // fetchMetaPages and setMetaUserId are defined later in scope, but this
        // callback runs async after mount, so they're available via closure.
        supabase!.auth.getUser().then(({ data: { user } }) => {
          if (!user) { setMetaPopupPending(false); setError('Session expired. Please refresh.'); return; }
          setMetaUserId(user.id);
          fetchMetaPages({ userToken: hashToken, supabaseUserId: user.id });
        });
        return;
      }

      // Case 2: Page reloaded during redirect flow — check FB cookie via getLoginStatus
      if (sessionStorage.getItem(FB_LOGIN_PENDING_KEY)) {
        sessionStorage.removeItem(FB_LOGIN_PENDING_KEY);
        setMetaPopupPending(true);
        console.log('[Meta] Login was pending — calling FB.getLoginStatus(force=true)');
        window.FB.getLoginStatus((response) => {
          console.log('[Meta] Post-reload FB.getLoginStatus:', JSON.stringify(response));
          if (response.status === 'connected' && response.authResponse) {
            supabase!.auth.getUser().then(({ data: { user } }) => {
              if (!user) { setMetaPopupPending(false); setError('Session expired. Please refresh.'); return; }
              setMetaUserId(user.id);
              fetchMetaPages({ userToken: response.authResponse!.accessToken, supabaseUserId: user.id });
            });
          } else {
            setMetaPopupPending(false);
            console.log('[Meta] No connected session found after reload');
          }
        }, true);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadChannels() {
    setLoading(true);
    setError(null);
    try {
      const client = await getOwnedWpmClient();
      setClientId(client?.id || null);

      const isDemo = !client || client.id.startsWith('demo') || !client.id.includes('-');
      setIsDemoMode(isDemo);

      if (client && !isDemo) {
        const dbChannels = await listClientChannels(client.id);
        setConnectedRows(dbChannels);
        listBotProfiles(client.id).then(setAgents).catch(() => {});
        // seed webhook badge state from stored metadata
        const statuses: Record<string, boolean | null> = {};
        dbChannels.forEach((row: any) => {
          statuses[row.id] = row.metadata?.webhook_subscribed ?? null;
        });
        setWebhookStatuses(statuses);
        setChannels(prev =>
          prev.map(ch => {
            const match = dbChannels.find(
              (db: any) => db.provider === ch.provider && db.channel_type === ch.platform
            );
            if (match) {
              return {
                ...ch,
                status: 'connected' as const,
                phoneOrHandle: match.metadata?.phone_or_handle || match.display_name || match.provider_channel_id,
                channelId: match.provider_channel_id,
              };
            }
            return ch;
          })
        );
      }
    } catch (err: any) {
      console.error('Failed to load channels', err);
      setError('Could not load channels from database.');
      setIsDemoMode(true);
    } finally {
      setLoading(false);
    }
  }

  // ── Woztell manual connect ───────────────────────────────────────────────

  const handleConnect = async (channelId: string) => {
    const inputId = pendingChannelId[channelId]?.trim();
    if (!inputId) {
      alert('Please enter the channel ID before connecting.');
      return;
    }
    setConnecting(channelId);
    try {
      if (clientId && !isDemoMode) {
        const config = CHANNEL_CONFIG[channelId];
        await upsertClientChannel(clientId, {
          provider: config.provider,
          provider_channel_id: inputId,
          channel_type: config.platform,
          metadata: { phone_or_handle: inputId, connected_via: 'self-serve' },
        });
      }
      setChannels(prev =>
        prev.map(ch =>
          ch.id === channelId
            ? { ...ch, status: 'connected', phoneOrHandle: inputId, channelId: inputId }
            : ch
        )
      );
      setPendingChannelId(prev => ({ ...prev, [channelId]: '' }));
    } catch (err: any) {
      console.error('Channel connect failed', err);
      setError('Failed to save channel to database.');
      setChannels(prev =>
        prev.map(ch =>
          ch.id === channelId ? { ...ch, status: 'connected', phoneOrHandle: inputId } : ch
        )
      );
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (channelId: string) => {
    try {
      if (clientId && !isDemoMode) {
        await deactivateClientChannel(clientId, CHANNEL_CONFIG[channelId].platform);
      }
    } catch (err) {
      console.error('Disconnect failed', err);
    }
    setChannels(prev =>
      prev.map(ch =>
        ch.id === channelId
          ? { ...ch, status: 'disconnected', phoneOrHandle: undefined, channelId: undefined }
          : ch
      )
    );
  };

  // ── Meta SDK connect (FB.login) ──────────────────────────────────────────
  // FB.login() must be called synchronously from the click handler to preserve
  // the browser's "user gesture" context — no await before it.
  //
  // A sessionStorage flag is set before the call so that if FB uses redirect
  // mode (navigating the main tab), we detect and recover on the next page load.

  const handleMetaConnect = () => {
    if (!supabase) { setError('Supabase is not configured.'); return; }
    if (!sdkReady || !window.FB) {
      setError('Facebook SDK is still loading — please wait a moment and try again.');
      return;
    }

    setError(null);
    setMetaPopupPending(true);

    // Mark that a login was initiated before the popup/redirect starts
    sessionStorage.setItem(FB_LOGIN_PENDING_KEY, '1');

    console.log('[Meta] Calling FB.login(), sdkReady:', sdkReady);
    window.FB.login((response) => {
      // This callback fires in popup mode. In redirect mode the page reloads
      // and this callback never fires — handled by the useEffect above.
      console.log('[Meta] FB.login callback:', JSON.stringify(response));
      sessionStorage.removeItem(FB_LOGIN_PENDING_KEY);

      if (response.status !== 'connected' || !response.authResponse) {
        setMetaPopupPending(false);
        if (response.status !== 'connected') {
          setError('Facebook login was cancelled or not authorized.');
        }
        return;
      }

      const { accessToken } = response.authResponse;
      supabase!.auth.getUser().then(({ data: { user } }) => {
        if (!user) {
          setMetaPopupPending(false);
          setError('Session expired. Please refresh and try again.');
          return;
        }
        setMetaUserId(user.id);
        fetchMetaPages({ userToken: accessToken, supabaseUserId: user.id });
      });
    }, { scope: META_SCOPES, return_scopes: true, auth_type: 'rerequest' });
  };

  const fetchMetaPages = async (args: { userToken: string; supabaseUserId: string }) => {
    if (!supabase) return;
    setMetaPopupPending(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('meta-fetch-pages', {
        body: { user_token: args.userToken, supabase_user_id: args.supabaseUserId },
      });

      if (fnError || !data?.success) {
        setError(data?.error || fnError?.message || 'Failed to fetch Facebook Pages.');
        return;
      }

      setMetaLongLivedToken(data.long_lived_token);
      setMetaPages(data.pages);
    } catch (err: any) {
      setError(`Failed to fetch pages: ${err.message}`);
    } finally {
      setMetaPopupPending(false);
    }
  };

  const handleSaveMetaSelection = async (selectedPageIds: string[]) => {
    if (!supabase || !metaLongLivedToken || !metaUserId) return;
    setIsSavingMeta(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('meta-oauth-callback', {
        body: {
          long_lived_token: metaLongLivedToken,
          supabase_user_id: metaUserId,
          selected_page_ids: selectedPageIds,
        },
      });

      if (fnError || !data?.success) {
        setError(data?.error || fnError?.message || 'Failed to save channels.');
        return;
      }

      setJustConnected(data.channels || []);
      setMetaPages(null);
      setMetaLongLivedToken(null);
      setMetaUserId(null);
      await loadChannels();
    } catch (err: any) {
      setError(`Failed to connect accounts: ${err.message}`);
    } finally {
      setIsSavingMeta(false);
    }
  };

  const handleCancelMetaModal = () => {
    setMetaPages(null);
    setMetaLongLivedToken(null);
    setMetaUserId(null);
  };

  const handleVerifyWebhook = async (rowId: string) => {
    if (!supabase) return;
    setVerifyingWebhook(rowId);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('meta-verify-webhooks', {
        body: { channel_id: rowId },
      });
      if (fnError || !data?.success) {
        setWebhookStatuses(prev => ({ ...prev, [rowId]: false }));
      } else {
        setWebhookStatuses(prev => ({ ...prev, [rowId]: data.subscribed }));
        // keep connectedRows metadata in sync so the badge persists across re-renders
        setConnectedRows(rows =>
          rows.map(r => r.id === rowId
            ? { ...r, metadata: { ...r.metadata, webhook_subscribed: data.subscribed } }
            : r
          )
        );
      }
    } catch {
      setWebhookStatuses(prev => ({ ...prev, [rowId]: false }));
    } finally {
      setVerifyingWebhook(null);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 max-w-4xl flex items-center justify-center min-h-[300px]">
        <div className="text-secondary-foreground">Loading channel connections...</div>
      </div>
    );
  }

  const woztellChannels = channels.filter(c => c.provider === 'woztell');
  const metaChannels = channels.filter(c => c.provider === 'meta');
  const anyMetaConnected = metaChannels.some(c => c.status === 'connected');
  const allMetaConnected = metaChannels.every(c => c.status === 'connected');

  return (
    <div className="p-6 max-w-4xl">
      {metaPages && (
        <MetaAccountSelectModal
          pages={metaPages}
          isSaving={isSavingMeta}
          onConnect={handleSaveMetaSelection}
          onCancel={handleCancelMetaModal}
        />
      )}

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <PlugZap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-semibold">Channel Connections</h1>
        </div>
        <p className="text-secondary-foreground">
          Connect your messaging channels. <span className="font-medium">WhatsApp</span> uses
          Woztell. <span className="font-medium">Instagram &amp; Facebook Messenger</span> connect
          directly via Meta.
        </p>
        {isDemoMode && (
          <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4" />
            Demo mode — connections saved locally. Enter real channel IDs to persist.
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      {justConnected && justConnected.length > 0 && (
        <div className="mb-4 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-emerald-400 font-medium text-sm mb-1">Channels connected successfully</p>
                <div className="space-y-1">
                  {justConnected.map((ch, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-secondary-foreground">
                      <span className="capitalize">{ch.type === 'instagram' ? 'Instagram' : 'Facebook Messenger'}:</span>
                      <span className="font-medium text-foreground">{ch.name}</span>
                      {ch.webhookSubscribed ? (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <Wifi className="h-3.5 w-3.5" /> Webhooks subscribed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-400">
                          <AlertCircle className="h-3.5 w-3.5" /> Webhook subscription failed — use Verify below
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={() => setJustConnected(null)}
              className="text-secondary-foreground hover:text-foreground text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Woztell channels */}
        {woztellChannels.map((channel) => (
          <div key={channel.id} className="bg-secondary/30 border border-secondary rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <PlugZap className="h-6 w-6 text-green-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-lg">{channel.name}</div>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400">
                      Woztell
                    </span>
                  </div>
                  <div className="text-sm text-secondary-foreground">
                    {channel.status === 'connected'
                      ? `Connected as ${channel.phoneOrHandle || channel.channelId}`
                      : 'Not connected'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {channel.status === 'connected' ? (
                  <>
                    <div className="flex items-center gap-1.5 text-emerald-400 text-sm">
                      <CheckCircle2 className="h-4 w-4" /> Connected
                    </div>
                    <button
                      onClick={() => handleDisconnect(channel.id)}
                      className="px-4 py-2 text-sm rounded-lg border border-secondary hover:bg-secondary"
                    >
                      Disconnect
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Woztell Channel ID"
                      value={pendingChannelId[channel.id] || ''}
                      onChange={e => setPendingChannelId(prev => ({ ...prev, [channel.id]: e.target.value }))}
                      className="w-56 rounded-lg border border-secondary bg-background px-3 py-2 text-sm"
                    />
                    <button
                      onClick={() => handleConnect(channel.id)}
                      disabled={connecting === channel.id}
                      className={cn(
                        'px-5 py-2.5 rounded-xl text-sm font-medium transition-all',
                        'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60'
                      )}
                    >
                      {connecting === channel.id ? 'Saving...' : 'Connect via Woztell'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Meta channels — single shared connect button */}
        <div className="bg-secondary/30 border border-secondary rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 flex-1">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <MessageCircle className="h-6 w-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <div className="font-semibold text-lg">Facebook &amp; Instagram</div>
                  <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400">
                    Meta Direct
                  </span>
                </div>

                <div className="space-y-1.5 mt-3">
                  {metaChannels.map(ch => {
                    const Icon = ch.platform === 'instagram' ? Instagram : MessageCircle;
                    const color = ch.platform === 'instagram' ? 'text-pink-400' : 'text-blue-400';
                    const dbRow = connectedRows.find(r => r.provider_channel_id === ch.channelId);
                    const webhookStatus = dbRow ? webhookStatuses[dbRow.id] : null;
                    return (
                      <div key={ch.id} className="flex items-center gap-2 text-sm flex-wrap">
                        <Icon className={cn('h-4 w-4', color)} />
                        <span className="text-secondary-foreground">{ch.name}:</span>
                        {ch.status === 'connected' ? (
                          <>
                            <span className="text-emerald-400 flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {ch.phoneOrHandle || ch.channelId || 'Connected'}
                            </span>
                            {dbRow && (
                              <>
                                {webhookStatus === true && (
                                  <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                    <Wifi className="h-3 w-3" /> Webhooks Active
                                  </span>
                                )}
                                {webhookStatus === false && (
                                  <span className="flex items-center gap-1 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                                    <AlertCircle className="h-3 w-3" /> Webhook inactive
                                  </span>
                                )}
                                <button
                                  onClick={() => handleVerifyWebhook(dbRow.id)}
                                  disabled={verifyingWebhook === dbRow.id}
                                  className="flex items-center gap-1 text-xs text-secondary-foreground hover:text-foreground border border-secondary rounded-full px-2 py-0.5 transition-colors disabled:opacity-50"
                                >
                                  <RefreshCw className={cn('h-3 w-3', verifyingWebhook === dbRow.id && 'animate-spin')} />
                                  {verifyingWebhook === dbRow.id ? 'Verifying...' : 'Verify Webhooks'}
                                </button>
                              </>
                            )}
                          </>
                        ) : (
                          <span className="text-secondary-foreground/60">Not connected</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 flex-shrink-0">
              {anyMetaConnected && (
                <button
                  onClick={() => metaChannels.forEach(ch => ch.status === 'connected' && handleDisconnect(ch.id))}
                  className="px-4 py-2 text-sm rounded-lg border border-secondary hover:bg-secondary"
                >
                  Disconnect
                </button>
              )}
              <button
                onClick={handleMetaConnect}
                disabled={metaPopupPending || allMetaConnected || !sdkReady}
                className={cn(
                  'px-5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
                  allMetaConnected
                    ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60'
                )}
              >
                {metaPopupPending
                  ? 'Connecting...'
                  : !sdkReady
                  ? 'Loading...'
                  : allMetaConnected
                  ? 'Connected'
                  : anyMetaConnected
                  ? 'Reconnect via Meta'
                  : 'Connect via Meta'}
              </button>
            </div>
          </div>

          {!allMetaConnected && (
            <div className="mt-4 text-xs bg-background/50 border border-secondary rounded-lg p-3 text-secondary-foreground flex items-start gap-2">
              <ExternalLink className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                Clicking "Connect via Meta" opens a Facebook login popup. After authorizing, you'll
                choose which Pages and Instagram accounts to connect.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Agent routing — one row per connected account */}
      {connectedRows.length > 0 && agents.length > 0 && (
        <div className="mt-8 bg-secondary/30 border border-secondary rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-1">
            <Bot className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Agent Routing</h2>
          </div>
          <p className="text-sm text-secondary-foreground mb-4">
            Choose which AI agent answers each connected account. Unassigned accounts use your first
            active agent.
          </p>
          <div className="space-y-2">
            {connectedRows.map((row) => {
              const Icon = row.channel_type === 'instagram' ? Instagram : MessageCircle;
              const color = row.channel_type === 'instagram' ? 'text-pink-400' : 'text-blue-400';
              return (
                <div
                  key={row.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 bg-background/50 border border-secondary rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Icon className={cn('h-4 w-4 flex-shrink-0', color)} />
                    <span className="text-sm truncate">
                      {row.display_name || row.provider_channel_id}
                    </span>
                    <span className="text-xs text-secondary-foreground capitalize">
                      ({row.channel_type})
                    </span>
                  </div>
                  <select
                    value={row.bot_profile_id ?? ''}
                    disabled={assigning === row.id}
                    onChange={async (e) => {
                      const newBotId = e.target.value || null;
                      setAssigning(row.id);
                      const prevRows = connectedRows;
                      setConnectedRows((rows) =>
                        rows.map((r) => (r.id === row.id ? { ...r, bot_profile_id: newBotId } : r))
                      );
                      try {
                        await assignChannelBot(row.id, newBotId);
                      } catch (err) {
                        console.error('Failed to assign agent', err);
                        setConnectedRows(prevRows);
                        setError('Failed to update agent assignment. Please try again.');
                      } finally {
                        setAssigning(null);
                      }
                    }}
                    className="sm:w-64 rounded-lg border border-secondary bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-50"
                  >
                    <option value="">Default ({agents[0]?.name || 'first active agent'})</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name || 'AI Assistant'}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-8 p-4 rounded-xl bg-secondary/20 border border-secondary text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
          <div>
            <strong>Important:</strong> WhatsApp requires a Woztell account and approved WhatsApp
            Business profile. Instagram &amp; Facebook Messenger connect directly via Meta Graph API
            — no Woztell needed. Connected channels power the AI reply bridge and Launch Checklist.
          </div>
        </div>
      </div>
    </div>
  );
}
