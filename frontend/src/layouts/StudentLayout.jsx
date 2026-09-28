import AppShell from './AppShell.jsx';

/**
 * `tabLabel` is the short form for the phone's bottom bar, where five
 * labels share the width of a screen. The sidebar keeps the full wording.
 */
const NAV = [
  { to: '/student/dashboard', label: 'Dashboard', tabLabel: 'Home', icon: '▤' },
  { to: '/student/reserve', label: 'Reserve a Computer', tabLabel: 'Reserve', icon: '➕' },
  { to: '/student/reservations', label: 'My Reservations', tabLabel: 'Reservations', icon: '🗓' },
  { to: '/student/profile', label: 'My Profile', tabLabel: 'Profile', icon: '🪪' },
];

export default function StudentLayout() {
  return <AppShell navItems={NAV} roleLabel="Student" bottomNav />;
}
