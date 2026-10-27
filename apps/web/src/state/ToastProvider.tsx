import { X } from 'lucide-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type Tone, toneIcon } from '../components/ui/tones';
import { cx } from '../components/ui/cx';

export interface ToastOptions {
  tone: Extract<Tone, 'success' | 'warning' | 'error' | 'info'>;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  /** Milliseconds; 0 keeps it until dismissed. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

type ToastFn = (options: ToastOptions) => void;

const ToastContext = createContext<ToastFn | null>(null);

const TONE_CLASSES: Record<ToastOptions['tone'], string> = {
  success: 'text-success-strong',
  warning: 'text-warning-strong',
  error: 'text-error-strong',
  info: 'text-text',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setToasts((list) => list.filter((t) => t.id !== id)),
    [],
  );

  const toast = useCallback<ToastFn>(
    (options) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { ...options, id }]);
      const duration = options.duration ?? (options.action ? 10_000 : 6_000);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-full max-w-sm flex-col gap-3"
      >
        {toasts.map((item) => {
          const Icon = toneIcon(item.tone);
          return (
            <div
              key={item.id}
              role={item.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-text"
            >
              <Icon
                size={18}
                aria-hidden="true"
                className={cx('mt-0.5 shrink-0', TONE_CLASSES[item.tone])}
              />
              <div className="min-w-0 flex-1">
                <p className="text-control font-medium">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-support text-muted">{item.description}</p>
                )}
                {item.action && (
                  <button
                    type="button"
                    className="mt-2 rounded-lg text-control font-medium text-text underline underline-offset-4"
                    onClick={() => {
                      item.action!.onClick();
                      dismiss(item.id);
                    }}
                  >
                    {item.action.label}
                  </button>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                className="rounded-md p-1 text-muted hover:text-text"
                onClick={() => dismiss(item.id)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastFn {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside <ToastProvider>');
  return toast;
}
