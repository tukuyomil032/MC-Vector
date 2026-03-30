import {
  createContext,
  type FC,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import Toast from './Toast';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastContextValue {
  showToast: (message: string, type?: ToastKind) => void;
}

interface ToastItem {
  id: number;
  message: string;
  type: ToastKind;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastKind = 'info') => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), message, type }]);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
