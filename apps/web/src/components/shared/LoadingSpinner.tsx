import { Loader2 } from 'lucide-react';

export function LoadingSpinner({ size = 24 }: { size?: number }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px',
      color: 'var(--accent)',
    }}>
      <Loader2 size={size} className="animate-spin" />
    </div>
  );
}

export function PageLoading() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '80px 20px',
      gap: '16px',
      color: 'var(--text-secondary)',
    }}>
      <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent)' }} />
      <span style={{ fontSize: '0.875rem' }}>Loading...</span>
    </div>
  );
}
