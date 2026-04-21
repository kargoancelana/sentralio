import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Link2,
  Settings,
  Warehouse,
} from 'lucide-react';
import './Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navGroups = [
  {
    label: 'MAIN',
    items: [
      { to: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    ],
  },
  {
    label: 'PRODUK',
    items: [
      { to: '/produk/master', icon: <Package size={20} />, label: 'Master Produk' },
      { to: '/produk/channel', icon: <ShoppingBag size={20} />, label: 'Produk Channel' },
    ],
  },
  {
    label: 'INTEGRASI',
    items: [
      { to: '/integrasi/shopee', icon: <Link2 size={20} />, label: 'Shopee' },
    ],
  },
  {
    label: 'OTHERS',
    items: [
      { to: '/settings', icon: <Settings size={20} />, label: 'Settings' },
    ],
  },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <Warehouse size={20} />
          </div>
          <span className="sidebar-logo-text">WMS Sync</span>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          {navGroups.map(group => (
            <div key={group.label} className="sidebar-group">
              <div className="sidebar-group-label">{group.label}</div>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <span className="sidebar-link-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <span className="sidebar-version">WMS Sync v1.0.0</span>
        </div>
      </aside>
    </>
  );
}
