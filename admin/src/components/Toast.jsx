import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, X, Undo2 } from 'lucide-react';

const ToastContext = createContext(null);

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const ACCENTS = {
  success: 'text-emerald-500',
  error: 'text-red-500',
  info: 'text-condor-600',
};

let idSeq = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  /**
   * addToast(message, { type, duration, actionLabel, onAction })
   * `onAction` típicamente implementa "Deshacer" (ej. revertir un cambio de estado optimista).
   */
  const addToast = useCallback(
    (message, opts = {}) => {
      const id = ++idSeq;
      const { type = 'info', duration = 5000, actionLabel, onAction } = opts;
      setToasts((prev) => [...prev, { id, message, type, actionLabel, onAction }]);
      if (duration > 0) {
        timers.current[id] = setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ addToast, dismiss }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[200] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div
              key={t.id}
              className="pointer-events-auto bg-white border border-gray-200 rounded-xl shadow-lg px-4 py-3 flex items-start gap-3 animate-[toastIn_.18s_ease-out]"
            >
              <Icon size={18} className={`shrink-0 mt-0.5 ${ACCENTS[t.type] || ACCENTS.info}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 leading-snug">{t.message}</p>
                {t.actionLabel && t.onAction && (
                  <button
                    onClick={() => {
                      t.onAction();
                      dismiss(t.id);
                    }}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-condor-700 hover:text-condor-900"
                  >
                    <Undo2 size={12} />
                    {t.actionLabel}
                  </button>
                )}
              </div>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors"
                aria-label="Cerrar notificación"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
