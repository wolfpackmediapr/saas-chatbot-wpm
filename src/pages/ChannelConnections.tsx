import React, { useState, useEffect } from 'react';
import { PlugZap, CheckCircle2, AlertCircle, MessageCircle, Instagram, Facebook } from 'lucide-react';
import { cn } from '../lib/utils';
import { getOwnedWpmClient, listClientChannels, upsertClientChannel, deactivateClientChannel } from '../lib/supabase/wpmClients';
import { supabase } from '../lib/supabase/client';
import { useNavigate } from 'react-router-dom';

interface Channel {
  id: string;
  name: string;
  platform: 'whatsapp' | 'instagram' | 'facebook';
  provider: 'woztell' | 'meta';
  status: 'connected' | 'disconnected' | 'pending';
  phoneOrHandle?: string;
  channelId?: string;
}

const CHANNEL_CONFIG: Record<Channel['id'], Channel> = {
  wa: {
    id: 'wa',
    name: 'WhatsApp Business',
    platform: 'whatsapp',
    provider: 'woztell',
    status: 'disconnected',
  },
  ig: {
    id: 'ig',
    name: 'Instagram DMs',
    platform: 'instagram',
    provider: 'meta',
    status: 'disconnected',
  },
  fb: {
    id: 'fb',
    name: 'Facebook Messenger',
    platform: 'facebook',
    provider: 'meta',
    status: 'disconnected',
  },
};

