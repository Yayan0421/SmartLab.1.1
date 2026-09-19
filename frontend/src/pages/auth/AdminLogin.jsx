import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import AuthInput from '../../components/AuthInput.jsx';
import { MailIcon, LockIcon, LoginIcon, ShieldIcon } from '../../components/icons.jsx';

/**
 * Administrator sign-in.
 *
 * Same layout as the student page but darkened, so there is no doubt which
 * portal you are on. The API rejects non-admin accounts here, making this a
 * real boundary rather than a styling difference.
 */
export default function AdminLogin() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(
    searchParams.get('expired') ? 'Your session has expired. Please sign in again.' : ''
  );

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBanner('');

    const nextErrors = {};
    if (!form.email.trim()) nextErrors.email = 'Email is required.';
    if (!form.password) nextErrors.password = 'Password is required.';
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);

    setSubmitting(true);
    try {
      // portal: 'admin' — the server refuses any non-admin account here.
      const user = await login(form.email.trim(), form.password, 'admin');
      toast.success(`Welcome back, ${user.full_name.split(' ')[0]}.`);
      navigate('/admin/dashboard', { replace: true });
    } catch (error) {
      setBanner(error.message);
      if (error.fields) setErrors(error.fields);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page is-admin">
      <div className="auth-photo" />

      <div className="auth-panel">
        <div className="auth-inner">
          <div className="auth-brand">
            <span className="auth-brand-mark" aria-hidden="true">SL</span>
            <span className="auth-wordmark">
              <span className="wm-dark">smart</span>
              <span className="wm-accent">lab</span>
            </span>
          </div>

          <div className="auth-badge">
            <ShieldIcon width={12} height={12} />
            Administrator Portal
          </div>

          <h1 className="auth-heading" style={{ marginTop: '0.6rem' }}>
            Login
          </h1>

          <p className="auth-lede">
            Restricted to laboratory administrators.
            <br />
            Have a code? <Link to="/admin/register">Register an admin account</Link>.
          </p>

          {banner && (
            <div className="auth-alert" role="alert">
              {banner}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <AuthInput
              id="admin-email"
              type="email"
              icon={MailIcon}
              value={form.email}
              onChange={(v) => update('email', v)}
              placeholder="admin@smartlab.edu"
              autoComplete="username"
              disabled={submitting}
              error={errors.email}
              valid={/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)}
            />

            <AuthInput
              id="admin-password"
              type="password"
              icon={LockIcon}
              value={form.password}
              onChange={(v) => update('password', v)}
              placeholder="Password"
              autoComplete="current-password"
              disabled={submitting}
              error={errors.password}
            />

            <button type="submit" className="auth-submit" disabled={submitting}>
              <LoginIcon />
              {submitting ? 'Signing in…' : 'Sign in as administrator'}
            </button>
          </form>

          <div className="auth-divider" style={{ marginTop: '1.3rem' }}>
            Not an administrator?
          </div>
          <div className="auth-chips">
            <Link to="/login" className="auth-chip">
              <span className="chip-dot" />
              Student and faculty sign-in
            </Link>
          </div>

          <p className="auth-footer">
            © {new Date().getFullYear()} SMARTLAB — Smart Computer Management System
          </p>
        </div>
      </div>
    </div>
  );
}
