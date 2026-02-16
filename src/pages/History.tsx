import React, { useState, useEffect } from 'react';
import { MessageSquare, Calendar, Search, Trash2, AlertCircle, Filter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { getChatThreads, deleteChatThread, deleteAllChatThreads, ChatThread } from '../lib/supabase/chat';
import { getBots, AIBot } from '../lib/supabase/bots';

export default function History() {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [bots, setBots] = useState<AIBot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [chatThreads, allBots] = await Promise.all([
        getChatThreads(),
        getBots()
      ]);
      setThreads(chatThreads);
      setBots(allBots);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredThreads = threads.filter((thread) => {
    const matchesSearch = thread.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBot = !selectedBotId || thread.bot_id === selectedBotId;
    return matchesSearch && matchesBot;
  });

  const getColorClass = (color: string) => {
    const colorMap: Record<string, string> = {
      cyan: 'bg-cyan-500',
      blue: 'bg-blue-500',
      green: 'bg-green-500',
      orange: 'bg-orange-500',
      pink: 'bg-pink-500',
      red: 'bg-red-500',
      yellow: 'bg-yellow-500',
      teal: 'bg-teal-500',
    };
    return colorMap[color] || 'bg-cyan-500';
  };

  const getIcon = (iconName: string) => {
    const IconComponent = (Icons as any)[iconName] || Icons.Bot;
    return <IconComponent className="w-4 h-4" />;
  };

  const getBotForThread = (thread: ChatThread) => {
    return bots.find(bot => bot.id === thread.bot_id);
  };

  const handleThreadClick = (thread: ChatThread) => {
    navigate(`/chat/${thread.id}`);
  };

  const handleDeleteAllThreads = async () => {
    try {
      await deleteAllChatThreads();
      setThreads([]);
      setShowDeleteConfirm(false);
    } catch (error) {
      console.error('Failed to delete all threads:', error);
    }
  };

  const handleDeleteThread = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    try {
      await deleteChatThread(threadId);
      await loadData();
    } catch (error) {
      console.error('Failed to delete thread:', error);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="text-secondary-foreground">Loading history...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      <div className="mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-bold mb-3 md:mb-4">Recent History</h1>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 md:gap-4">
          <div className="relative flex-1 sm:flex-initial sm:min-w-[240px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-foreground" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-10 pr-4 py-2.5 md:py-2 bg-secondary/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm md:text-base"
            />
          </div>

          {bots.length > 0 && (
            <div className="relative flex-1 sm:flex-initial sm:min-w-[180px]">
              <Filter className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary-foreground" />
              <select
                value={selectedBotId || ''}
                onChange={(e) => setSelectedBotId(e.target.value || null)}
                className="w-full pl-10 pr-8 py-2.5 md:py-2 bg-secondary/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none cursor-pointer text-sm md:text-base"
              >
                <option value="">All Bots</option>
                {bots.map((bot) => (
                  <option key={bot.id} value={bot.id}>
                    {bot.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {threads.length > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 md:py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors touch-manipulation text-sm md:text-base"
            >
              <Trash2 className="h-4 w-4" />
              <span>Delete All</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 md:space-y-4">
        <AnimatePresence>
          {filteredThreads.length > 0 ? (
            filteredThreads.map((thread) => (
              <motion.div
                key={thread.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                className="bg-secondary/50 rounded-lg p-3 md:p-4 hover:bg-secondary/70 active:bg-secondary/80 transition-colors cursor-pointer group touch-manipulation"
                onClick={() => handleThreadClick(thread)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 md:gap-3 flex-1 min-w-0">
                    <MessageSquare className="h-5 w-5 text-primary mt-0.5 md:mt-1 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                        <h3 className="font-medium truncate text-sm md:text-base">{thread.title}</h3>
                        {thread.bot_id && getBotForThread(thread) && (
                          <div className="flex items-center gap-1.5 px-2 py-0.5 md:py-1 bg-secondary rounded text-xs flex-shrink-0 w-fit">
                            <div className={`w-2 h-2 rounded-full ${getColorClass(getBotForThread(thread)!.color)}`} />
                            <span>{thread.bot_name}</span>
                            {getIcon(getBotForThread(thread)!.icon)}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 text-xs md:text-sm text-secondary-foreground">
                        <span>{new Date(thread.updated_at).toLocaleString()}</span>
                        <span className="hidden sm:inline">•</span>
                        <div className="flex items-center">
                          <Calendar className="h-3 w-3 md:h-4 md:w-4 mr-1" />
                          {new Date(thread.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteThread(e, thread.id)}
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2 text-red-500 hover:bg-red-500/10 active:bg-red-500/20 rounded-lg transition-all flex-shrink-0 touch-manipulation"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-center text-secondary-foreground py-8 text-sm md:text-base">
              {searchTerm ? 'No conversations found matching your search.' : 'No conversations yet.'}
            </div>
          )}
        </AnimatePresence>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-background rounded-lg p-4 md:p-6 max-w-md w-full"
          >
            <div className="flex items-center gap-2 md:gap-3 text-red-500 mb-3 md:mb-4">
              <AlertCircle className="h-5 w-5 md:h-6 md:w-6 flex-shrink-0" />
              <h2 className="text-lg md:text-xl font-semibold">Delete All Conversations</h2>
            </div>
            <p className="text-secondary-foreground mb-4 md:mb-6 text-sm md:text-base">
              Are you sure you want to delete all conversations? This action cannot be undone.
            </p>
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 md:gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2.5 md:py-2 bg-secondary hover:bg-secondary/70 active:bg-secondary/60 rounded-lg transition-colors touch-manipulation text-sm md:text-base"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAllThreads}
                className="px-4 py-2.5 md:py-2 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-lg transition-colors touch-manipulation text-sm md:text-base"
              >
                Delete All
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
