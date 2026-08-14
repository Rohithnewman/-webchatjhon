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
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { cx } from "../../lib/cx";
import styles from "./Toast.module.css";

export type ToastTone = "success" | "error";

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  /** Confirms an action in the same words the control used. */
  success: (message: string) => void;
  /** States what went wrong and, where possible, what to do about it. */
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

const DISMISS_AFTER_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef<number[]>([]);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, tone, message }]);
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, DISMISS_AFTER_MS);
    timers.current.push(timer);
  }, []);

  // Timers outlive the toasts they dismiss if the tree unmounts mid-flight.
  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={cx(styles.toast, styles[toast.tone])}>
            {toast.tone === "success" ? (
              <CheckCircle2 size={17} aria-hidden />
            ) : (
              <AlertTriangle size={17} aria-hidden />
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
