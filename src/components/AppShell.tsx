import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = () => setNavOpen(false);

  return (
    <div className="app-shell">
      <div
        className={`sidebar-backdrop${navOpen ? ' is-visible' : ''}`}
        onClick={closeNav}
        aria-hidden={!navOpen}
      />
      <Sidebar isOpen={navOpen} onNavigate={closeNav} />
      <div className="app-main">
        <TopBar onMenuClick={() => setNavOpen(true)} />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
