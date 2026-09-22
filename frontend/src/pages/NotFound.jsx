import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function NotFound() {
  const { isAuthenticated, homePath } = useAuth();

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '2rem' }}>
      <div className="card" style={{ maxWidth: 420, width: '100%' }}>
        <div className="card-body center stack">
          <div style={{ fontSize: '2.5rem' }} aria-hidden="true">🧭</div>
          <h1 style={{ fontSize: '1.25rem' }}>Page not found</h1>
          <p className="muted small">
            The page you are looking for does not exist, or you do not have access to it.
          </p>
          <Link to={homePath} className="btn btn-primary">
            {isAuthenticated ? 'Back to my dashboard' : 'Back to the home page'}
          </Link>
        </div>
      </div>
    </div>
  );
}
