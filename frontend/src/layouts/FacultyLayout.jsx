import AppShell from './AppShell.jsx';

const NAV = [
  { to: '/faculty/dashboard', label: 'Dashboard', icon: '▤' },
  { to: '/faculty/book', label: 'Book a Computer', icon: '➕' },
  { to: '/faculty/computers', label: 'Computers', icon: '🖥' },
  { to: '/faculty/bookings', label: 'My Bookings', icon: '🗓' },
  { to: '/faculty/profile', label: 'My Profile', icon: '🪪' },
];

export default function FacultyLayout() {
  return <AppShell navItems={NAV} roleLabel="Faculty" />;
}
