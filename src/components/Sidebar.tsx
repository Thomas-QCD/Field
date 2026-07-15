import { NavLink } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onNavigate?: () => void;
}

export function Sidebar({ isOpen, onNavigate }: SidebarProps) {
  return (
    <aside className={`sidebar${isOpen ? ' is-open' : ''}`} aria-label="Main navigation">
      <div className="sidebar-brand">
        <span className="sidebar-brand-name">Field</span>
      </div>
      <nav className="sidebar-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `sidebar-nav-link${isActive ? ' is-active' : ''}`
          }
          onClick={onNavigate}
        >
          <ClipboardList size={20} aria-hidden />
          Tasks
        </NavLink>
      </nav>
    </aside>
  );
}
