import React from 'react';

export interface ProgressBarProps {
  /** Current progress value (0-100) */
  value: number;
  /** Maximum value (default: 100) */
  max?: number;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
  /** Color variant */
  variant?: 'primary' | 'success' | 'warning' | 'error';
  /** Show percentage text */
  showPercentage?: boolean;
  /** Show current/total counts */
  showCounts?: boolean;
  /** Current count */
  current?: number;
  /** Total count */
  total?: number;
  /** Additional label text */
  label?: string;
  /** Custom className */
  className?: string;
  /** Animated progress bar */
  animated?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  variant = 'primary',
  showPercentage = false,
  showCounts = false,
  current,
  total,
  label,
  className = '',
  animated = true
}: ProgressBarProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  
  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };
  
  const variantClasses = {
    primary: 'bg-blue-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500'
  };

  return (
    <div className={`progress-container ${className}`}>
      {(label || showPercentage || showCounts) && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
          fontSize: 12,
          color: 'var(--text3)'
        }}>
          {label && <span>{label}</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {showCounts && current !== undefined && total !== undefined && (
              <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                {current} / {total}
              </span>
            )}
            {showPercentage && (
              <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                {Math.round(percentage)}%
              </span>
            )}
          </div>
        </div>
      )}
      
      <div 
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || `Progress: ${Math.round(percentage)}%`}
        style={{
          width: '100%',
          height: size === 'sm' ? 4 : size === 'md' ? 6 : 8,
          backgroundColor: 'var(--bg3)',
          borderRadius: 3,
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        <div
          style={{
            width: `${percentage}%`,
            height: '100%',
            backgroundColor: 'var(--accent)',
            transition: animated ? 'width 0.3s ease-in-out' : 'none',
            borderRadius: 3
          }}
        />
        
        {animated && percentage > 0 && percentage < 100 && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
              animation: 'progress-shimmer 1.5s infinite',
              borderRadius: 3
            }}
          />
        )}
      </div>
      
      <style jsx>{`
        @keyframes progress-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

export default ProgressBar;