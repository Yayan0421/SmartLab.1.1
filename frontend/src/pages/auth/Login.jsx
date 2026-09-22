import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth, HOME_BY_ROLE } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import AuthInput from '../../components/AuthInput.jsx';
import { MailIcon, LockIcon, LoginIcon, UserPlusIcon } from '../../components/icons.jsx';
import Logo from '../../components/Logo.jsx';

// Administrators are not listed here — they sign in at /admin/login.
const QUICK = [
  { role: 'Faculty', cls: 'is-faculty', email: 'faculty@smartlab.edu', password: 'Faculty@1234' },
  { role: 'Student', cls: 'is-student', email: 'student@smartlab.edu', password: 'Student@1234' },
];

const REMEMBER_KEY = 'smartlab_remember_email';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const remembered = localStorage.getItem(REMEMBER_KEY) || '';
  const [form, setForm] = useState({ email: remembered, password: '' });
  const [remember, setRemember] = useState(Boolean(remembered));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState(
    searchParams.get('expired') ? 'Your session has expired. Please sign in again.' : ''
  );

  const logoClicks = useRef({ count: 0, last: 0 });

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
      const user = await login(form.email.trim(), form.password, 'public');

      // "Remember me" keeps the address only — never the password.
      if (remember) localStorage.setItem(REMEMBER_KEY, form.email.trim());
      else localStorage.removeItem(REMEMBER_KEY);

      toast.success(`Welcome back, ${user.full_name.split(' ')[0]}.`);
      const from = location.state?.from;
      const home = HOME_BY_ROLE[user.role];
      navigate(from && from.startsWith(`/${user.role}`) ? from : home, { replace: true });
    } catch (error) {
      setBanner(error.message);
      if (error.fields) setErrors(error.fields);
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Unadvertised routes to the administrator portal, so this page carries
   * no visible link to it: Ctrl+Shift+A, or three quick clicks on the logo.
   */
  useEffect(() => {
    function onKeyDown(event) {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        navigate('/admin/login');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);

  function handleLogoClick() {
    const now = Date.now();
    if (now - logoClicks.current.last > 1500) logoClicks.current.count = 0;
    logoClicks.current.count += 1;
    logoClicks.current.last = now;
    if (logoClicks.current.count >= 3) {
      logoClicks.current.count = 0;
      navigate('/admin/login');
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-photo" />

      <div className="auth-panel">
        <div className="auth-inner">
          <div className="auth-brand">
            <Logo size={50} className="auth-brand-mark" onClick={handleLogoClick} />
            <span className="auth-wordmark">
              <span className="wm-dark">Smart</span>
              <span className="wm-accent">Lab</span>
            </span>
          </div>

          <h1 className="auth-heading">Login</h1>

          <p className="auth-lede">
            Sign in to reserve a workstation in the computer laboratory.
          </p>

          {banner && (
            <div className="auth-alert" role="alert">
              {banner}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <AuthInput
              id="email"
              type="email"
              icon={MailIcon}
              value={form.email}
              onChange={(v) => update('email', v)}
              placeholder="yourname@smartlab.edu"
              autoComplete="username"
              disabled={submitting}
              error={errors.email}
              valid={/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)}
            />

            <AuthInput
              id="password"
              type="password"
              icon={LockIcon}
              value={form.password}
              onChange={(v) => update('password', v)}
              placeholder="Password"
              autoComplete="current-password"
              disabled={submitting}
              error={errors.password}
            />

            <div className="auth-row">
              <label className="auth-check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  disabled={submitting}
                />
                Remember me
              </label>

              <button
                type="button"
                className="auth-link"
                onClick={() =>
                  toast.info('Ask a laboratory administrator to reset your password for you.')
                }
              >
                Forgot password?
              </button>
            </div>

            <button type="submit" className="auth-submit" disabled={submitting}>
              <LoginIcon />
              {submitting ? 'Signing in…' : 'Login'}
            </button>
          </form>

          {/* Registering is a first-class action here, not a footnote: most
              people arriving at this screen for the first time need it. */}
          <div className="auth-sep">
            <span>New to SMARTLAB?</span>
          </div>

          <Link to="/register" className="auth-secondary">
            <UserPlusIcon />
            Create an account
          </Link>

          <p className="auth-hint">
            Students and faculty — it takes less than a minute.
          </p>

          {/* The reference has social sign-in here; SMARTLAB has no external
              providers, so the space goes to the demo accounts instead. */}
          <div className="auth-divider">Quick sign-in</div>
          <div className="auth-chips">
            {QUICK.map((account) => (
              <button
                key={account.email}
                type="button"
                className={`auth-chip ${account.cls}`}
                onClick={() => {
                  setForm({ email: account.email, password: account.password });
                  setErrors({});
                  setBanner('');
                }}
                disabled={submitting}
              >
                <span className="chip-dot" />
                {account.role}
              </button>
            ))}
          </div>

          <p className="auth-footer">
            © {new Date().getFullYear()} SMARTLAB — Smart Computer Management System
            <br />
            Computer Laboratory 1, Engineering Building, Room ENG-204
          </p>
        </div>
      </div>
    </div>
  );
}
