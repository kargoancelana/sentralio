import type { ReactNode } from 'react';
import './StatCard.css';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: { value: string; type: 'positive' | 'negative' | 'neutral' };
}

export function StatCard({ label, value, icon, trend }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <span className="stat-card-label">{label}</span>
        {icon && <div className="stat-card-icon">{icon}</div>}
      </div>
      <div className="stat-card-value">{value}</div>
      {trend && (
        <span className={`stat-card-trend ${trend.type}`}>
          {trend.value}
        </span>
      )}
    </div>
  );
}