export default function ChannelConnections() {
  const [channels, setChannels] = useState<Channel[]>(Object.values(CHANNEL_CONFIG));
  const [connecting, setConnecting] = useState<string | null>(null);
  const [pendingChannelId, setPendingChannelId] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [metaAuthInProgress, setMetaAuthInProgress] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
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
              const match = dbChannels.find((db: any) => db.provider === ch.provider && db.channel_type === ch.platform);
              if (match) {
                return {
                  ...ch,
                  status: 'connected' as const,
                  phoneOrHandle: match.metadata?.phone_or_handle || match.provider_channel_id,
                  channelId: match.provider_channel_id,
                };
              }
              return ch;
            })
          );
        }
      } catch (err: any) {
        console.error('Failed to load channels', err);
        setError('Could not load channels from database. Using local simulation.');
        setIsDemoMode(true);
      } finally {
        setLoading(false);
      }
    }
    loadChannels();
  }, []);

  const handleConnect = async (channelId: string) => {
    const inputId = pendingChannelId[channelId] || '';
    if (!inputId.trim()) {
      alert('Please enter the channel ID before connecting.');
      return;
    }

    setConnecting(channelId);

    try {
      if (clientId && !isDemoMode) {
        const config = CHANNEL_CONFIG[channelId];
        await upsertClientChannel(clientId, {
          provider: config.provider,
          provider_channel_id: inputId.trim(),
          channel_type: config.platform,
          metadata: {
            phone_or_handle: inputId.trim(),
            connected_via: 'self-serve',
          },
        });
      }

      setChannels(prev =>
        prev.map(ch =>
          ch.id === channelId
            ? { ...ch, status: 'connected', phoneOrHandle: inputId.trim(), channelId: inputId.trim() }
            : ch
        )
      );

      // Clear the input
      setPendingChannelId(prev => ({ ...prev, [channelId]: '' }));
    } catch (err: any) {
      console.error('Channel connect failed', err);
      setError('Failed to save channel to database. Saved locally only.');
      // Still update UI for demo feel
      setChannels(prev =>
        prev.map(ch =>
          ch.id === channelId
            ? { ...ch, status: 'connected', phoneOrHandle: inputId.trim() }
            : ch
        )
      );
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (channelId: string) => {
    try {
      if (clientId && !isDemoMode) {
        const config = CHANNEL_CONFIG[channelId];
        await deactivateClientChannel(clientId, config.platform);
      }
    } catch (err) {
      console.error('Disconnect failed', err);
    }

    setChannels(prev =>
      prev.map(ch =>
        ch.id === channelId ? { ...ch, status: 'disconnected', phoneOrHandle: undefined, channelId: undefined } : ch
      )
    );
  };

  const updatePendingId = (channelId: string, value: string) => {
    setPendingChannelId(prev => ({ ...prev, [channelId]: value }));
  };

  const handleMetaConnect = async (channelId: string) => {
    if (!supabase) {
      setError('Supabase not configured');
      return;
    }

    setMetaAuthInProgress(channelId);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'facebook',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'pages_show_list,instagram_basic,instagram_manage_messages,pages_messaging',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) throw error;
      // The redirect will happen automatically
    } catch (err: any) {
      console.error('Meta OAuth failed:', err);
      setError(`Failed to start Meta connection: ${err.message}`);
      setMetaAuthInProgress(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-4xl flex items-center justify-center min-h-[300px]">
        <div className="text-secondary-foreground">Loading channel connections...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <PlugZap className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-semibold">Channel Connections</h1>
        </div>
        <p className="text-secondary-foreground">
          Connect your messaging channels. <span className="font-medium">WhatsApp</span> uses Woztell. <span className="font-medium">Instagram &amp; Facebook Messenger</span> connect directly via Meta.
        </p>
        {isDemoMode && (
          <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4" />
            Demo mode — connections saved locally (or partially to DB). Enter real channel IDs to persist.
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {channels.map((channel) => {
          const isMeta = channel.provider === 'meta';
          const Icon = channel.platform === 'whatsapp' ? PlugZap : channel.platform === 'instagram' ? Instagram : MessageCircle;
          const iconBg = channel.platform === 'whatsapp' ? 'bg-green-500/10' : channel.platform === 'instagram' ? 'bg-purple-500/10' : 'bg-blue-500/10';
          const iconColor = channel.platform === 'whatsapp' ? 'text-green-500' : channel.platform === 'instagram' ? 'text-purple-500' : 'text-blue-500';
          const placeholder = isMeta ? 'Meta Page ID' : 'Woztell Channel ID';
          const buttonText = isMeta ? 'Connect via Meta' : 'Connect via Woztell';
          const helpText = isMeta
            ? `Click "Connect via Meta" to authorize via Facebook Login. You'll select which Pages to connect for ${channel.name}.`
            : 'Enter the Woztell Channel ID for your WhatsApp Business account.';

          return (
            <div key={channel.id} className="bg-secondary/30 border border-secondary rounded-2xl p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center`}>
                    <Icon className={`h-6 w-6 ${iconColor}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-lg">{channel.name}</div>
                      <span className={`px-2 py-0.5 text-xs rounded-full ${isMeta ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}`}>
                        {isMeta ? 'Meta Direct' : 'Woztell'}
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
                  ) : isMeta ? (
                    <button
                      onClick={() => handleMetaConnect(channel.id)}
                      disabled={metaAuthInProgress === channel.id || connecting === channel.id}
                      className={cn(
                        "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                        "bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-60"
                      )}
                    >
                      {metaAuthInProgress === channel.id
                        ? 'Redirecting to Meta...'
                        : `Connect ${channel.platform === 'instagram' ? 'Instagram' : 'Facebook'} via Meta`}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={placeholder}
                        value={pendingChannelId[channel.id] || ''}
                        onChange={(e) => updatePendingId(channel.id, e.target.value)}
                        className="w-64 rounded-lg border border-secondary bg-background px-3 py-2 text-sm"
                      />
                      <button
                        onClick={() => handleConnect(channel.id)}
                        disabled={connecting === channel.id}
                        className={cn(
                          "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                          "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                        )}
                      >
                        {connecting === channel.id ? 'Saving...' : buttonText}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {channel.status === 'disconnected' && !isMeta && (
                <div className="mt-4 text-xs bg-background/50 border border-secondary rounded-lg p-3 text-secondary-foreground">
                  {helpText}
                  This will be stored in <code>wpm_client_channels</code> (provider: {channel.provider}, channel_type: {channel.platform}) and used by the webhook bridge.
                </div>
              )}
              {channel.status === 'disconnected' && isMeta && (
                <div className="mt-4 text-xs bg-background/50 border border-secondary rounded-lg p-3 text-secondary-foreground">
                  {helpText}
                  This will be stored in <code>wpm_client_channels</code> (provider: {channel.provider}, channel_type: {channel.platform}) and used by the webhook bridge.
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 p-4 rounded-xl bg-secondary/20 border border-secondary text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
          <div>
            <strong>Important:</strong> WhatsApp requires a Woztell account and approved WhatsApp Business profile. Instagram &amp; Facebook Messenger connect directly via Meta Graph API (App: WolfPack Media Chat) — no Woztell needed. The channel ID you enter here powers the Launch Checklist.
          </div>
        </div>
      </div>
    </div>
  );
}
