import React, { useState } from 'react';
import { PlugZap, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';

interface Channel {
  id: string;
  name: string;
  platform: string;
  status: 'connected' | 'disconnected' | 'pending';
  phoneOrHandle?: string;
}

export default function ChannelConnections() {
  const [channels, setChannels] = useState<Channel[]>([
    { id: 'wa', name: 'WhatsApp Business', platform: 'whatsapp', status: 'disconnected' },
    { id: 'ig', name: 'Instagram DMs', platform: 'instagram', status: 'disconnected' },
  ]);

  const [connecting, setConnecting] = useState<string | null>(null);

  const handleConnect = async (channelId: string) => {
    setConnecting(channelId);
    
    // Simulate Woztell connection flow
    await new Promise(r => setTimeout(r, 1400));
    
    setChannels(prev =>
      prev.map(ch =>
        ch.id === channelId
          ? { ...ch, status: 'connected', phoneOrHandle: channelId === 'wa' ? '+1 (787) 555-0192' : '@yourbusiness' }
          : ch
      )
    );
    
    setConnecting(null);
  };

  const handleDisconnect = (channelId: string) => {
    setChannels(prev =>
      prev.map(ch =>
        ch.id === channelId ? { ...ch, status: 'disconnected', phoneOrHandle: undefined } : ch
      )
    );
  };

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
      </div>

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
                      ? `Connected as ${channel.phoneOrHandle}` 
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
                  <button
                    onClick={() => handleConnect(channel.id)}
                    disabled={connecting === channel.id}
                    className={cn(
                      "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
                      "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                    )}
                  >
                    {connecting === channel.id ? 'Connecting via Woztell...' : 'Connect via Woztell'}
                  </button>
                )}
              </div>
            </div>

            {channel.status === 'disconnected' && (
              <div className="mt-4 text-xs bg-background/50 border border-secondary rounded-lg p-3 text-secondary-foreground">
                You will be redirected to Woztell to authorize the official WhatsApp/Instagram Business account.
                This is required for reliable delivery and compliance.
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
            We handle the bridge between Woztell webhooks and your AI agent.
          </div>
        </div>
      </div>
    </div>
  );
}
