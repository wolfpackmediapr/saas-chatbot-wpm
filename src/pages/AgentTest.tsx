import { useEffect, useRef, useState } from 'react';
import { Play, Send, Bot, User, AlertCircle, RefreshCw, CheckCircle2, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase/client';
import {
  getOwnedWpmClient,
  getActiveBotProfile,
  getBotInstructions,
  listKnowledgeSources,
} from '../lib/supabase/wpmClients';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}

interface ContextSummary {
  businessName: string;
  tone: string | null;
  knowledgeItems: number;
  primaryGoal: string;
  responseLanguage: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

async function callTestChat(
  messages: Message[],
  accessToken: string,
): Promise<{ reply: string; context: ContextSummary }> {
  const fnUrl = `${SUPABASE_URL}/functions/v1/wpm-test-chat`;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ messages }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? `Edge function error ${res.status}`);
  }
  return data as { reply: string; context: ContextSummary };
}

export default function AgentTest() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [contextSummary, setContextSummary] = useState<ContextSummary | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Load context summary + access token on mount ──────────────────────────
  useEffect(() => {
    async function init() {
      setLoadingContext(true);
      setConfigError(null);

      if (!supabase || !SUPABASE_URL) {
        setConfigError('Supabase is not configured — cannot reach the AI edge function.');
        setLoadingContext(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setConfigError('You must be logged in to use the Test Agent.');
        setLoadingContext(false);
        return;
      }
      setAccessToken(session.access_token);

      try {
        const client = await getOwnedWpmClient();
        if (!client) {
          setConfigError('No business profile found. Complete Business Profile setup first.');
          setLoadingContext(false);
          return;
        }

        const botProfile = await getActiveBotProfile(client.id);
        const instructions = botProfile ? await getBotInstructions(botProfile.id) : null;
        const knowledge = await listKnowledgeSources(client.id);

        const summary: ContextSummary = {
          businessName: client.name,
          tone: botProfile?.tone ?? null,
          knowledgeItems: knowledge.length,
          primaryGoal: instructions?.primary_goal ?? 'Book a Calendly meeting',
          responseLanguage: instructions?.response_language ?? 'English + Latin American Spanish',
        };
        setContextSummary(summary);

        const greeting = `Hi! I'm the AI agent for ${client.name}. How can I help you today?`;
        setMessages([{ role: 'assistant', content: greeting }]);
      } catch (e: any) {
        setConfigError(e.message ?? 'Failed to load configuration.');
      } finally {
        setLoadingContext(false);
      }
    }
    init();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isTyping) return;
    if (!accessToken) {
      setConfigError('Session expired — please refresh the page.');
      return;
    }

    const updated: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(updated);
    setInput('');
    setIsTyping(true);

    try {
      const { reply, context } = await callTestChat(updated, accessToken);

      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);

      // Update the context summary with what the edge function actually used
      setContextSummary(context);
    } catch (e: any) {
      const errorMsg = e.message ?? 'Something went wrong calling the AI.';
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${errorMsg}`, error: true },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    const greeting = contextSummary
      ? `Hi! I'm the AI agent for ${contextSummary.businessName}. How can I help you today?`
      : "Hi! How can I help you today?";
    setMessages([{ role: 'assistant', content: greeting }]);
  };

  const samplePrompts = [
    'Tell me about your services for automating leads.',
    'What exactly does your business do, and where are you located?',
    'I want to book a discovery call next week.',
    'Can you handle Instagram and WhatsApp messages?',
  ];

  if (loadingContext) {
    return (
      <div className="p-6 max-w-4xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-secondary/50 rounded" />
          <div className="h-4 w-96 bg-secondary/30 rounded" />
          <div className="h-[400px] bg-secondary/20 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl h-[calc(100vh-120px)] flex flex-col">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Play className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-semibold">Test Agent</h1>
          </div>
          <p className="text-secondary-foreground text-sm">
            Live OpenAI responses using your saved Business Profile, Agent Instructions, and Knowledge Base.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-2 text-sm rounded-lg border border-secondary hover:bg-secondary flex items-center gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            Reload
          </button>
          <button
            onClick={clearChat}
            className="px-4 py-2 text-sm rounded-lg border border-secondary hover:bg-secondary"
          >
            Clear Chat
          </button>
        </div>
      </div>

      {/* Config error banner */}
      {configError && (
        <div className="mb-4 flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {configError}
        </div>
      )}

      {/* Context summary bar */}
      {contextSummary && (
        <div className="mb-4 rounded-xl border border-secondary bg-secondary/20 p-3 text-sm flex flex-wrap items-center gap-x-6 gap-y-1">
          <div className="flex items-center gap-2 text-emerald-400">
            <Zap className="h-4 w-4" />
            <span className="font-medium">Live OpenAI</span>
          </div>
          <div>
            <span className="text-secondary-foreground">Business:</span>{' '}
            <span className="font-medium">{contextSummary.businessName}</span>
          </div>
          {contextSummary.tone && (
            <div>
              <span className="text-secondary-foreground">Tone:</span> {contextSummary.tone}
            </div>
          )}
          <div>
            <span className="text-secondary-foreground">Goal:</span> {contextSummary.primaryGoal}
          </div>
          <div>
            <span className="text-secondary-foreground">Language:</span> {contextSummary.responseLanguage}
          </div>
          <div>
            <span className="text-secondary-foreground">Knowledge items:</span>{' '}
            {contextSummary.knowledgeItems}
          </div>
        </div>
      )}

      {/* Chat window */}
      <div className="flex-1 bg-secondary/20 border border-secondary rounded-2xl overflow-hidden flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : '')}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : msg.error
                    ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                    : 'bg-secondary/70 border border-secondary',
                )}
              >
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-secondary/70 border border-secondary rounded-2xl px-4 py-3 text-sm flex items-center gap-2">
                <span className="animate-pulse">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input row */}
        <div className="border-t border-secondary p-4 bg-background">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!!configError || isTyping}
              placeholder={configError ? 'Fix configuration errors above first' : "Type a test message and press Enter..."}
              className="flex-1 rounded-xl border border-secondary bg-secondary/30 px-4 py-3 outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isTyping || !!configError}
              className="px-6 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>

          {/* Sample prompts */}
          <div className="mt-2 flex flex-wrap gap-2">
            {samplePrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => setInput(prompt)}
                disabled={isTyping || !!configError}
                className="text-[11px] px-2.5 py-1 rounded-full border border-secondary/60 hover:bg-secondary/40 text-secondary-foreground disabled:opacity-40"
              >
                {prompt}
              </button>
            ))}
          </div>

          <p className="text-[10px] text-secondary-foreground mt-2 px-1">
            Each reply is a real OpenAI call using your saved profile and instructions.
            The same prompt pipeline runs in production when leads DM your channels.
          </p>
        </div>
      </div>
    </div>
  );
}
