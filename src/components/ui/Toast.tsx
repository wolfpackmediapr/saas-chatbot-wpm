import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, UserCheck, UserPlus, AlertCircle, CheckCircle2, X } from 'lucide-react';
import { cn } from '../../lib/utils';

export type ToastKind = 'message' | 'handoff' | 'lead' | 'success' | 'error';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  /** Where clicking the toast takes you. */
  href?: string;
  /** ms before it dismisses itself. 0 keeps it until dismissed. */
  duration?: number;
}

interface ToastContextValue {
  notify: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}

const KIND_STYLES: Record<
  ToastKind,
  { icon: React.ComponentType<{ className?: string }>; accent: string; ring: string }
> = {
  message: { icon: MessageCircle, accent: 'text-primary', ring: 'ring-primary/30' },
  handoff: { icon: UserCheck, accent: 'text-orange-500', ring: 'ring-orange-500/30' },
  lead: { icon: UserPlus, accent: 'text-green-500', ring: 'ring-green-500/30' },
  success: { icon: CheckCircle2, accent: 'text-green-500', ring: 'ring-green-500/30' },
  error: { icon: AlertCircle, accent: 'text-red-500', ring: 'ring-red-500/30' },
};

const DEFAULT_DURATION = 6000;
/** Keeps a burst of activity from burying the screen. */
const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((current) => [{ ...toast, id }, ...current].slice(0, MAX_VISIBLE));

      const duration = toast.duration ?? DEFAULT_DURATION;
      if (duration > 0) {
        const timer = window.setTimeout(() => dismiss(id), duration);
        timers.current.set(id, timer);
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const { icon: Icon, accent, ring } = KIND_STYLES[toast.kind];

  const content = (
    <div className="flex items-start gap-3">
      <Icon className={cn('mt-0.5 h-5 w-5 flex-shrink-0', accent)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-snug">{toast.title}</p>
        {toast.body && (
          <p className="mt-0.5 line-clamp-2 text-xs text-secondary-foreground">{toast.body}</p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDismiss(toast.id);
        }}
        className="rounded p-1 text-secondary-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 24, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 24, scale: 0.98 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'pointer-events-auto rounded-xl border border-secondary bg-background p-3 shadow-lg ring-1',
        ring,
      )}
    >
      {toast.href ? (
        <a href={toast.href} className="block no-underline text-foreground">
          {content}
        </a>
      ) : (
        content
      )}
    </motion.div>
  );
}
