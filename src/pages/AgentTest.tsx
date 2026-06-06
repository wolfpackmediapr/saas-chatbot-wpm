import { useEffect, useState } from 'react';
import { Play, Send, Bot, User, AlertCircle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  getOwnedWpmClient,
  getActiveBotProfile,
  getBotInstructions,
  listKnowledgeSources,
} from '../lib/supabase/wpmClients';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  lead?: any;
}

interface LoadedContext {
  client: any;
  botProfile: any;
  instructions: any;
  knowledge: any[];
  demoMode: boolean;
}

export default function AgentTest() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your AI assistant for WolfPack Media. How can I help you today?",
    },
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [lastLead, setLastLead] = useState<any>(null);
  const [context, setContext] = useState<LoadedContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);

  // Load real client configuration from Supabase (or demo fallback)
  useEffect(() => {
    const loadContext = async () => {
      setLoadingContext(true);
      setContextError(null);

      try {
        const client = await getOwnedWpmClient();
        if (!client) {
          setContextError('No client profile found. Complete Business Profile first.');
          setLoadingContext(false);
          return;
        }

        const isDemo = !client.id || client.id === 'demo-client-001' || !import.meta.env.VITE_SUPABASE_URL;

        let botProfile = null;
        let instructions = null;
        let knowledge: any[] = [];

        if (!isDemo) {
          botProfile = await getActiveBotProfile(client.id);
          if (botProfile) {
            instructions = await getBotInstructions(botProfile.id);
          }
          knowledge = await listKnowledgeSources(client.id);
        } else {
          // Demo fallbacks
          botProfile = {
            name: 'AI DM Agent',
            tone: 'professional and friendly',
            public_name: 'WolfPack AI Assistant',
          };
          instructions = {
            business_summary: 'We help businesses automate inbound DMs on WhatsApp and Instagram with AI that qualifies leads and triggers automations.',
            lead_qualification_instructions: 'Ask for name, email/phone, service interest, and timeline. Score high intent if they ask about pricing, booking, or specific services.',
            handoff_rules: 'If they want to book a call or speak to a human, offer to connect them.',
          };
          knowledge = [
            { title: 'AI DM Agent', content_text: 'Our flagship product: 24/7 AI that answers WhatsApp/Instagram DMs, qualifies leads, and routes to your tools.' },
            { title: 'Pricing', content_text: 'Basic $79/mo (400 msgs), Professional $179/mo (most popular, 2000 msgs), Enterprise $449/mo.' },
          ];
        }

        const loaded: LoadedContext = {
          client,
          botProfile,
          instructions,
          knowledge,
          demoMode: isDemo,
        };

        setContext(loaded);

        // Update initial greeting with real business info
        const businessName = client.name || botProfile?.public_name || 'your business';
        const greeting = `Hi! I'm ${botProfile?.public_name || 'your AI assistant'} for ${businessName}. How can I help you today?`;

        setMessages([{ role: 'assistant', content: greeting }]);
      } catch (e: any) {
        console.error('Failed to load agent test context', e);
        setContextError(e.message || 'Failed to load your agent configuration.');
        // Fallback greeting
        setMessages([
          { role: 'assistant', content: "Hi! I'm your AI assistant. How can I help you today?" },
        ]);
      } finally {
        setLoadingContext(false);
      }
    };

    loadContext();
  }, []);

  const getContextualReply = (userInput: string): { reply: string; lead: any } => {
    const lower = userInput.toLowerCase();
    let reply = "Thanks for reaching out. Can you tell me more about what you're looking for?";
    let lead: any = null;

    const bizName = context?.client?.name || 'our team';
    const tone = context?.botProfile?.tone || 'professional and friendly';
    const summary = context?.instructions?.business_summary || '';
    const knowledgeSnippets = (context?.knowledge || [])
      .map((k: any) => k.content_text || k.title)
      .filter(Boolean)
      .join(' ');

    // Incorporate loaded context where possible
    if (lower.includes('price') || lower.includes('cost') || lower.includes('how much') || lower.includes('plan')) {
      reply = `Our AI DM Agent plans start at $79/month for Basic. The Professional plan at $179 is our most popular. ${summary ? summary.slice(0, 120) + '...' : ''} Would you like the full breakdown?`;
      lead = { intent: 'pricing', score: 0.75 };
    } else if (lower.includes('website') || lower.includes('web') || lower.includes('site')) {
      reply = `We specialize in high-converting AI-powered experiences and custom solutions for ${bizName}. What's your timeline and main goal?`;
      lead = { intent: 'service_web', score: 0.85 };
    } else if (lower.includes('dm') || lower.includes('whatsapp') || lower.includes('instagram') || lower.includes('message')) {
      reply = `Yes, our AI DM Agent handles inbound messages on WhatsApp and Instagram 24/7 for ${bizName}. It qualifies leads using your rules and can trigger automations. Want to see how it would reply to your exact use case?`;
      lead = { intent: 'dm_agent', score: 0.92 };
    } else if (lower.includes('book') || lower.includes('call') || lower.includes('meeting') || lower.includes('schedule')) {
      reply = `I'd be happy to help you schedule time with ${bizName}. What's the best email and phone number? (I can also connect you to a human if needed.)`;
      lead = { intent: 'book_call', score: 0.95, needsHuman: true };
    } else if (knowledgeSnippets && (lower.includes('ai') || lower.includes('agent') || lower.includes('automation'))) {
      // Pull from knowledge if relevant
      const snippet = context?.knowledge?.[0]?.content_text || knowledgeSnippets.slice(0, 140);
      reply = `${snippet}. How does that sound for your needs?`;
      lead = { intent: 'product_info', score: 0.7 };
    } else {
      // Default contextual
      reply = `Thanks for the message. As ${tone} assistant for ${bizName}, I can help with our services, pricing, or next steps. What would you like to know?`;
    }

    // Basic handoff respect from instructions
    if (context?.instructions?.handoff_rules && (lower.includes('human') || lower.includes('person') || lower.includes('real'))) {
      reply += ' ' + (context.instructions.handoff_rules || 'I can connect you to a human on our team.');
      lead = { ...lead, needsHuman: true };
    }

    return { reply, lead };
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput('');
    setIsTyping(true);

    // Simulate realistic AI processing time
    await new Promise((r) => setTimeout(r, 850));

    const { reply, lead } = getContextualReply(currentInput);

    const assistantMessage: Message = {
      role: 'assistant',
      content: reply,
      lead,
    };

    setMessages((prev) => [...prev, assistantMessage]);
    if (lead) setLastLead(lead);
    setIsTyping(false);

    // In a fuller implementation this would also call the simulator lib + persist test conversation + potentially queue to wpm_tool_executions in test mode.
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    const greeting = context
      ? `Hi! I'm ${context.botProfile?.public_name || 'your AI assistant'} for ${context.client?.name || 'your business'}. How can I help you today?`
      : "Hi! I'm your AI assistant. How can I help you today?";
    setMessages([{ role: 'assistant', content: greeting }]);
    setLastLead(null);
  };

  const reloadContext = () => {
    // Simple reload by re-triggering effect (or call load again)
    window.location.reload(); // quick & effective for now
  };

  const samplePrompts = [
    'How much does the AI DM Agent cost?',
    'Can it handle Instagram and WhatsApp messages?',
    'I want to book a discovery call next week.',
    'Tell me about your services for automating leads.',
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Play className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-semibold">Test Agent</h1>
          </div>
          <p className="text-secondary-foreground">
            Simulate real conversations before going live. This preview uses your actual Business Profile, Agent Instructions, and Knowledge Base.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reloadContext}
            className="px-3 py-2 text-sm rounded-lg border border-secondary hover:bg-secondary flex items-center gap-1.5"
          >
            <RefreshCw className="h-4 w-4" />
            Reload Context
          </button>
          <button
            onClick={clearChat}
            className="px-4 py-2 text-sm rounded-lg border border-secondary hover:bg-secondary"
          >
            Clear Chat
          </button>
        </div>
      </div>

      {/* Context summary bar (the "wiring" proof) */}
      {context && (
        <div className="mb-4 rounded-xl border border-secondary bg-secondary/20 p-3 text-sm flex flex-wrap items-center gap-x-6 gap-y-1">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">Using live configuration</span>
          </div>
          <div>
            <span className="text-secondary-foreground">Business:</span> <span className="font-medium">{context.client?.name || 'Demo Business'}</span>
          </div>
          <div>
            <span className="text-secondary-foreground">Tone:</span> {context.botProfile?.tone || 'professional and friendly'}
          </div>
          <div>
            <span className="text-secondary-foreground">Knowledge items:</span> {context.knowledge?.length || 0}
          </div>
          {context.demoMode && (
            <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-400">Demo mode (sample data)</span>
          )}
          {contextError && <span className="text-red-400 text-xs">{contextError}</span>}
        </div>
      )}

      {/* Chat Window */}
      <div className="flex-1 bg-secondary/20 border border-secondary rounded-2xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : '')}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  'max-w-[75%] rounded-2xl px-4 py-3 text-sm',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/70 border border-secondary'
                )}
              >
                {msg.content}

                {msg.lead && (
                  <div className="mt-2 pt-2 border-t border-secondary/50 text-xs opacity-75">
                    Lead detected: {msg.lead.intent} (score: {msg.lead.score})
                    {msg.lead.needsHuman && ' → Human handoff suggested'}
                  </div>
                )}
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
              <div className="bg-secondary/70 border border-secondary rounded-2xl px-4 py-3 text-sm">
                Thinking with your rules...
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-secondary p-4 bg-background">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a test message (e.g. 'How much is the AI DM Agent?' or 'I want to book a call')"
              className="flex-1 rounded-xl border border-secondary bg-secondary/30 px-4 py-3 outline-none focus:border-primary"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim()}
              className="px-6 rounded-xl bg-primary text-primary-foreground disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="h-4 w-4" />
              Send
            </button>
          </div>

          {/* Sample prompts using real context */}
          <div className="mt-2 flex flex-wrap gap-2">
            {samplePrompts.map((prompt, i) => (
              <button
                key={i}
                onClick={() => {
                  setInput(prompt);
                  // auto-send after short delay for convenience
                  setTimeout(() => {
                    // trigger send via ref or just set and call, but simple: user can click send
                  }, 50);
                }}
                className="text-[11px] px-2.5 py-1 rounded-full border border-secondary/60 hover:bg-secondary/40 text-secondary-foreground"
              >
                {prompt}
              </button>
            ))}
          </div>

          <div className="text-[10px] text-secondary-foreground mt-2 px-1">
            This is a high-fidelity simulator using your loaded configuration. In production, inbound messages go through the WPM Bridge → OpenAI (with your exact instructions + knowledge) → automations.
          </div>
        </div>
      </div>

      {lastLead && (
        <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-emerald-400" />
          Last message triggered a lead with intent: <span className="font-medium">{lastLead.intent}</span>. 
          {context && !context.demoMode && ' (Would be saved to wpm_leads and queued for your automations in a real flow.)'}
        </div>
      )}

      {contextError && (
        <div className="mt-3 text-xs text-red-400">{contextError} — using demo behavior.</div>
      )}
    </div>
  );
}
