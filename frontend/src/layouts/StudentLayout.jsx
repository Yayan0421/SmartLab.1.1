import AppShell from './AppShell.jsx';

const NAV = [
  { to: '/student/dashboard', label: 'Dashboard', icon: '▤' },
  { to: '/student/book', label: 'Book a Computer', icon: '➕' },
  { to: '/student/computers', label: 'Computers', icon: '🖥' },
  { to: '/student/bookings', label: 'My Bookings', icon: '🗓' },
  { to: '/student/profile', label: 'My Profile', icon: '🪪' },
];

export default function StudentLayout() {
  return <AppShell navItems={NAV} roleLabel="Student" />;
}
