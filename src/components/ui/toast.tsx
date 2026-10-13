"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Flash, type FlashTone } from "./flash";

interface ToastItem {
  id: number;
  tone: FlashTone;
  message: ReactNode;
}

interface ToastApi {
  show: (message: ReactNode, tone?: FlashTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** How long a toast stays: errors linger so they can be read. */
const DURATION_MS: Record<FlashTone, number> = {
  success: 4000,
  info: 4000,
  accent: 4000,
  warning: 6000,
  error: 8000,
};

/**
 * Transient confirmations in the bottom-right corner. Mount `ToastProvider`
 * once; call `useToast().show("Saved")` anywhere below it. Each toast is the
 * same `Flash` as the inline banner, announced through its own role.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: ReactNode, tone: FlashTone = "success") => {
      const id = nextId.current++;
      setItems((current) => [...current, { id, tone, message }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS[tone]),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 print:hidden">
        {items.map((item) => (
          <div key={item.id} className="pointer-events-auto shadow-lg">
            <Flash tone={item.tone} onDismiss={() => dismiss(item.id)}>
              {item.message}
            </Flash>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>.");
  return api;
}
