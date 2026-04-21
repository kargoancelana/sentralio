import { PackageOpen } from 'lucide-react';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({
  title = 'No data',
  message = 'There is nothing to display here yet.',
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '64px 20px',
      gap: '12px',
      textAlign: 'center',
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>
        {icon || <PackageOpen size={40} />}
      </div>
      <h4 style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{title}</h4>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: '360px' }}>{message}</p>
      {action && <div style={{ marginTop: '8px' }}>{action}</div>}
    </div>
  );
}
