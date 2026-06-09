import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PlugZap, CheckCircle2, AlertCircle, Instagram, MessageCircle, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';
import { getOwnedWpmClient, listClientChannels, upsertClientChannel, deactivateClientChannel } from '../lib/supabase/wpmClients';
import { supabase } from '../lib/supabase/client';
import MetaAccountSelectModal, { MetaPage } from '../components/MetaAccountSelectModal';

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

  // Meta popup + account selection state
  const [metaPopupPending, setMetaPopupPending] = useState(false);
  const [metaPages, setMetaPages] = useState<MetaPage[] | null>(null);
  const [metaLongLivedToken, setMetaLongLivedToken] = useState<string | null>(null);
  const [metaUserId, setMetaUserId] = useState<string | null>(null);
  const [isSavingMeta, setIsSavingMeta] = useState(false);
  const messageListenerRef = useRef<((e: MessageEvent) => void) | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    loadChannels();
  }, []);

  // ── Fallback: handle ?meta_code= when popup was blocked / same-tab redirect ─
  useEffect(() => {
    const metaCode = searchParams.get('meta_code');
    const metaError = searchParams.get('meta_error');
    const redirectUri = searchParams.get('redirect_uri') || `${window.location.origin}/meta-callback`;

    if (metaError) {
      setError(`Meta connection failed: ${metaError}`);
      setSearchParams({}, { replace: true });
      return;
    }

    if (metaCode) {
      // Clean the URL immediately so a page refresh doesn't re-process
      setSearchParams({}, { replace: true });
      (async () => {
        if (!supabase) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setError('You must be logged in to connect Meta channels.'); return; }
        setMetaUserId(user.id);
        await fetchMetaPages({ code: metaCode, redirectUri, supabaseUserId: user.id });
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (messageListenerRef.current) {
        window.removeEventListener('message', messageListenerRef.current);
      }
    };
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

  // ── Meta popup OAuth (direct Facebook dialog) ────────────────────────────
  //
  // The FB OAuth URL requires no async data — all params are static or derived
  // from window.location (synchronous). We pass the real URL directly to
  // window.open() so the main tab is NEVER navigated or blanked.
  //
  // User ID is fetched inside the message listener (after the code arrives),
  // which is fine because that await is not on the hot path of the click handler.

  const META_APP_ID = import.meta.env.VITE_META_APP_ID || '928985544799600';
  const META_SCOPES = 'pages_show_list,instagram_basic,instagram_manage_messages,pages_messaging,pages_read_engagement';

  const handleMetaConnect = () => {
    if (!supabase) { setError('Supabase is not configured.'); return; }
    setError(null);
    setMetaPopupPending(true);

    const redirectUri = `${window.location.origin}/meta-callback`;

    // Build the complete OAuth URL synchronously — no async needed
    const fbUrl = new URL('https://www.facebook.com/v20.0/dialog/oauth');
    fbUrl.searchParams.set('client_id', META_APP_ID);
    fbUrl.searchParams.set('redirect_uri', redirectUri);
    fbUrl.searchParams.set('scope', META_SCOPES);
    fbUrl.searchParams.set('response_type', 'code');
    fbUrl.searchParams.set('auth_type', 'rerequest');

    const left = Math.round(window.screenX + (window.outerWidth  - 600) / 2);
    const top  = Math.round(window.screenY + (window.outerHeight - 700) / 2);

    // Open popup directly to the FB URL — NEVER use about:blank here
    const popup = window.open(
      fbUrl.toString(),
      'fb-oauth',
      `width=600,height=700,left=${left},top=${top},popup=yes`,
    );

    if (!popup) {
      setMetaPopupPending(false);
      setError('Popup was blocked. Please allow popups for this site and try again.');
      return;
    }

    let pollId:    ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout>  | null = null;

    const cleanup = () => {
      if (pollId)    clearInterval(pollId);
      if (timeoutId) clearTimeout(timeoutId);
      if (messageListenerRef.current) {
        window.removeEventListener('message', messageListenerRef.current);
        messageListenerRef.current = null;
      }
      setMetaPopupPending(false);
    };

    const listener = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data?.type?.startsWith('META_OAUTH_')) return;

      cleanup();

      if (event.data.type === 'META_OAUTH_ERROR') {
        setError(`Meta connection failed: ${event.data.error}`);
        return;
      }

      if (event.data.type === 'META_OAUTH_CODE') {
        // Get user ID at the point we actually need it
        const { data: { user } } = await supabase!.auth.getUser();
        if (!user) { setError('Session expired. Please refresh and try again.'); return; }
        setMetaUserId(user.id);
        await fetchMetaPages({
          code: event.data.code,
          redirectUri: event.data.redirect_uri || redirectUri,
          supabaseUserId: user.id,
        });
      }
    };

    messageListenerRef.current = listener;
    window.addEventListener('message', listener);

    // Detect popup closed by user before completing
    pollId = setInterval(() => {
      if (popup.closed) cleanup();
    }, 500);

    // Safety timeout: 3 minutes
    timeoutId = setTimeout(() => {
      cleanup();
      if (!popup.closed) popup.close();
    }, 180_000);
  };

  const fetchMetaPages = async (
    args: { code: string; redirectUri: string; supabaseUserId: string }
         | { userToken: string; supabaseUserId: string },
  ) => {
    if (!supabase) return;
    setMetaPopupPending(true);
    try {
      const body = 'code' in args
        ? { code: args.code, redirect_uri: args.redirectUri, supabase_user_id: args.supabaseUserId }
        : { user_token: args.userToken, supabase_user_id: args.supabaseUserId };

      const { data, error: fnError } = await supabase.functions.invoke('meta-fetch-pages', { body });

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
                    return (
                      <div key={ch.id} className="flex items-center gap-2 text-sm">
                        <Icon className={cn('h-4 w-4', color)} />
                        <span className="text-secondary-foreground">{ch.name}:</span>
                        {ch.status === 'connected' ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {ch.phoneOrHandle || ch.channelId || 'Connected'}
                          </span>
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
                disabled={metaPopupPending || allMetaConnected}
                className={cn(
                  'px-5 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
                  allMetaConnected
                    ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60'
                )}
              >
                {metaPopupPending
                  ? 'Connecting...'
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
                choose which Pages and Instagram accounts to connect. Allow popups for this site if
                your browser prompts you.
              </span>
            </div>
          )}
        </div>
      </div>

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
