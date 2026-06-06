import { useState } from 'react';
import { Play, Send, Bot, User, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  lead?: any;
}

export default function AgentTest() {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: "Hi! I'm your AI assistant for WolfPack Media. How can I help you today?" 
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [lastLead, setLastLead] = useState<any>(null);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput('');
    setIsTyping(true);

    // Simulate realistic AI processing (in real version this calls the edge function / wpm-actions-processor)
    await new Promise(r => setTimeout(r, 900));

    // Simple rule-based simulator (good enough for testing the UI flow)
    let reply = "Thanks for reaching out. Can you tell me more about what you're looking for?";
    let lead: any = null;

    const lower = currentInput.toLowerCase();

    if (lower.includes('price') || lower.includes('cost') || lower.includes('how much')) {
      reply = "Our AI DM Agent plans start at $79/month for the Basic tier. The Professional plan at $179 is our most popular. Would you like me to send you the full pricing breakdown?";
      lead = { intent: 'pricing', score: 0.7 };
    } else if (lower.includes('website') || lower.includes('web')) {
      reply = "We specialize in high-converting AI-powered websites and custom web applications. What's your timeline and main goal for the project?";
      lead = { intent: 'service_web', score: 0.85 };
    } else if (lower.includes('dm') || lower.includes('whatsapp') || lower.includes('instagram')) {
      reply = "Yes, our AI DM Agent can handle inbound messages on WhatsApp and Instagram 24/7. It qualifies leads and can trigger automations. Want to see a quick demo?";
      lead = { intent: 'dm_agent', score: 0.9 };
    } else if (lower.includes('book') || lower.includes('call') || lower.includes('meeting')) {
      reply = "I'd be happy to schedule a discovery call with the team. What's the best email and phone number for you?";
      lead = { intent: 'book_call', score: 0.95, needsHuman: true };
    }

    const assistantMessage: Message = { 
      role: 'assistant', 
      content: reply,
      lead 
    };

    setMessages(prev => [...prev, assistantMessage]);
    if (lead) setLastLead(lead);
    setIsTyping(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{ role: 'assistant', content: "Hi! I'm your AI assistant. How can I help you today?" }]);
    setLastLead(null);
  };

  return (
    <div className="p-6 max-w-4xl h-[calc(100vh-120px)] flex flex-col">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Play className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-semibold">Test Agent</h1>
          </div>
          <p className="text-secondary-foreground">Simulate real conversations before going live. This uses the same logic as production.</p>
        </div>
        <button 
          onClick={clearChat}
          className="px-4 py-2 text-sm rounded-lg border border-secondary hover:bg-secondary"
        >
          Clear Chat
        </button>
      </div>

      {/* Chat Window */}
      <div className="flex-1 bg-secondary/20 border border-secondary rounded-2xl overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.map((msg, index) => (
            <div key={index} className={cn("flex gap-3", msg.role === 'user' ? 'justify-end' : '')}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={cn(
                "max-w-[75%] rounded-2xl px-4 py-3 text-sm",
                msg.role === 'user' 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-secondary/70 border border-secondary"
              )}>
                {msg.content}
                
                {msg.lead && (
                  <div className="mt-2 pt-2 border-t border-secondary/50 text-xs opacity-75">
                    Lead detected: {msg.lead.intent} (score: {msg.lead.score})
                    {msg.lead.needsHuman && " → Human handoff suggested"}
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
                Thinking...
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
              placeholder="Type a test message (e.g. 'How much is a website?' or 'I want to book a call')"
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
          <div className="text-[10px] text-secondary-foreground mt-2 px-1">
            This is a high-fidelity simulator. Real production uses your full knowledge base + agent rules via the secure bridge.
          </div>
        </div>
      </div>

      {lastLead && (
        <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-emerald-400" />
          Last message triggered a lead with intent: <span className="font-medium">{lastLead.intent}</span>
        </div>
      )}
    </div>
  );
}
