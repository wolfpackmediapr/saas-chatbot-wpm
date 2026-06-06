import React, { useState, useEffect } from 'react';
import { PlugZap, CheckCircle2, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { getOwnedWpmClient, listClientChannels, upsertClientChannel, deactivateClientChannel } from '../lib/supabase/wpmClients';

interface Channel {
  id: string;
  name: string;
  platform: string;
  status: 'connected' | 'disconnected' | 'pending';
  phoneOrHandle?: string;
  channelId?: string;
}

export default function ChannelConnections() {
  const [channels, setChannels] = useState<Channel[]>([
    { id: 'wa', name: 'WhatsApp Business', platform: 'whatsapp', status: 'disconnected' },
    { id: 'ig', name: 'Instagram DMs', platform: 'instagram', status: 'disconnected' },
  ]);

  const [connecting, setConnecting] = useState<string | null>(null);
  const [pendingChannelId, setPendingChannelId] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

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
              const match = dbChannels.find((db: any) => db.provider === (ch.id === 'wa' ? 'whatsapp' : 'instagram'));
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
      alert('Please enter the Woztell channel ID (or phone/handle) before connecting.');
      return;
    }

    setConnecting(channelId);

    try {
      if (clientId && !isDemoMode) {
        const provider = channelId === 'wa' ? 'whatsapp' : 'instagram';
        await upsertClientChannel(clientId, {
          provider,
          provider_channel_id: inputId.trim(),
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
        const provider = channelId === 'wa' ? 'whatsapp' : 'instagram';
        await deactivateClientChannel(clientId, provider);
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
          Connect your official messaging channels via Woztell. This is how inbound DMs reach your AI agent.
        </p>
        {isDemoMode && (
          <div className="mt-3 flex items-center gap-2 text-amber-400 text-sm bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
            <AlertCircle className="h-4 w-4" />
            Demo mode — connections saved locally (or partially to DB). Enter a real Woztell channel ID to persist.
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {channels.map((channel) => (
          <div key={channel.id} className="bg-secondary/30 border border-secondary rounded-2xl p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <PlugZap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-lg">{channel.name}</div>
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
                      placeholder="Woztell channel ID or phone"
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
                      {connecting === channel.id ? 'Saving...' : 'Connect via Woztell'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {channel.status === 'disconnected' && (
              <div className="mt-4 text-xs bg-background/50 border border-secondary rounded-lg p-3 text-secondary-foreground">
                Enter the Woztell channel ID (or phone number) for this platform. 
                This will be stored in <code>wpm_client_channels</code> and used by the webhook bridge.
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 rounded-xl bg-secondary/20 border border-secondary text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
          <div>
            <strong>Important:</strong> You need a Woztell account and approved WhatsApp/Instagram Business profiles. 
            We handle the bridge between Woztell webhooks and your AI agent. The channel ID you enter here powers the Launch Checklist.
          </div>
        </div>
      </div>
    </div>
  );
}
