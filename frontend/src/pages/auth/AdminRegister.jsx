import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import AuthInput from '../../components/AuthInput.jsx';
import Logo from '../../components/Logo.jsx';
import {
  UserIcon,
  MailIcon,
  LockIcon,
  KeyIcon,
  BuildingIcon,
  ShieldIcon,
  UserPlusIcon,
} from '../../components/icons.jsx';

const EMPTY = {
  full_name: '',
  email: '',
  password: '',
  confirm: '',
  admin_code: '',
  department: '',
};

/**
 * Administrator signup, gated by ADMIN_SIGNUP_CODE.
 *
 * The code is verified on the server in constant time, the endpoint allows
 * five attempts per hour, and failures are written to the audit log.
 */
export default function AdminRegister() {
  const { registerAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBanner('');

    const nextErrors = {};
    if (!form.admin_code.trim()) nextErrors.admin_code = 'The administrator code is required.';
    if (form.full_name.trim().length < 2) nextErrors.full_name = 'Enter your full name.';
    if (!form.email.trim()) nextErrors.email = 'Email is required.';
    if (form.password.length < 8) nextErrors.password = 'At least 8 characters.';
    if (form.password !== form.confirm) nextErrors.confirm = 'The passwords do not match.';
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);

    setSubmitting(true);
    try {
      const user = await registerAdmin({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        admin_code: form.admin_code.trim(),
        department: form.department.trim(),
      });
      toast.success(`Welcome, ${user.full_name.split(' ')[0]}!`);
      navigate('/admin/dashboard', { replace: true });
    } catch (error) {
      setBanner(error.message);
      if (error.fields) setErrors(error.fields);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page is-admin is-tall">
      <div className="auth-photo" />

      <div className="auth-panel">
        <div className="auth-inner">
          <div className="auth-brand">
            <Logo size={50} className="auth-brand-mark" />
            <span className="auth-wordmark">
              <span className="wm-dark">Smart</span>
              <span className="wm-accent">Lab</span>
            </span>
          </div>

          <div className="auth-badge">
            <ShieldIcon width={12} height={12} />
            Administrator Portal
          </div>

          <h1 className="auth-heading" style={{ marginTop: '0.6rem' }}>
            Sign up
          </h1>

          <p className="auth-lede">
            You need the administrator code from your system owner.
            <br />
            Already have an account? <Link to="/admin/login">Sign in</Link>.
          </p>

          {banner && (
            <div className="auth-alert" role="alert">
              {banner}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <AuthInput
              id="ar-code"
              type="password"
              icon={KeyIcon}
              value={form.admin_code}
              onChange={(v) => update('admin_code', v)}
              placeholder="Administrator code"
              disabled={submitting}
              error={errors.admin_code}
            />

            <AuthInput
              id="ar-name"
              icon={UserIcon}
              value={form.full_name}
              onChange={(v) => update('full_name', v)}
              placeholder="Full name"
              disabled={submitting}
              error={errors.full_name}
              valid={form.full_name.trim().length > 1}
              maxLength={120}
            />

            <AuthInput
              id="ar-email"
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
              id="ar-dept"
              icon={BuildingIcon}
              value={form.department}
              onChange={(v) => update('department', v)}
              placeholder="Department (optional)"
              disabled={submitting}
              maxLength={120}
            />

            <AuthInput
              id="ar-password"
              type="password"
              icon={LockIcon}
              value={form.password}
              onChange={(v) => update('password', v)}
              placeholder="Password (min. 8 characters)"
              autoComplete="new-password"
              disabled={submitting}
              error={errors.password}
            />

            <AuthInput
              id="ar-confirm"
              type="password"
              icon={LockIcon}
              value={form.confirm}
              onChange={(v) => update('confirm', v)}
              placeholder="Confirm password"
              autoComplete="new-password"
              disabled={submitting}
              error={errors.confirm}
            />

            <button type="submit" className="auth-submit" disabled={submitting}>
              <UserPlusIcon />
              {submitting ? 'Creating account…' : 'Create administrator account'}
            </button>
          </form>

          <div className="auth-divider" style={{ marginTop: '1.3rem' }}>
            Student or faculty?
          </div>
          <div className="auth-chips">
            <Link to="/register" className="auth-chip">
              <span className="chip-dot" />
              Create a student account
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
