import { Menu } from 'lucide-react';

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="topbar-menu-btn"
        onClick={onMenuClick}
        aria-label="Open navigation"
      >
        <Menu size={22} aria-hidden />
      </button>
      <span className="topbar-mobile-brand">Field</span>
      <div className="topbar-spacer" />
    </header>
  );
}
