import AppShell from './AppShell.jsx';

/**
 * `tabLabel` is the short form for the phone's bottom bar, where five
 * labels share the width of a screen. The sidebar keeps the full wording.
 */
const NAV = [
  { to: '/faculty/dashboard', label: 'Dashboard', tabLabel: 'Home', icon: '▤' },
  { to: '/faculty/reserve', label: 'Reserve a Computer', tabLabel: 'Reserve', icon: '➕' },
  { to: '/faculty/reservations', label: 'My Reservations', tabLabel: 'Reservations', icon: '🗓' },
  { to: '/faculty/profile', label: 'My Profile', tabLabel: 'Profile', icon: '🪪' },
];

export default function FacultyLayout() {
  return <AppShell navItems={NAV} roleLabel="Faculty" bottomNav />;
}
