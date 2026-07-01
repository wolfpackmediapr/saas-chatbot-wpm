import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Instagram, Facebook, MessageCircle, User, Bot, UserCheck,
  ChevronLeft, Send, Loader2, RefreshCw, AlertCircle, Clock,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

// ─── Types ───────────────────────────────────────────────────────────────────

type ChannelType = 'instagram' | 'facebook' | 'whatsapp' | 'web_chat' | 'test';
type ConvStatus = 'active' | 'handoff' | 'closed' | 'archived';

interface Conversation {
  id: string;
  client_id: string;
  channel_type: ChannelType;
  bot_profile_id: string | null;
  external_user_id: string | null;
  external_user_name: string | null;
  status: ConvStatus;
  last_message_at: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound' | 'internal';
  role: 'user' | 'assistant' | 'system' | 'tool' | 'human';
  content: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function platformLabel(type: ChannelType) {
  if (type === 'instagram') return 'Instagram DM';
  if (type === 'facebook') return 'Facebook Messenger';
  if (type === 'whatsapp') return 'WhatsApp';
  if (type === 'web_chat') return 'Web Chat';
  return 'Test';
}

function PlatformIcon({ type, className }: { type: ChannelType; className?: string }) {
  if (type === 'instagram') return <Instagram className={cn('text-pink-500', className)} />;
  if (type === 'facebook') return <Facebook className={cn('text-blue-500', className)} />;
  return <MessageCircle className={cn('text-secondary-foreground', className)} />;
}

function displayName(conv: Conversation) {
  if (conv.external_user_name) return conv.external_user_name;
  if (conv.external_user_id) return conv.external_user_id.slice(0, 14) + '…';
  return 'Unknown';
}

function relativeTime(iso: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

async function callInboxReply(accessToken: string, conversationId: string, message: string) {
  if (!SUPABASE_URL) throw new Error('VITE_SUPABASE_URL not configured');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/inbox-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ conversationId, message }),
  });
  return res.json() as Promise<{ ok: boolean; sent?: boolean; error?: string }>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Inbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [togglingHandoff, setTogglingHandoff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false); // mobile: show detail panel
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const realtimeRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // Keep refs in sync with state so notification callbacks never read stale closures
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // ── Auth token ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase?.auth.getSession().then(({ data: { session } }) => {
      setAccessToken(session?.access_token ?? null);
    });
  }, []);

  // ── Browser notification permission ───────────────────────────────────────
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  // ── Load conversation list ─────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!supabase) return;
    setLoadingConvs(true);
    const { data, error: err } = await supabase
      .from('wpm_conversations')
      .select('id, client_id, channel_type, bot_profile_id, external_user_id, external_user_name, status, last_message_at, created_at, metadata')
      .in('status', ['active', 'handoff'])
      .order('last_message_at', { ascending: false });
    if (!err && data) setConversations(data as Conversation[]);
    setLoadingConvs(false);
  }, []);

  // ── Agent names (for the per-conversation badge) ───────────────────────────
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('wpm_bot_profiles')
      .select('id, name')
      .then(({ data }) => {
        if (data) {
          setAgentNames(Object.fromEntries(data.map((b: { id: string; name: string | null }) => [b.id, b.name || 'AI Assistant'])));
        }
      });
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ── Realtime: conversation list updates ───────────────────────────────────
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel('inbox-conv-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wpm_conversations' }, () => {
        loadConversations();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadConversations]);

  // ── Realtime: global inbound message notifications ────────────────────────
  // Runs once; reads selectedId and conversations via refs to avoid stale closures.
  useEffect(() => {
    if (!supabase) return;
    const ch = supabase
      .channel('inbox-global-notify')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wpm_messages' },
        (payload) => {
          const msg = payload.new as Message & { conversation_id: string; direction: string };
          if (msg.direction !== 'inbound') return;
          // Skip if the user is actively viewing this conversation and the tab is visible
          if (!document.hidden && msg.conversation_id === selectedIdRef.current) return;
          if (!('Notification' in window) || Notification.permission !== 'granted') return;

          const conv = conversationsRef.current.find((c) => c.id === msg.conversation_id);
          const name = conv ? displayName(conv) : 'New message';
          const platform = conv ? platformLabel(conv.channel_type) : '';

          new Notification(name, {
            body: `${platform}: ${(msg.content ?? '').slice(0, 120)}`,
            icon: '/favicon.ico',
            tag: msg.conversation_id, // Collapses multiple rapid messages from same conv
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load messages for selected conversation ───────────────────────────────
  useEffect(() => {
    if (!selectedId || !supabase) { setMessages([]); return; }
    setLoadingMsgs(true);
    supabase
      .from('wpm_messages')
      .select('id, direction, role, content, created_at')
      .eq('conversation_id', selectedId)
      .order('created_at', { ascending: true })
      .limit(200)
      .then(({ data }) => {
        setMessages((data as Message[]) ?? []);
        setLoadingMsgs(false);
      });
  }, [selectedId]);

  // ── Realtime: new messages in selected conversation ───────────────────────
  useEffect(() => {
    if (!selectedId || !supabase) return;
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);

    const ch = supabase
      .channel(`inbox-msgs-${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wpm_messages', filter: `conversation_id=eq.${selectedId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        },
      )
      .subscribe();
    realtimeRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [selectedId]);

  // ── Auto-scroll to bottom ─────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Select conversation ────────────────────────────────────────────────────
  const handleSelect = (conv: Conversation) => {
    setSelectedId(conv.id);
    setReplyText('');
    setError(null);
    setShowDetail(true);
  };

  // ── Toggle bot / human handoff ─────────────────────────────────────────────
  const handleToggleHandoff = async () => {
    if (!selected || !supabase) return;
    setTogglingHandoff(true);
    setError(null);
    const newStatus: ConvStatus = selected.status === 'handoff' ? 'active' : 'handoff';
    const { error: err } = await supabase
      .from('wpm_conversations')
      .update({ status: newStatus })
      .eq('id', selected.id);
    if (err) {
      setError(`Failed to update status: ${err.message}`);
    } else {
      setConversations((prev) =>
        prev.map((c) => c.id === selected.id ? { ...c, status: newStatus } : c),
      );
    }
    setTogglingHandoff(false);
  };

  // ── Send human reply ───────────────────────────────────────────────────────
  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedId || !accessToken) return;
    setSending(true);
    setError(null);
    const text = replyText.trim();
    setReplyText('');
    try {
      const result = await callInboxReply(accessToken, selectedId, text);
      if (!result.ok) setError(result.error ?? 'Send failed');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const handleReplyKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel: conversation list ── */}
      <div className={cn(
        'w-full lg:w-80 xl:w-96 flex-shrink-0 border-r border-secondary flex flex-col',
        'lg:flex', showDetail ? 'hidden lg:flex' : 'flex',
      )}>
        {/* Header */}
        <div className="p-4 border-b border-secondary flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Inbox</h1>
            <p className="text-xs text-secondary-foreground mt-0.5">
              {conversations.length} active conversation{conversations.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={loadConversations}
            className="p-2 hover:bg-secondary rounded-lg transition-colors text-secondary-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex items-center justify-center h-32 text-secondary-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-secondary-foreground text-sm px-6 text-center">
              <MessageCircle className="h-8 w-8 mb-3 opacity-30" />
              <p className="font-medium">No conversations yet</p>
              <p className="text-xs mt-1">Incoming Instagram and Facebook DMs will appear here.</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {conversations.map((conv) => (
                <motion.button
                  key={conv.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onClick={() => handleSelect(conv)}
                  className={cn(
                    'w-full text-left px-4 py-3 border-b border-secondary/50 transition-colors',
                    'hover:bg-secondary/50 active:bg-secondary',
                    selectedId === conv.id && 'bg-primary/10 border-l-2 border-l-primary',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'mt-0.5 p-1.5 rounded-full flex-shrink-0',
                      conv.channel_type === 'instagram' ? 'bg-pink-500/10' : 'bg-blue-500/10',
                    )}>
                      <PlatformIcon type={conv.channel_type} className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate">{displayName(conv)}</span>
                        <span className="text-xs text-secondary-foreground flex-shrink-0">
                          {relativeTime(conv.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-secondary-foreground truncate">
                          {platformLabel(conv.channel_type)}
                        </span>
                        <span className={cn(
                          'text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2',
                          conv.status === 'handoff'
                            ? 'bg-orange-500/10 text-orange-500'
                            : 'bg-green-500/10 text-green-600 dark:text-green-400',
                        )}>
                          {conv.status === 'handoff'
                            ? 'Human'
                            : (conv.bot_profile_id && agentNames[conv.bot_profile_id]) || 'Bot'}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* ── Right panel: conversation detail ── */}
      <div className={cn(
        'flex-1 flex flex-col min-w-0',
        'lg:flex', showDetail ? 'flex' : 'hidden lg:flex',
      )}>
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-secondary-foreground text-sm">
            <MessageCircle className="h-10 w-10 mb-3 opacity-20" />
            <p>Select a conversation to view messages</p>
          </div>
        ) : (
          <>
            {/* ── Contact info header ── */}
            <div className="border-b border-secondary p-4 flex-shrink-0 sticky top-0 z-10 bg-background">
              <div className="flex items-start gap-3">
                {/* Mobile back button */}
                <button
                  onClick={() => setShowDetail(false)}
                  className="lg:hidden mt-1 p-1 hover:bg-secondary rounded-lg transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Avatar */}
                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                  selected.channel_type === 'instagram' ? 'bg-pink-500/10' : 'bg-blue-500/10',
                )}>
                  <PlatformIcon type={selected.channel_type} className="h-5 w-5" />
                </div>

                {/* Contact details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <p className="font-semibold text-sm">{displayName(selected)}</p>
                      <p className="text-xs text-secondary-foreground mt-0.5">
                        {platformLabel(selected.channel_type)}
                        {selected.external_user_id && (
                          <> · <span className="font-mono">{selected.external_user_id}</span></>
                        )}
                      </p>
                      <div className="flex items-center gap-1 mt-1 text-xs text-secondary-foreground">
                        <Clock className="h-3 w-3" />
                        First contact {new Date(selected.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    {/* Bot / Human toggle */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn(
                        'text-xs font-medium transition-colors',
                        selected.status !== 'handoff' ? 'text-primary' : 'text-secondary-foreground',
                      )}>
                        Bot
                      </span>
                      <button
                        onClick={handleToggleHandoff}
                        disabled={togglingHandoff}
                        className={cn(
                          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none',
                          selected.status === 'handoff' ? 'bg-orange-500' : 'bg-primary',
                          togglingHandoff && 'opacity-60 cursor-not-allowed',
                        )}
                        title={selected.status === 'handoff' ? 'Return to bot' : 'Take over as human'}
                      >
                        <span
                          className={cn(
                            'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                            selected.status === 'handoff' ? 'translate-x-6' : 'translate-x-1',
                          )}
                        />
                      </button>
                      <span className={cn(
                        'text-xs font-medium transition-colors',
                        selected.status === 'handoff' ? 'text-orange-500' : 'text-secondary-foreground',
                      )}>
                        Human
                      </span>
                    </div>
                  </div>

                  {/* Status pill */}
                  {selected.status === 'handoff' && (
                    <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-500 text-xs font-medium">
                      <UserCheck className="h-3 w-3" />
                      Human takeover active — bot responses paused
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="mt-2 flex items-center gap-2 text-xs text-red-500 bg-red-500/10 px-3 py-2 rounded-lg">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>

            {/* ── Message thread ── */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMsgs ? (
                <div className="flex items-center justify-center h-full text-secondary-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading messages…
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-secondary-foreground text-sm">
                  No messages yet
                </div>
              ) : (
                messages.map((msg) => {
                  const isInbound = msg.direction === 'inbound';
                  const isHuman = msg.role === 'human';
                  const isBot = msg.role === 'assistant';

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn('flex gap-2', isInbound ? 'justify-start' : 'justify-end')}
                    >
                      {/* Avatar for inbound */}
                      {isInbound && (
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1',
                          selected.channel_type === 'instagram' ? 'bg-pink-500/10' : 'bg-blue-500/10',
                        )}>
                          <User className="h-3 w-3 text-secondary-foreground" />
                        </div>
                      )}

                      <div className={cn('max-w-[75%] space-y-0.5', isInbound ? 'items-start' : 'items-end')}>
                        {/* Role label for outbound */}
                        {!isInbound && (
                          <div className="flex items-center justify-end gap-1 mb-0.5">
                            {isHuman ? (
                              <><UserCheck className="h-3 w-3 text-orange-500" /><span className="text-xs text-orange-500">You</span></>
                            ) : isBot ? (
                              <><Bot className="h-3 w-3 text-primary" /><span className="text-xs text-primary">Bot</span></>
                            ) : null}
                          </div>
                        )}

                        <div className={cn(
                          'px-3 py-2 rounded-2xl text-sm leading-relaxed',
                          isInbound
                            ? 'bg-secondary text-foreground rounded-tl-sm'
                            : isHuman
                            ? 'bg-orange-500 text-white rounded-tr-sm'
                            : 'bg-primary text-primary-foreground rounded-tr-sm',
                        )}>
                          {msg.content}
                        </div>
                        <p className={cn(
                          'text-xs text-secondary-foreground px-1',
                          isInbound ? 'text-left' : 'text-right',
                        )}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {/* Avatar for outbound */}
                      {!isInbound && (
                        <div className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-1',
                          isHuman ? 'bg-orange-500/10' : 'bg-primary/10',
                        )}>
                          {isHuman ? <UserCheck className="h-3 w-3 text-orange-500" /> : <Bot className="h-3 w-3 text-primary" />}
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Human reply input (only in handoff mode) ── */}
            {selected.status === 'handoff' && (
              <div className="border-t border-secondary p-3 flex-shrink-0">
                <div className="flex items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={handleReplyKeyDown}
                      placeholder="Type a reply… (Enter to send, Shift+Enter for newline)"
                      rows={2}
                      className={cn(
                        'w-full resize-none rounded-xl border border-secondary bg-secondary/50 px-3 py-2.5',
                        'text-sm placeholder:text-secondary-foreground focus:outline-none focus:ring-2 focus:ring-primary/30',
                        'transition-colors',
                      )}
                    />
                  </div>
                  <button
                    onClick={handleSendReply}
                    disabled={sending || !replyText.trim() || !accessToken}
                    className={cn(
                      'flex-shrink-0 p-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-secondary-foreground mt-1.5 px-1">
                  Replying as human — bot is paused for this conversation
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
