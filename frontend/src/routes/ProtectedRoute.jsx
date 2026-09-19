import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth, HOME_BY_ROLE } from '../context/AuthContext.jsx';
import Spinner from '../components/Spinner.jsx';

/**
 * Client-side route guard.
 *
 * This is a usability layer only — it keeps people out of screens they
 * cannot use. The real enforcement is in Express: every admin endpoint
 * re-checks the role from the database, so editing localStorage or typing
 * an API URL directly still gets a 403.
 */
export default function ProtectedRoute({ allow }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <Spinner label="Restoring your session…" />
      </div>
    );
  }

  if (!user) {
    // Send people back to the door they were trying to use.
    const target = location.pathname.startsWith('/admin') ? '/admin/login' : '/login';
    return <Navigate to={target} replace state={{ from: location.pathname }} />;
  }

  // Signed in, but this route belongs to another role: send them home
  // rather than showing an error page.
  if (allow && !allow.includes(user.role)) {
    return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  }

  return <Outlet />;
}

/** Keeps a signed-in user off /login and /register. */
export function PublicOnlyRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <Spinner />
      </div>
    );
  }

  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;

  return <Outlet />;
}
