import React, { useState, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import * as Icons from 'lucide-react';
import { AIBot, getBots, setActiveBot } from '../lib/supabase/bots';

interface BotSelectorProps {
  currentBot: AIBot | null;
  onBotChange: (bot: AIBot) => void;
}

export default function BotSelector({ currentBot, onBotChange }: BotSelectorProps) {
  const [bots, setBots] = useState<AIBot[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadBots();
  }, []);

  const loadBots = async () => {
    try {
      const allBots = await getBots();
      setBots(allBots);
    } catch (error) {
      console.error('Failed to load bots:', error);
    }
  };

  const handleSelectBot = async (bot: AIBot) => {
    if (bot.id === currentBot?.id) {
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      await setActiveBot(bot.id);
      onBotChange(bot);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to set active bot:', error);
    } finally {
      setLoading(false);
    }
  };

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

  if (!currentBot) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 md:py-2 rounded-lg bg-secondary/50 hover:bg-secondary active:bg-secondary/70 transition-colors disabled:opacity-50 touch-manipulation text-xs md:text-sm"
      >
        <div className={`w-2 h-2 rounded-full ${getColorClass(currentBot.color)} flex-shrink-0`} />
        <span className="font-medium truncate max-w-[100px] md:max-w-none">{currentBot.name}</span>
        {getIcon(currentBot.icon)}
        <ChevronDown className={`w-3 h-3 md:w-4 md:h-4 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full mt-2 right-0 w-72 md:w-64 bg-background border border-secondary rounded-lg shadow-lg z-20 overflow-hidden max-h-[70vh] overflow-y-auto">
            <div className="p-2 space-y-1">
              {bots.map((bot) => (
                <button
                  key={bot.id}
                  onClick={() => handleSelectBot(bot)}
                  disabled={loading}
                  className="w-full flex items-center gap-2 md:gap-3 px-3 py-2.5 md:py-2 rounded-lg hover:bg-secondary/50 active:bg-secondary/70 transition-colors disabled:opacity-50 text-left touch-manipulation"
                >
                  <div className={`w-2 h-2 rounded-full ${getColorClass(bot.color)} flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{bot.name}</span>
                      {getIcon(bot.icon)}
                    </div>
                    {bot.description && (
                      <p className="text-xs text-muted-foreground truncate">{bot.description}</p>
                    )}
                  </div>
                  {bot.id === currentBot.id && (
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
