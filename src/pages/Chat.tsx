import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Bot, AlertCircle, Settings } from 'lucide-react';
import ChatMessage from '../components/ChatMessage';
import ChatInput from '../components/ChatInput';
import StatusIndicator from '../components/StatusIndicator';
import BotSelector from '../components/BotSelector';
import { startConversation, sendMessage } from '../lib/openai';
import { CanvasRevealEffect } from '../components/ui/CanvasEffect';
import { AIBot, getActiveBot, getBotAssistantId } from '../lib/supabase/bots';
import {
  createChatThread,
  getChatThread,
  getChatMessages,
  createChatMessage,
  updateChatThread,
} from '../lib/supabase/chat';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  images?: string[];
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<'online' | 'typing' | 'offline'>('online');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [openaiThreadId, setOpenaiThreadId] = useState<string | null>(null);
  const [currentBot, setCurrentBot] = useState<AIBot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { threadId: urlThreadId } = useParams();
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initializeChat = async () => {
      try {
        const activeBot = await getActiveBot();

        if (!activeBot) {
          setError('no-bot-configured');
          setStatus('offline');
          setLoading(false);
          return;
        }

        setCurrentBot(activeBot);

        if (urlThreadId) {
          const existingThread = await getChatThread(urlThreadId);
          if (existingThread) {
            setThreadId(existingThread.id);
            setOpenaiThreadId(existingThread.openai_thread_id);
            const chatMessages = await getChatMessages(existingThread.id);
            setMessages(
              chatMessages.map((msg) => ({
                id: msg.id,
                content: msg.content,
                isUser: msg.is_user,
                images: msg.images,
              }))
            );
            setLoading(false);
            return;
          }
        }

        const newOpenaiThreadId = await startConversation(activeBot.api_key);
        const newThread = await createChatThread(
          newOpenaiThreadId,
          'New Conversation',
          activeBot.id,
          activeBot.name
        );
        setThreadId(newThread.id);
        setOpenaiThreadId(newOpenaiThreadId);

        if (urlThreadId !== newThread.id) {
          navigate(`/chat/${newThread.id}`, { replace: true });
        }
      } catch (err) {
        setError('Chat initialization failed. Please check your bot configuration in Settings.');
        setStatus('offline');
      } finally {
        setLoading(false);
      }
    };

    initializeChat();
  }, [urlThreadId, navigate]);

  const handleSendMessage = async (content: string, images?: File[]) => {
    if (!threadId || !openaiThreadId || !currentBot) return;

    const imageUrls = images ? images.map((img) => URL.createObjectURL(img)) : undefined;

    // Create a temporary ID for optimistic UI update
    const tempUserId = `temp-user-${Date.now()}`;

    try {
      // Optimistically add user message to UI
      const userMessage: Message = {
        id: tempUserId,
        content,
        isUser: true,
        images: imageUrls,
      };

      setMessages(prev => [...prev, userMessage]);

      // Save user message to database and get the real ID
      const savedUserMessage = await createChatMessage(threadId, content, true, imageUrls);

      // Update the message with the real database ID
      setMessages(prev =>
        prev.map(msg => msg.id === tempUserId ? { ...msg, id: savedUserMessage.id } : msg)
      );

      if (messages.length === 0) {
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
        await updateChatThread(threadId, { title });
      }

      setStatus('typing');
      const assistantId = await getBotAssistantId(currentBot.assistant_id);

      if (!assistantId) {
        throw new Error('No Assistant ID configured. Please add an Assistant ID in Settings or in your bot configuration.');
      }

      const response = await sendMessage(
        openaiThreadId,
        content,
        assistantId,
        currentBot.api_key,
        images
      );

      if (response) {
        // Save assistant message to database and get the real ID
        const savedAssistantMessage = await createChatMessage(threadId, response, false);

        const assistantMessage: Message = {
          id: savedAssistantMessage.id,
          content: response,
          isUser: false,
        };

        // Use functional state update to avoid overwriting state
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Failed to get AI response:', error);

      // Remove the temporary message if it failed to save
      setMessages(prev => prev.filter(msg => msg.id !== tempUserId));

      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        content: 'Sorry, I encountered an error. Please check your bot configuration in Settings and try again.',
        isUser: false,
      };

      // Use functional state update for error message too
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setStatus('online');
    }
  };

  const handleBotChange = async (newBot: AIBot) => {
    try {
      setLoading(true);
      setMessages([]);
      setError(null);
      setCurrentBot(newBot);

      // Create a new thread with the new bot
      const newOpenaiThreadId = await startConversation(newBot.api_key);
      const newThread = await createChatThread(
        newOpenaiThreadId,
        'New Conversation',
        newBot.id,
        newBot.name
      );

      setThreadId(newThread.id);
      setOpenaiThreadId(newOpenaiThreadId);
      setStatus('online');

      navigate(`/chat/${newThread.id}`, { replace: true });
    } catch (err) {
      console.error('Failed to switch bot:', err);
      setError('Failed to switch bots. Please try again.');
      setStatus('offline');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-secondary-foreground">Loading chat...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className="relative w-full"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="relative flex w-full items-center justify-center p-3 md:p-4">
          <AnimatePresence>
            {hovered && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 h-full w-full hidden md:block"
              >
                <CanvasRevealEffect
                  animationSpeed={5}
                  containerClassName="bg-transparent opacity-30"
                  colors={[
                    [14, 165, 233],
                    [6, 182, 212],
                  ]}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="z-20 flex flex-col items-center w-full px-2">
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 mb-3 md:mb-4 w-full sm:w-auto justify-center">
              <div className="flex items-center gap-2">
                <div className="p-1.5 md:p-2 bg-primary/20 rounded-lg">
                  <Bot className="h-5 w-5 md:h-6 md:w-6 text-primary" />
                </div>
                <h1 className="text-xl md:text-2xl font-bold">AI Assistant</h1>
              </div>
              {currentBot && <BotSelector currentBot={currentBot} onBotChange={handleBotChange} />}
            </div>
            <StatusIndicator status={status} />
            {error && error === 'no-bot-configured' ? (
              <div className="mt-3 md:mt-4 p-3 md:p-4 bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 rounded-lg flex flex-col sm:flex-row items-start gap-3 max-w-md mx-2">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium mb-2">No AI bot configured</p>
                  <p className="text-sm mb-3">You need to add and activate an AI bot before you can start chatting.</p>
                  <Link
                    to="/settings"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    <Settings className="w-4 h-4" />
                    Go to Settings
                  </Link>
                </div>
              </div>
            ) : error ? (
              <div className="mt-3 md:mt-4 p-3 md:p-4 bg-red-500/10 text-red-500 rounded-lg flex items-center gap-2 max-w-md mx-2 text-sm md:text-base">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <ChatMessage
                content={message.content}
                isUser={message.isUser}
                images={message.images}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <ChatInput onSend={handleSendMessage} isLoading={status === 'typing'} apiKey={currentBot?.api_key} />
    </div>
  );
}
