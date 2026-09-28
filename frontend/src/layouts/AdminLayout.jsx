import { useMemo } from 'react';
import AppShell from './AppShell.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// What every administrator sees: running the laboratory.
const BASE_NAV = [
  { group: 'Overview' },
  { to: '/admin/dashboard', label: 'Dashboard', icon: '▤' },
  { to: '/admin/monitoring', label: 'Monitoring', icon: '◉' },
  { group: 'Laboratory' },
  { to: '/admin/reservations', label: 'Reservations', icon: '🗓' },
  { to: '/admin/energy', label: 'Energy', icon: '⚡' },
  { group: 'Administration' },
  { to: '/admin/users', label: 'Users', icon: '👥' },
  { to: '/admin/reports', label: 'Reports', icon: '📈' },
  { to: '/admin/profile', label: 'My Profile', icon: '🪪' },
];

// What only the owner sees: the system itself. Settings moved here from
// Administration, because it is now a super-admin screen.
const SUPER_NAV = [
  { group: 'Super Admin' },
  { to: '/admin/administrators', label: 'Administrators', icon: '🛡' },
  { to: '/admin/audit-logs', label: 'Audit Logs', icon: '📋' },
  { to: '/admin/settings', label: 'Settings', icon: '⚙' },
];

/**
 * The administrator shell, for both administrator roles.
 *
 * Super admins do not get their own URLs — they get more of this area. The
 * nav is built from the signed-in role so an ordinary admin is never shown
 * a link that would bounce them back to the dashboard.
 */
export default function AdminLayout() {
  const { isSuperAdmin } = useAuth();

  const navItems = useMemo(
    () => (isSuperAdmin ? [...BASE_NAV, ...SUPER_NAV] : BASE_NAV),
    [isSuperAdmin]
  );

  return (
    <AppShell
      navItems={navItems}
      roleLabel={isSuperAdmin ? 'Super Administrator' : 'Administrator'}
    />
  );
}
