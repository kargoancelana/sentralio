import { Link } from 'react-router-dom';
import { Icon } from '../ui/Icon';
import { Avatar } from '../ui/Avatar';

const navItems = [
  { id: 'dashboard',    label: 'Dashboard',        icon: 'dashboard',    path: '/', badge: null },
  { id: 'header-produk', label: 'PRODUK', isHeader: true },
  { id: 'master',       label: 'Master Produk',    icon: 'master',       path: '/produk/master', badge: null },
  { id: 'channel',      label: 'Produk Channel',   icon: 'products',     path: '/produk/channel', badge: null },
  { id: 'header-toko', label: 'WORKFLOW', isHeader: true },
  { id: 'integrations', label: 'Integrasi Toko', icon: 'integrations', path: '/integrasi/shopee', badge: null },
  { id: 'header-system', label: 'SYSTEM', isHeader: true },
  { id: 'settings',     label: 'Pengaturan',       icon: 'settings',     path: '/settings', badge: null },
];

interface SidebarProps {
  active: string;
  collapsed: boolean;
  setCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  dark: boolean;
  toggleDark: () => void;
}

export function Sidebar({ active, collapsed, setCollapsed, dark, toggleDark }: SidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* User */}
      <div className={`sb-user ${collapsed ? 'collapsed' : ''}`} style={collapsed ? { justifyContent: 'center', padding: '15px 0 11px 0' } : {}}>
        {!collapsed && <Avatar initials="WA" color="#111827" size={34} />}
        {!collapsed && (
          <div className="sb-user-info">
            <div className="sb-user-name">Warehouse Admin</div>
            <div className="sb-user-role">admin@warung.co.id</div>
          </div>
        )}
        <button className="ic-btn" onClick={() => setCollapsed(c => !c)} title="Toggle sidebar">
          <Icon name="menu" size={14} />
        </button>
      </div>

      {/* Nav */}
      <nav className="sb-nav">
        {navItems.map((item) => {
          if (item.isHeader) {
             return !collapsed ? <div key={item.id} className="sb-section-label" style={{ marginTop: item.id !== 'header-produk' ? 12 : 0 }}>{item.label}</div> : null;
          }
          return (
            <Link
              key={item.id}
              to={item.path!}
              className={`nav-btn ${active === item.id ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
              style={{ textDecoration: 'none' }}
            >
              <Icon name={item.icon!} size={16} />
              {!collapsed && <span className="nav-label">{item.label}</span>}
              {!collapsed && item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sb-footer">
        <button className="nav-btn" onClick={toggleDark} title="Toggle theme">
          <Icon name={dark ? 'sun' : 'moon'} size={16} />
          {!collapsed && <span className="nav-label">{dark ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>
        <button className="nav-btn" title={collapsed ? 'Help' : undefined}>
          <Icon name="help" size={16} />
          {!collapsed && <span className="nav-label">Bantuan</span>}
        </button>
      </div>
    </aside>
  );
}
