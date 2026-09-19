import AppShell from './AppShell.jsx';

const NAV = [
  { group: 'Overview' },
  { to: '/admin/dashboard', label: 'Dashboard', icon: '▤' },
  { to: '/admin/monitoring', label: 'Monitoring', icon: '◉' },
  { group: 'Laboratory' },
  { to: '/admin/computers', label: 'Computers', icon: '🖥' },
  { to: '/admin/bookings', label: 'Bookings', icon: '🗓' },
  { to: '/admin/energy', label: 'Energy', icon: '⚡' },
  { group: 'Administration' },
  { to: '/admin/users', label: 'Users', icon: '👥' },
  { to: '/admin/reports', label: 'Reports', icon: '📈' },
  { to: '/admin/settings', label: 'Settings', icon: '⚙' },
  { to: '/admin/profile', label: 'My Profile', icon: '🪪' },
];

export default function AdminLayout() {
  return <AppShell navItems={NAV} roleLabel="Administrator" />;
}
