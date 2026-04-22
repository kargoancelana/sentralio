import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

export const ToastContext = createContext<any>(null);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<any[]>([]);

  const push = useCallback((msg: string, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  const icons: Record<string, React.ReactNode> = {
    success: <CheckCircle2 size={16} color="#10B981" />,
    error: <XCircle size={16} color="#EF4444" />,
    warn: <AlertTriangle size={16} color="#F59E0B" />,
    info: <Info size={16} color="#3B82F6" />
  };

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            <span className="toast-icon" style={{ display: 'flex', alignItems: 'center' }}>
              {icons[t.type] || icons.success}
            </span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
