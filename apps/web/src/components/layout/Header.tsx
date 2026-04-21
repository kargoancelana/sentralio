import { useLocation } from 'react-router-dom';
import { Menu, Home } from 'lucide-react';
import { ThemeToggle } from '../ui/ThemeToggle';
import './Header.css';

interface HeaderProps {
  onMenuClick: () => void;
}

const routeNames: Record<string, string> = {
  '/': 'Dashboard',
  '/produk/master': 'Master Produk',
  '/produk/channel': 'Produk Channel',
  '/integrasi/shopee': 'Integrasi Shopee',
  '/settings': 'Settings',
};

export function Header({ onMenuClick }: HeaderProps) {
  const location = useLocation();
  const currentRoute = routeNames[location.pathname] || 'Dashboard';

  return (
    <header className="header">
      <div className="header-left">
        <button className="header-menu-btn" onClick={onMenuClick} aria-label="Toggle menu">
          <Menu size={20} />
        </button>
        <div className="header-breadcrumb">
          <Home size={14} />
          <span className="header-breadcrumb-sep">›</span>
          <span className="header-breadcrumb-current">{currentRoute}</span>
        </div>
      </div>
      <div className="header-right">
        <ThemeToggle />
      </div>
    </header>
  );
}
