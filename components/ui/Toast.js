'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastCtx = createContext(null);

const ICONS = {
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
};

const COLORS = {
  success: 'text-signal-green',
  warning: 'text-signal-amber',
  info: 'text-signal-blue',
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const push = useCallback((message, type = 'success') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3200);
  }, []);

  const dismiss = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 items-center w-full px-4 pointer-events-none">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div
              key={t.id}
              className="animate-rise pointer-events-auto flex items-center gap-2 rounded-xl border border-ink-border bg-ink-800 px-4 py-2.5 shadow-panel max-w-sm"
            >
              <Icon size={16} className={COLORS[t.type]} />
              <span className="text-sm text-paper-100 font-body">{t.message}</span>
              <button onClick={() => dismiss(t.id)} className="text-paper-500 hover:text-paper-100 ml-1">
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
