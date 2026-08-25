import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Instagram, Facebook, MessageCircle, User, Bot, UserCheck,
  ChevronLeft, Send, Loader2, RefreshCw, AlertCircle, Clock,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useNotifications } from '../contexts/NotificationsContext';
import { supabase } from '../lib/supabase/client';
import type { Json } from '../lib/supabase/types';

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
  metadata?: Record<string, unknown> | null;
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


/**
 * How long a handoff conversation has been waiting on a person.
 * The customer is sitting unanswered for this whole time, so the badge shows
 * it rather than a static "Human" label.
 */
function waitingMinutes(conv: Conversation): number | null {
  const handoffAt = conv.metadata?.handoff_at;
  if (typeof handoffAt !== 'string') return null;
  const minutes = Math.floor((Date.now() - new Date(handoffAt).getTime()) / 60000);
  if (Number.isNaN(minutes) || minutes < 0) return null;
  return minutes;
}

function waitingLabel(conv: Conversation): string | null {
  const minutes = waitingMinutes(conv);
  if (minutes === null) return null;
  if (minutes < 1) return 'You · now';
  if (minutes < 60) return `You · ${minutes}m`;
  return `You · ${Math.floor(minutes / 60)}h`;
}

/** " for 12m" — omitted entirely when we have no handoff timestamp. */
function waitingSuffix(conv: Conversation): string {
  const minutes = waitingMinutes(conv);
  if (minutes === null) return '';
  if (minutes < 1) return ' just now';
  if (minutes < 60) return ` for ${minutes}m`;
  return ` for ${Math.floor(minutes / 60)}h`;
}

/**
 * Meta only allows a business to reply within 24 hours of the customer's last
 * message. Past that, sends are rejected with "(#10) This message is sent
 * outside of allowed window" — the reply is still stored, so without checking
 * this the thread shows a message the customer never received.
 */
const REPLY_WINDOW_HOURS = 24;

function hoursSinceLastInbound(messages: Message[]): number | null {
  const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
  if (!lastInbound) return null;
  return (Date.now() - new Date(lastInbound.created_at).getTime()) / 3_600_000;
}

/** True when a human reply would be rejected by Meta's 24-hour policy. */
function replyWindowClosed(messages: Message[]): boolean {
  const hours = hoursSinceLastInbound(messages);
  return hours !== null && hours >= REPLY_WINDOW_HOURS;
}

/** A stored reply Meta refused to deliver. */
function failedToSend(message: Message): boolean {
  return message.metadata?.sent_via_graph_api === false;
}

/** Meta's error text is accurate but tells nobody what to do about it. */
function friendlySendError(raw: string | undefined): string {
  if (!raw) return 'Could not send that reply.';
  if (raw.toLowerCase().includes('invalid token') || raw.toLowerCase().includes('jwt')) {
    return 'Your session expired before that could send. Your message has been kept — press send again.';
  }
  if (raw.includes('(#10)') || raw.toLowerCase().includes('outside of allowed window')) {
    return `Meta only allows replies within ${REPLY_WINDOW_HOURS} hours of the customer's last message. This one is outside that window, so it was not delivered — the customer has to message again before you can reply.`;
  }
  return raw;
}

/** Handoffs opened before source tracking, and all AI escalations, are 'auto'. */
function handoffSource(conv: Conversation): 'manual' | 'auto' {
  return conv.metadata?.handoff_source === 'manual' ? 'manual' : 'auto';
}

const CHANNEL_PERSON_LABEL: Record<string, string> = {
  facebook: 'Facebook user',
  instagram: 'Instagram user',
  whatsapp: 'WhatsApp user',
  web_chat: 'Web visitor',
  test: 'Test user',
};

/**
 * A name when we have one. When we don't, say who this is in words rather than
 * showing a truncated 17-digit ID — the last four digits are enough to tell two
 * unnamed threads apart, and they are the only part a person can actually hold
 * in their head.
 */
