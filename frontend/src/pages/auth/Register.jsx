import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, HOME_BY_ROLE } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import AuthInput from '../../components/AuthInput.jsx';
import {
  UserIcon,
  MailIcon,
  LockIcon,
  IdIcon,
  BuildingIcon,
  UserPlusIcon,
} from '../../components/icons.jsx';

const EMPTY = {
  full_name: '',
  email: '',
  password: '',
  confirm: '',
  role: 'student',
  department: '',
  id_number: '',
};

export default function Register() {
  const { register } = useAuth();
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
    if (form.full_name.trim().length < 2) nextErrors.full_name = 'Enter your full name.';
    if (!form.email.trim()) nextErrors.email = 'Email is required.';
    if (form.password.length < 8) nextErrors.password = 'At least 8 characters.';
    if (form.password !== form.confirm) nextErrors.confirm = 'The passwords do not match.';
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);

    setSubmitting(true);
    try {
      // The API only accepts student or faculty here — an administrator
      // account cannot be created from this page.
      const user = await register({
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        department: form.department.trim(),
        id_number: form.id_number.trim(),
      });
      toast.success('Your account is ready.');
      navigate(HOME_BY_ROLE[user.role], { replace: true });
    } catch (error) {
      setBanner(error.message);
      if (error.fields) setErrors(error.fields);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page is-tall">
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

          <h1 className="auth-heading">Sign up</h1>

          <p className="auth-lede">
            Already registered? <Link to="/login">Sign in to your account</Link>,
            <br />
            it takes less than a minute to join.
          </p>

          {banner && (
            <div className="auth-alert" role="alert">
              {banner}
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {/* Role picker, styled as the chips used elsewhere. */}
            <div className="auth-chips" style={{ marginBottom: '0.15rem' }}>
              {[
                { value: 'student', label: 'I am a Student', cls: 'is-student' },
                { value: 'faculty', label: 'I am Faculty', cls: 'is-faculty' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`auth-chip ${option.cls}`}
                  style={
                    form.role === option.value
                      ? {
                          borderColor: 'var(--burgundy)',
                          color: 'var(--burgundy)',
                          background: '#fff',
                        }
                      : undefined
                  }
                  onClick={() => update('role', option.value)}
                  disabled={submitting}
                  aria-pressed={form.role === option.value}
                >
                  <span className="chip-dot" />
                  {option.label}
                </button>
              ))}
            </div>

            <AuthInput
              id="full_name"
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
              id="reg-email"
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

            <div className="auth-grid">
              <AuthInput
                id="id_number"
                icon={IdIcon}
                value={form.id_number}
                onChange={(v) => update('id_number', v)}
                placeholder={form.role === 'student' ? 'Student no.' : 'Employee no.'}
                disabled={submitting}
                maxLength={60}
              />

              <AuthInput
                id="department"
                icon={BuildingIcon}
                value={form.department}
                onChange={(v) => update('department', v)}
                placeholder="Department"
                disabled={submitting}
                maxLength={120}
              />
            </div>

            <AuthInput
              id="reg-password"
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
              id="confirm"
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
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

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
