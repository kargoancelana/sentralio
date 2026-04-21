import './StatusBadge.css';

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
  label: string;
  variant?: BadgeVariant;
}

const variantMap: Record<string, BadgeVariant> = {
  success: 'success',
  synced: 'success',
  connected: 'success',
  pending: 'warning',
  failed: 'error',
  error: 'error',
  disconnected: 'error',
  expired: 'error',
  partial: 'warning',
};

export function StatusBadge({ label, variant }: StatusBadgeProps) {
  const resolvedVariant = variant || variantMap[label.toLowerCase()] || 'neutral';

  return (
    <span className={`status-badge status-badge--${resolvedVariant}`}>
      <span className="status-badge-dot" />
      {label}
    </span>
  );
}
