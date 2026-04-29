import { useState, useCallback, createContext, useContext } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

interface Toast {
  id: number;
  msg: string;
  type: 'success' | 'error' | 'warn' | 'info';
  autoDismiss: boolean;
}

type ToastFunction = (msg: string, type?: 'success' | 'error' | 'warn' | 'info') => void;

export const ToastContext = createContext<ToastFunction | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((msg: string, type: 'success' | 'error' | 'warn' | 'info' = 'success') => {
    const id = Date.now();
    const autoDismiss = type === 'success' || type === 'info'; // Auto-dismiss success and info, keep error and warn
    
    setToasts(t => [...t, { id, msg, type, autoDismiss }]);
    
    // Only auto-dismiss if configured
    if (autoDismiss) {
      const dismissDelay = type === 'success' ? 3000 : 3500; // Success: 3000ms, Info: 3500ms
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), dismissDelay);
    }
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
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
            <span style={{ flex: 1 }}>{t.msg}</span>
            {!t.autoDismiss && (
              <button
                onClick={() => dismiss(t.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  color: 'inherit',
                  opacity: 0.7,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
                aria-label="Dismiss notification"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
