/**
 * AppearanceSettings — "Tampilan & Aksesibilitas" tab.
 *
 * Hosts appearance preferences. Currently: dark mode toggle (themed switch).
 * Reads/writes the shared ThemeContext so the change applies app-wide and
 * persists to localStorage.
 */

import { useTheme } from '../../context/ThemeContext';
import { Icon } from '../ui/Icon';

interface ToggleRowProps {
  icon: string;
  label: string;
  desc: string;
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
}

function ToggleRow({ icon, label, desc, checked, onChange, ariaLabel }: ToggleRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        padding: '14px 16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ color: 'var(--text3)', display: 'flex' }}>
          <Icon name={icon} size={18} />
        </span>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text1)' }}>{label}</div>
          {desc && <div style={{ fontSize: '0.8rem', color: 'var(--text3)' }}>{desc}</div>}
        </div>
      </div>

      <button
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        onClick={onChange}
        style={{
          position: 'relative',
          width: '44px',
          height: '24px',
          borderRadius: '999px',
          border: 'none',
          cursor: 'pointer',
          flexShrink: 0,
          background: checked ? 'var(--accent)' : 'var(--border)',
          transition: 'background 0.18s ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: checked ? '22px' : '2px',
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
            transition: 'left 0.18s ease',
          }}
        />
      </button>
    </div>
  );
}

export function AppearanceSettings() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text1)', marginBottom: '4px' }}>
          Tampilan &amp; Aksesibilitas
        </h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text3)' }}>
          Sesuaikan tampilan aplikasi sesuai preferensi Anda.
        </p>
      </div>

      <div className="card" style={{ padding: '4px 0' }}>
        <ToggleRow
          icon={isDark ? 'moon' : 'sun'}
          label="Mode Gelap"
          desc="Aktifkan tema gelap untuk mengurangi silau di kondisi minim cahaya."
          checked={isDark}
          onChange={toggleTheme}
          ariaLabel={`Mode gelap: ${isDark ? 'aktif' : 'nonaktif'}`}
        />
      </div>
    </div>
  );
}
