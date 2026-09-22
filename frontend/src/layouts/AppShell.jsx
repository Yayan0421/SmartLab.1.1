import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import NotificationBell from '../components/NotificationBell.jsx';
import Avatar from '../components/Avatar.jsx';
import Logo from '../components/Logo.jsx';
import { ROLE_LABEL } from '../utils/format.js';

/**
 * The one shell every role renders inside.
 *
 * AdminLayout, FacultyLayout and StudentLayout are thin wrappers that pass
 * their own nav items, so the chrome (sidebar, topbar, notifications,
 * mobile behaviour) has a single implementation.
 *
 * `bottomNav` puts the destinations along the bottom of a phone screen,
 * where a thumb reaches them, instead of behind a drawer. Student and
 * faculty use it: five destinations each, which is what a tab bar holds.
 * Admin does not — it has more, in groups, and no honest way to fit them.
 * On a laptop the bar is not rendered at all and nothing changes.
 */
export default function AppShell({ navItems, roleLabel, bottomNav = false }) {
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
    <div className={`shell ${bottomNav ? 'has-tabbar' : ''}`}>
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <Logo size={38} className="brand-mark" />
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
            <Avatar user={user} size={40} />
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

          {/*
            The mark is the identity. On a laptop the sidebar carries it;
            on a phone the sidebar is gone, and without this the header is
            a page title with no product behind it. Shown only where the
            sidebar is not.
          */}
          {bottomNav && (
            <Logo size={34} className="topbar-brand" />
          )}

          <span className="topbar-heading">
            <span className="topbar-title">{current?.label ?? 'SMARTLAB'}</span>
            {bottomNav && <span className="topbar-sub">{roleLabel} · SMARTLAB</span>}
          </span>

          <span className="topbar-spacer" />

          <NotificationBell />

          <Link
            to={`/${user?.role}/profile`}
            className="icon-btn"
            aria-label="Your profile"
            title="Profile"
          >
            <Avatar user={user} size={34} />
          </Link>

          <button
            type="button"
            className="btn btn-secondary topbar-signout"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </header>

        <main className="content">
          <Outlet />
        </main>
      </div>

      {bottomNav && (
        <nav className="tabbar" aria-label="Main navigation">
          {navItems
            .filter((item) => !item.group)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `tab-link ${isActive ? 'is-active' : ''}`}
                end={item.end}
              >
                <span className="tab-icon" aria-hidden="true">{item.icon}</span>
                <span className="tab-label">{item.tabLabel ?? item.label}</span>
              </NavLink>
            ))}
        </nav>
      )}
    </div>
  );
}
