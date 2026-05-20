import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';

const pageMeta: Record<string, { label: string }> = {
  dashboard:    { label: 'Dashboard' },
  integrations: { label: 'Integrasi Toko' },
  channel:      { label: 'Produk Channel' },
  master:       { label: 'Master Produk' },
  settings:     { label: 'Pengaturan' },
  orders:       { label: 'Pesanan Saya' },
};

export function TopBar({ active }: { active: string }) {
  const meta = pageMeta[active] || {};

  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="bc-root">WMS</span>
        <span className="bc-sep">›</span>
        <span className="bc-curr">{meta.label}</span>
      </div>
      <div className="topbar-right">

        <button className="ic-btn" style={{ position: 'relative' }}>
          <Icon name="bell" size={16} />
          <span style={{
            position: 'absolute', top: 5, right: 5,
            width: 6, height: 6, borderRadius: '50%',
            background: '#EF4444', border: '2px solid var(--bg)',
          }} />
        </button>
        <Avatar initials="WA" color="#374151" size={30} />
      </div>
    </header>
  );
}
