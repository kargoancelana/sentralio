import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useState } from 'react';
import './ThemeToggle.css';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [rotating, setRotating] = useState(false);

  const handleClick = () => {
    setRotating(true);
    toggleTheme();
    setTimeout(() => setRotating(false), 400);
  };

  return (
    <button
      id="theme-toggle-btn"
      className="theme-toggle"
      onClick={handleClick}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <span className={`theme-toggle-icon ${rotating ? 'rotating' : ''}`}>
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </span>
    </button>
  );
}
