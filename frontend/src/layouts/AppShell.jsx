import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import { initials, ROLE_LABEL } from '../utils/format.js';

/**
 * The one shell every role renders inside.
 *
 * AdminLayout, FacultyLayout and StudentLayout are thin wrappers that pass
 * their own nav items, so the chrome (sidebar, topbar, notifications,
 * mobile behaviour) has a single implementation.
 */
export default function AppShell({ navItems, roleLabel }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close the drawer whenever the route changes on mobile.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const current = navItems.find((item) => location.pathname.startsWith(item.to));

  async function handleLogout() {
    try {
      await logout();
      toast.success('You have been signed out.');
      navigate('/login', { replace: true });
    } catch {
      toast.error('Could not sign out cleanly, but your session was cleared.');
      navigate('/login', { replace: true });
    }
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">SL</span>
          <span className="brand-text">
            <span className="brand-name">SMARTLAB</span>
            <span className="brand-role">{roleLabel}</span>
          </span>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map((item) =>
            item.group ? (
              <div className="nav-group-label" key={`group-${item.group}`}>
                {item.group}
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? 'is-active' : ''}`}
                end={item.end}
              >
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            )
          )}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <span className="avatar" aria-hidden="true">{initials(user?.full_name)}</span>
            <span className="sidebar-user-meta">
              <span className="sidebar-user-name">{user?.full_name}</span>
              <span className="sidebar-user-role">{ROLE_LABEL[user?.role] ?? user?.role}</span>
            </span>
          </div>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      <div className="main">
        <header className="topbar">
          <button
            type="button"
            className="icon-btn menu-toggle"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle navigation"
            aria-expanded={sidebarOpen}
          >
            ☰
          </button>

          <span className="topbar-title">{current?.label ?? 'SMARTLAB'}</span>
          <span className="topbar-spacer" />

          <NotificationBell />

          <Link
            to={`/${user?.role}/profile`}
            className="icon-btn"
            aria-label="Your profile"
            title="Profile"
          >
            <span className="avatar" style={{ width: 34, height: 34, fontSize: '0.8rem' }}>
              {initials(user?.full_name)}
            </span>
          </Link>

          <button type="button" className="btn btn-secondary" onClick={handleLogout}>
            Sign out
          </button>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
