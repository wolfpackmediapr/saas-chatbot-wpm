import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Check, X, AlertCircle, CheckCircle } from 'lucide-react';
import * as Icons from 'lucide-react';
import {
  AIBot,
  getBots,
  createBot,
  updateBot,
  deleteBot,
  setActiveBot,
  BOT_COLORS,
  BOT_ICONS,
} from '../lib/supabase/bots';

export default function BotManagement() {
  const [bots, setBots] = useState<AIBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBot, setEditingBot] = useState<AIBot | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    assistant_id: '',
    api_key: '',
    color: 'cyan',
    icon: 'Bot',
    is_active: false,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadBots();
  }, []);

  const loadBots = async () => {
    try {
      const allBots = await getBots();
      setBots(allBots);
    } catch (error) {
      console.error('Failed to load bots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBot = () => {
    setEditingBot(null);
    setFormData({
      name: '',
      description: '',
      assistant_id: '',
      api_key: '',
      color: 'cyan',
      icon: 'Bot',
      is_active: bots.length === 0,
    });
    setShowModal(true);
  };

  const handleEditBot = (bot: AIBot) => {
    setEditingBot(bot);
    setFormData({
      name: bot.name,
      description: bot.description || '',
      assistant_id: bot.assistant_id,
      api_key: bot.api_key || '',
      color: bot.color,
      icon: bot.icon,
      is_active: bot.is_active,
    });
    setShowModal(true);
  };

  const handleSaveBot = async () => {
    if (!formData.name) {
      return;
    }

    setSaving(true);
    try {
      if (editingBot) {
        await updateBot(editingBot.id, {
          name: formData.name,
          description: formData.description || null,
          assistant_id: formData.assistant_id || null,
          api_key: formData.api_key || null,
          color: formData.color,
          icon: formData.icon,
          is_active: formData.is_active,
        });
      } else {
        await createBot({
          name: formData.name,
          description: formData.description,
          assistant_id: formData.assistant_id || null,
          api_key: formData.api_key || null,
          color: formData.color,
          icon: formData.icon,
          is_active: formData.is_active,
        });
      }
      await loadBots();
      setShowModal(false);
    } catch (error) {
      console.error('Failed to save bot:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBot = async (botId: string) => {
    if (!confirm('Are you sure you want to delete this bot?')) {
      return;
    }

    try {
      await deleteBot(botId);
      await loadBots();
    } catch (error) {
      console.error('Failed to delete bot:', error);
    }
  };

  const handleSetActive = async (botId: string) => {
    try {
      await setActiveBot(botId);
      await loadBots();
    } catch (error) {
      console.error('Failed to set active bot:', error);
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

  const getIcon = (iconName: string, className: string = 'w-5 h-5') => {
    const IconComponent = (Icons as any)[iconName] || Icons.Bot;
    return <IconComponent className={className} />;
  };

  if (loading) {
    return <div className="animate-pulse">Loading bots...</div>;
  }

  const hasActiveBot = bots.some(bot => bot.is_active);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">AI Bots</h3>
        <button
          onClick={handleAddBot}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Bot
        </button>
      </div>

      {!hasActiveBot && bots.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium mb-1">No Active Bot Selected</p>
            <p className="text-sm opacity-90">Click "Set as Active" on one of your bots below to start chatting.</p>
          </div>
        </div>
      )}

      {bots.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No bots configured. Add your first bot to get started.
        </div>
      ) : (
        <div className="grid gap-4">
          {bots.map((bot) => (
            <div
              key={bot.id}
              className={`rounded-lg p-4 flex items-start gap-4 transition-all ${
                bot.is_active
                  ? 'bg-primary/10 border-2 border-primary/30 shadow-lg'
                  : 'bg-secondary/30 border-2 border-transparent'
              }`}
            >
              <div className={`w-3 h-3 rounded-full ${getColorClass(bot.color)} mt-1 flex-shrink-0`} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h4 className="font-semibold">{bot.name}</h4>
                  {getIcon(bot.icon, 'w-4 h-4')}
                  {bot.is_active && (
                    <span className="flex items-center gap-1 text-xs bg-green-500/20 text-green-600 dark:text-green-400 px-2 py-0.5 rounded font-medium">
                      <CheckCircle className="w-3 h-3" />
                      Active Bot
                    </span>
                  )}
                </div>
                {bot.description && (
                  <p className="text-sm text-muted-foreground mb-2">{bot.description}</p>
                )}
                <p className="text-xs text-muted-foreground font-mono truncate">
                  {bot.assistant_id || '(using global assistant ID)'}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {!bot.is_active && (
                  <button
                    onClick={() => handleSetActive(bot.id)}
                    className="flex items-center gap-1 px-3 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-600 dark:text-green-400 rounded-lg transition-colors text-sm font-medium"
                    title="Set as active bot"
                  >
                    <Check className="w-4 h-4" />
                    Set Active
                  </button>
                )}
                <button
                  onClick={() => handleEditBot(bot)}
                  className="p-2 hover:bg-secondary rounded-lg transition-colors"
                  title="Edit bot"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteBot(bot.id)}
                  className="p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                  title="Delete bot"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {editingBot ? 'Edit Bot' : 'Add New Bot'}
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 hover:bg-secondary rounded transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-secondary rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Customer Support Bot"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-secondary rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 min-h-[80px]"
                    placeholder="Handles customer support inquiries"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">OpenAI Assistant ID (Optional)</label>
                  <input
                    type="text"
                    value={formData.assistant_id}
                    onChange={(e) => setFormData({ ...formData, assistant_id: e.target.value })}
                    className="w-full bg-secondary rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm"
                    placeholder="asst_... (uses global ID if empty)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">API Key Override (Optional)</label>
                  <input
                    type="password"
                    value={formData.api_key}
                    onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                    className="w-full bg-secondary rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm"
                    placeholder="sk-... (uses global key if empty)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Color</label>
                  <div className="grid grid-cols-4 gap-2">
                    {BOT_COLORS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => setFormData({ ...formData, color: color.value })}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          formData.color === color.value
                            ? 'border-primary scale-105'
                            : 'border-secondary hover:border-primary/50'
                        }`}
                      >
                        <div className={`w-full h-6 rounded ${color.class}`} />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Icon</label>
                  <div className="grid grid-cols-4 gap-2">
                    {BOT_ICONS.map((iconName) => (
                      <button
                        key={iconName}
                        onClick={() => setFormData({ ...formData, icon: iconName })}
                        className={`p-3 rounded-lg border-2 transition-all flex items-center justify-center ${
                          formData.icon === iconName
                            ? 'border-primary scale-105'
                            : 'border-secondary hover:border-primary/50'
                        }`}
                      >
                        {getIcon(iconName)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <label htmlFor="is_active" className="text-sm">
                    Set as active bot
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveBot}
                  disabled={saving || !formData.name}
                  className="flex-1 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingBot ? 'Update Bot' : 'Add Bot'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