function displayName(conv: Conversation) {
  if (conv.external_user_name) return conv.external_user_name;
  const label = CHANNEL_PERSON_LABEL[conv.channel_type ?? ''] ?? 'Visitor';
  if (conv.external_user_id) return `${label} ·${conv.external_user_id.slice(-4)}`;
  return label;
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const realtimeRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const conversationsRef = useRef<Conversation[]>([]);

  const [filter, setFilter] = useState<'all' | 'needs_you'>('all');
  const { markInboxSeen } = useNotifications();

  // Derived values must come after the state they read — `visibleConversations`
  // referenced `filter` above its declaration, which threw a temporal dead zone
  // error ("Cannot access 'T' before initialization") and took out the page.
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const needsYouCount = conversations.filter((c) => c.status === 'handoff').length;
  const visibleConversations =
    filter === 'needs_you' ? conversations.filter((c) => c.status === 'handoff') : conversations;

  // Opening the Inbox clears its badge.
  useEffect(() => { markInboxSeen(); }, [markInboxSeen]);

  // Keep refs in sync with state so notification callbacks never read stale closures
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);

  // No access token is cached in state on purpose. A token copied at mount
  // expires after an hour while supabase-js quietly refreshes its own session,
  // so the stale copy is invisible until a manual fetch is rejected 401.
  // handleSendReply asks for a fresh one at send time instead.

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
    const db = supabase;
    return () => { db.removeChannel(ch); };
  }, [loadConversations]);

  // Global inbound alerts now live in NotificationsContext so they work on
  // every page, not only while the Inbox happens to be mounted.

  // ── Load messages for selected conversation ───────────────────────────────
  useEffect(() => {
    if (!selectedId || !supabase) { setMessages([]); return; }
    setLoadingMsgs(true);
    supabase
      .from('wpm_messages')
      .select('id, direction, role, content, created_at, metadata')
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
    const db = supabase;
    return () => { db.removeChannel(ch); };
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
    const takingOver = selected.status !== 'handoff';
    const newStatus: ConvStatus = takingOver ? 'handoff' : 'active';
    const now = new Date().toISOString();

    // handoff_at drives both the waiting badge and the 30-minute auto-return in
    // the webhook. Without it a manual takeover is invisible and unmeasurable.
    // handoff_source 'manual' means you meant "stop replying" — the bot goes
    // quiet at once, unlike an AI escalation where it keeps helping until you
    // actually step in. See decideHandoffAction in _shared/wpm_handoff.ts.
    const nextMetadata = { ...(selected.metadata ?? {}) };
    if (takingOver) {
      nextMetadata.handoff_at = now;
      nextMetadata.handoff_source = 'manual';
    } else {
      delete nextMetadata.handoff_at;
      delete nextMetadata.handoff_source;
    }

    const { error: err } = await supabase
      .from('wpm_conversations')
      // nextMetadata is assembled from spreads, so it lands as
      // { [x: string]: unknown }. The column is jsonb and every value we put in
      // it is JSON-safe.
      .update({ status: newStatus, metadata: nextMetadata as Json })
      .eq('id', selected.id);

    if (err) {
      setError(`Failed to update status: ${err.message}`);
      setTogglingHandoff(false);
      return;
    }

    // Record the transition so handoffs are auditable instead of silent.
    if (takingOver) {
      await supabase.from('wpm_handoff_events').insert({
        client_id: selected.client_id,
        conversation_id: selected.id,
        reason: 'Taken over manually from the Inbox',
        priority: 'normal',
        status: 'open',
      });
    } else {
      await supabase
        .from('wpm_handoff_events')
        .update({ status: 'resolved', updated_at: now })
        .eq('conversation_id', selected.id)
        .eq('status', 'open');
    }

    setConversations((prev) =>
      prev.map((c) => c.id === selected.id ? { ...c, status: newStatus, metadata: nextMetadata } : c),
    );
    setTogglingHandoff(false);
  };

  // ── Send human reply ───────────────────────────────────────────────────────
  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedId || !supabase) return;
    setSending(true);
    setError(null);
    const text = replyText.trim();
    try {
      // Ask for the token at SEND time, never the one captured at mount.
      // Supabase access tokens expire after an hour; supabase-js refreshes its
      // own session (which is why the list and the takeover toggle keep
      // working), but a copy taken into React state goes stale silently. The
      // manual fetch below then sent a dead token, inbox-reply answered 401,
      // and it returns BEFORE the line that stores the message — so the reply
      // was neither delivered nor recorded. An Inbox left open for an hour
      // dropped every human reply.
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? null;
      if (!token) {
        setError('Your session expired. Please refresh the page and sign in again.');
        return;
      }

      const result = await callInboxReply(token, selectedId, text);
      if (!result.ok) {
        setError(friendlySendError(result.error));
        return; // keep the draft — see below
      }
      // Only clear once it is actually sent. Clearing first meant a failed
      // send destroyed what you had typed, on top of not delivering it.
      setReplyText('');
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

        {/* Filter — escalated conversations are the ones with someone waiting,
            and they are easy to lose in a long list. */}
        <div className="flex gap-1.5 px-4 pb-3">
          {([
            { id: 'all' as const, label: 'All', count: conversations.length },
            { id: 'needs_you' as const, label: 'Needs you', count: needsYouCount },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                filter === tab.id
                  ? 'bg-primary text-white'
                  : 'bg-secondary text-secondary-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[0.65rem] leading-none tabular-nums',
                    filter === tab.id
                      ? 'bg-white/20'
                      : tab.id === 'needs_you'
                        ? 'bg-orange-500/20 text-orange-500'
                        : 'bg-background/60',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="flex items-center justify-center h-32 text-secondary-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
            </div>
          ) : visibleConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-secondary-foreground text-sm px-6 text-center">
              <MessageCircle className="h-8 w-8 mb-3 opacity-30" />
              <p className="font-medium">
                {filter === 'needs_you' ? 'Nobody is waiting' : 'No conversations yet'}
              </p>
              <p className="text-xs mt-1">
                {filter === 'needs_you'
                  ? 'Escalated conversations show up here.'
                  : 'Incoming Instagram and Facebook DMs will appear here.'}
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {visibleConversations.map((conv) => (
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
                            ? waitingLabel(conv) ?? 'Human'
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
        'flex-1 flex flex-col min-w-0 min-h-0',
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
            <div className="border-b border-secondary p-4 flex-shrink-0">
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

                      {/* Handoff state — the customer is waiting on a person, so
                          say so here rather than only in the list. */}
                      {selected.status === 'handoff' && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs font-medium text-orange-500">
                          <UserCheck className="h-3 w-3" />
                          {handoffSource(selected) === 'manual'
                            ? `You took over${waitingSuffix(selected)} — the bot is paused`
                            : `Escalated to you${waitingSuffix(selected)} — the bot keeps replying until you answer`}
                        </div>
                      )}
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

                  {/* The handoff line above already states who owns this and
                      whether the bot is still replying. A second pill here used
                      to claim "bot responses paused" unconditionally, which
                      contradicted it on AI escalations, where the bot is not
                      paused until a human actually sends something. */}
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
                          failedToSend(msg) && 'opacity-50 ring-1 ring-orange-500/50',
                        )}>
                          {msg.content}
                        </div>
                        <p className={cn(
                          'text-xs px-1',
                          failedToSend(msg) ? 'text-orange-500' : 'text-secondary-foreground',
                          isInbound ? 'text-left' : 'text-right',
                        )}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {/* Stored but rejected by Meta — without this the thread
                              shows a message the customer never received. */}
                          {failedToSend(msg) && ' · not delivered'}
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
                    disabled={sending || !replyText.trim()}
                    className={cn(
                      'flex-shrink-0 p-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-colors',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </button>
                </div>
                {replyWindowClosed(messages) ? (
                  <p className="mt-1.5 flex items-start gap-1.5 px-1 text-xs text-orange-500">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    Meta blocks replies more than {REPLY_WINDOW_HOURS} hours after the customer's
                    last message. Anything sent now will not reach them until they message again.
                  </p>
                ) : (
                  <p className="text-xs text-secondary-foreground mt-1.5 px-1">
                    {handoffSource(selected) === 'manual'
                      ? 'Replying as human — the bot is paused for this conversation'
                      : 'Replying as human — the bot is still answering; sending takes over'}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
