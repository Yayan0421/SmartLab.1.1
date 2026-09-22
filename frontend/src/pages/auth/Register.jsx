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
  UserPlusIcon,
  BuildingIcon,
  CapIcon,
} from '../../components/icons.jsx';
import { PROGRAMS, coursesFor } from '../../utils/labConstants.js';
import Logo from '../../components/Logo.jsx';

const EMPTY = {
  full_name: '',
  email: '',
  password: '',
  confirm: '',
  role: 'student',
  department: '',
  course: '',
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
    if (!form.department) nextErrors.department = 'Choose your programme.';
    if (form.role === 'student' && !form.course) {
      nextErrors.course = 'Choose your course and year level.';
    }
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
        department: form.department,
        // Faculty belong to a programme but have no year level.
        course: form.role === 'student' ? form.course : '',
        id_number: form.id_number.trim(),
      });
      // "Welcome" on a first arrival, "Welcome back" on every one after:
      // the greeting should know which of the two just happened.
      toast.success(`Welcome, ${user.full_name.split(' ')[0]}!`);
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
            <Logo size={50} className="auth-brand-mark" />
            <span className="auth-wordmark">
              <span className="wm-dark">Smart</span>
              <span className="wm-accent">Lab</span>
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
                  onClick={() => {
                    update('role', option.value);
                    if (option.value !== 'student') update('course', '');
                  }}
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

            {/* Programme first; the course list follows from it. */}
            <div className="af">
              <div className={`af-shell ${errors.department ? 'is-error' : ''}`}>
                <span className="af-icon" aria-hidden="true">
                  <BuildingIcon />
                </span>
                <select
                  id="program"
                  className="af-input af-select"
                  value={form.department}
                  onChange={(e) => {
                    // Changing programme clears a course that no longer belongs to it.
                    update('department', e.target.value);
                    update('course', '');
                  }}
                  disabled={submitting}
                >
                  <option value="">Select your programme…</option>
                  {PROGRAMS.map((program) => (
                    <option key={program} value={program}>
                      {program}
                    </option>
                  ))}
                </select>
              </div>
              {errors.department && <span className="af-error">{errors.department}</span>}
            </div>

            {/* Year level applies to students only. */}
            {form.role === 'student' && (
              <div className="af">
                <div className={`af-shell ${errors.course ? 'is-error' : ''} ${!form.department ? 'is-disabled' : ''}`}>
                  <span className="af-icon" aria-hidden="true">
                    <CapIcon />
                  </span>
                  <select
                    id="course"
                    className="af-input af-select"
                    value={form.course}
                    onChange={(e) => update('course', e.target.value)}
                    disabled={submitting || !form.department}
                  >
                    <option value="">
                      {form.department ? 'Select your course and year…' : 'Choose a programme first'}
                    </option>
                    {coursesFor(form.department).map((course) => (
                      <option key={course} value={course}>
                        {course}
                      </option>
                    ))}
                  </select>
                </div>
                {errors.course && <span className="af-error">{errors.course}</span>}
              </div>
            )}

            <AuthInput
              id="id_number"
              icon={IdIcon}
              value={form.id_number}
              onChange={(v) => update('id_number', v)}
              placeholder={form.role === 'student' ? 'Student number' : 'Employee number'}
              disabled={submitting}
              maxLength={60}
            />

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
