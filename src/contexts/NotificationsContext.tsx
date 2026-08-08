import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { supabase } from '../lib/supabase/client';
import { getOwnedWpmClient } from '../lib/supabase/wpmClients';
import { useAuth } from './AuthContext';
import { useToast } from '../components/ui/Toast';

interface NotificationsValue {
  /** Conversations with customer activity since the Inbox was last opened. */
  unreadConversations: number;
  /** Leads captured since the Leads page was last opened. */
  newLeads: number;
  markInboxSeen: () => Promise<void>;
  markLeadsSeen: () => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsValue>({
  unreadConversations: 0,
  newLeads: 0,
  markInboxSeen: async () => {},
  markLeadsSeen: async () => {},
  refresh: async () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

/**
 * Live alerts for the things that need a person: a customer wrote in, the
 * agent escalated, or a lead qualified.
 *
 * Counts are derived from "last seen" timestamps stored per user rather than
 * in the browser, so the badge reads the same on a laptop and a phone.
 */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { notify } = useToast();

  const [clientId, setClientId] = useState<string | null>(null);
  const [unreadConversations, setUnreadConversations] = useState(0);
  const [newLeads, setNewLeads] = useState(0);

  // Read inside realtime callbacks, which close over their first render.
  const seenRef = useRef<{ inbox: string | null; leads: string | null }>({
    inbox: null,
    leads: null,
  });

  const loadCounts = useCallback(async () => {
    if (!supabase || !user) return;

    const { data: settings } = await supabase
      .from('user_settings')
      .select('inbox_last_seen_at, leads_last_seen_at')
      .maybeSingle();

    const inboxSeen = (settings as any)?.inbox_last_seen_at ?? null;
    const leadsSeen = (settings as any)?.leads_last_seen_at ?? null;
    seenRef.current = { inbox: inboxSeen, leads: leadsSeen };

    const client = await getOwnedWpmClient().catch(() => null);
    if (!client) return;
    setClientId(client.id);

    const conversations = supabase
      .from('wpm_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id);
    if (inboxSeen) conversations.gt('last_message_at', inboxSeen);

    const leads = supabase
      .from('wpm_leads')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id);
    if (leadsSeen) leads.gt('created_at', leadsSeen);

    const [conversationResult, leadResult] = await Promise.all([conversations, leads]);
    setUnreadConversations(conversationResult.count ?? 0);
    setNewLeads(leadResult.count ?? 0);
  }, [user]);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  /**
   * Toast when the tab is visible, OS notification when it is not.
   *
   * Splitting on visibility is the point: a toast in a background tab is
   * invisible, and an OS notification while you are already looking at the
   * page is noise. Browser permission is requested lazily, only once an alert
   * actually needs to reach you.
   */
  const alert = useCallback(
    (toast: Parameters<typeof notify>[0], osTitle: string) => {
      if (typeof document !== 'undefined' && document.hidden && 'Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification(osTitle, {
            body: toast.body,
            icon: '/WolfPack_Media_AI_logo_only_icon.png',
            tag: toast.kind,
          });
          return;
        }
        if (Notification.permission === 'default') Notification.requestPermission();
      }
      notify(toast);
    },
    [notify],
  );

  // ── Live alerts ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!supabase || !clientId) return;

    const channel = supabase
      .channel(`alerts-${clientId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wpm_messages',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const row = payload.new as { direction?: string; role?: string; content?: string };
          // Only inbound customer messages — not the agent's own replies.
          if (row.direction !== 'inbound' || row.role !== 'user') return;
          setUnreadConversations((count) => count + 1);
          alert(
            {
              kind: 'message',
              title: 'New message',
              body: row.content?.slice(0, 140),
              href: '/dashboard/inbox',
            },
            'New message',
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wpm_handoff_events',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const row = payload.new as { reason?: string; priority?: string };
          const urgent = row.priority === 'urgent';
          alert(
            {
              kind: 'handoff',
              title: urgent ? 'Urgent — a customer needs a person' : 'A conversation needs you',
              body: row.reason,
              href: '/dashboard/inbox',
              // Escalations stay until dismissed; a customer is waiting.
              duration: 0,
            },
            urgent ? 'Urgent — a customer needs a person' : 'A conversation needs you',
          );
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wpm_leads',
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          const row = payload.new as { full_name?: string; email?: string; intent?: string };
          setNewLeads((count) => count + 1);
          alert(
            {
              kind: 'lead',
              title: 'New qualified lead',
              body: [row.full_name || row.email, row.intent?.replace(/_/g, ' ')]
                .filter(Boolean)
                .join(' · '),
              href: '/dashboard/leads',
            },
            'New qualified lead',
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId, alert]);

  const markSeen = useCallback(
    async (column: 'inbox_last_seen_at' | 'leads_last_seen_at') => {
      if (!supabase || !user) return;
      const now = new Date().toISOString();
      await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, [column]: now, updated_at: now });
      if (column === 'inbox_last_seen_at') {
        seenRef.current.inbox = now;
        setUnreadConversations(0);
      } else {
        seenRef.current.leads = now;
        setNewLeads(0);
      }
    },
    [user],
  );

  // Stable identities: pages call these from an effect keyed on the function,
  // so a new one on every count change would re-mark as seen — and write to the
  // database — every time a message arrived while the page was open.
  const markInboxSeen = useCallback(() => markSeen('inbox_last_seen_at'), [markSeen]);
  const markLeadsSeen = useCallback(() => markSeen('leads_last_seen_at'), [markSeen]);

  const value = useMemo(
    () => ({
      unreadConversations,
      newLeads,
      markInboxSeen,
      markLeadsSeen,
      refresh: loadCounts,
    }),
    [unreadConversations, newLeads, markInboxSeen, markLeadsSeen, loadCounts],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
