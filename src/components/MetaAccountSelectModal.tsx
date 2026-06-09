import React from 'react';
import { X, Facebook, Instagram } from 'lucide-react';
import { cn } from '../lib/utils';

export interface MetaPage {
  id: string;
  name: string;
  category: string;
  instagram: { id: string; username: string } | null;
}

interface Props {
  pages: MetaPage[];
  isSaving: boolean;
  onConnect: (selectedPageIds: string[]) => void;
  onCancel: () => void;
}

export default function MetaAccountSelectModal({ pages, isSaving, onConnect, onCancel }: Props) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const toggle = (pageId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });
  };

  const count = selected.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-[#1a1f2e] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/10">
          <div>
            <h2 className="text-lg font-semibold">Select Accounts to Connect</h2>
            <p className="text-sm text-secondary-foreground mt-1">
              Choose which Facebook Pages and Instagram Business Accounts you want to connect:
            </p>
          </div>
          <button
            onClick={onCancel}
            className="ml-4 p-1.5 rounded-lg hover:bg-white/10 transition-colors text-secondary-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Page list */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {pages.map((page) => {
            const isSelected = selected.has(page.id);
            return (
              <button
                key={page.id}
                onClick={() => toggle(page.id)}
                className={cn(
                  "w-full text-left rounded-xl border-2 transition-all",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-white/10 bg-white/5 hover:border-white/20"
                )}
              >
                {/* Page header row */}
                <div className="flex items-center justify-between px-4 pt-4 pb-3">
                  <span className="font-semibold text-sm">{page.name}</span>
                  <div
                    className={cn(
                      "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                      isSelected ? "border-primary bg-primary" : "border-white/30"
                    )}
                  >
                    {isSelected && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Channels */}
                <div className="px-3 pb-3 space-y-1.5">
                  {/* Facebook */}
                  <div className="flex items-center gap-2.5 bg-black/30 rounded-lg px-3 py-2">
                    <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                      <Facebook className="h-3.5 w-3.5 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium leading-tight">{page.name}</div>
                      <div className="text-xs text-secondary-foreground">Facebook</div>
                    </div>
                  </div>

                  {/* Instagram (if linked) */}
                  {page.instagram && (
                    <div className="flex items-center gap-2.5 bg-black/30 rounded-lg px-3 py-2">
                      <div className="w-7 h-7 rounded-full bg-pink-600/20 flex items-center justify-center flex-shrink-0">
                        <Instagram className="h-3.5 w-3.5 text-pink-400" />
                      </div>
                      <div>
                        <div className="text-sm font-medium leading-tight">
                          {page.instagram.username ? `@${page.instagram.username}` : page.name}
                        </div>
                        <div className="text-xs text-secondary-foreground">Instagram</div>
                      </div>
                    </div>
                  )}

                  {/* No Instagram notice */}
                  {!page.instagram && (
                    <div className="flex items-center gap-2.5 bg-black/20 rounded-lg px-3 py-2 opacity-40">
                      <div className="w-7 h-7 rounded-full bg-pink-600/10 flex items-center justify-center flex-shrink-0">
                        <Instagram className="h-3.5 w-3.5 text-pink-400" />
                      </div>
                      <div className="text-xs text-secondary-foreground">No linked Instagram Business Account</div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl text-sm font-medium border border-white/20 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConnect(Array.from(selected))}
            disabled={count === 0 || isSaving}
            className={cn(
              "px-5 py-2.5 rounded-xl text-sm font-medium transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "disabled:opacity-40 disabled:cursor-not-allowed"
            )}
          >
            {isSaving ? 'Connecting...' : `Connect Selected${count > 0 ? ` (${count})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
