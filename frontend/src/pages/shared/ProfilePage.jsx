import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import authService from '../../services/authService.js';
import StatusBadge from '../../components/StatusBadge.jsx';
import QrCard from '../../components/QrCard.jsx';
import AvatarUpload from '../../components/AvatarUpload.jsx';
import Avatar from '../../components/Avatar.jsx';
import Modal from '../../components/Modal.jsx';
import { formatDateTime, initials, ROLE_LABEL } from '../../utils/format.js';
import { PROGRAMS, coursesFor } from '../../utils/labConstants.js';

/** Profile and password management — the same for all three roles. */
export default function ProfilePage() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [profile, setProfile] = useState({
    full_name: user?.full_name ?? '',
    department: user?.department ?? '',
    course: user?.course ?? '',
    id_number: user?.id_number ?? '',
    phone: user?.phone ?? '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [editing, setEditing] = useState(false);

  // Re-seed the form whenever the dialog opens, so a cancelled edit does
  // not leave its half-typed values behind for the next one.
  useEffect(() => {
    if (!editing) return;
    setProfile({
      full_name: user?.full_name ?? '',
      department: user?.department ?? '',
      course: user?.course ?? '',
      id_number: user?.id_number ?? '',
      phone: user?.phone ?? '',
    });
  }, [editing, user]);

  const [passwords, setPasswords] = useState({ current_password: '', new_password: '', confirm: '' });
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleLogout() {
    try {
      await logout();
      toast.success('You have been signed out.');
    } catch {
      toast.error('Could not sign out cleanly, but your session was cleared.');
    }
    navigate('/', { replace: true });
  }

  async function saveProfile(event) {
    event.preventDefault();
    if (profile.full_name.trim().length < 2) {
      return toast.error('Enter your full name.');
    }

    setSavingProfile(true);
    try {
      const updated = await authService.updateProfile({
        full_name: profile.full_name.trim(),
        id_number: profile.id_number.trim(),
        phone: profile.phone.trim(),
      });
      setUser(updated);
      setEditing(false);
      toast.success('Profile updated.');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(event) {
    event.preventDefault();
    setPasswordError('');

    if (passwords.new_password.length < 8) {
      return setPasswordError('Your new password must be at least 8 characters.');
    }
    if (passwords.new_password !== passwords.confirm) {
      return setPasswordError('The new passwords do not match.');
    }

    setSavingPassword(true);
    try {
      await authService.changePassword(passwords.current_password, passwords.new_password);
      setPasswords({ current_password: '', new_password: '', confirm: '' });
      toast.success('Password changed.');
    } catch (error) {
      setPasswordError(error.message);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My profile</h1>
          <p className="subtitle">Update your details and change your password.</p>
        </div>
      </div>

      <div className="chart-grid">
        <section className="card">
          <div className="card-header">
            <h2>Account</h2>
          </div>
          <div className="card-body">
            <div className="row" style={{ marginBottom: '1.25rem', gap: '1rem' }}>
              {/* The picture is the control: click it, or the +, to change. */}
              <AvatarUpload user={user} onChange={setUser} size={84} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{user?.full_name}</div>
                <div className="small muted">{user?.email}</div>
                <div className="row" style={{ marginTop: '0.35rem', gap: '0.35rem' }}>
                  <StatusBadge value={user?.role} label={ROLE_LABEL[user?.role]} />
                  <StatusBadge value={user?.status} />
                </div>
              </div>
            </div>


            <div className="stack" style={{ gap: '0.75rem' }}>
              <Row label="Full name" value={user?.full_name} />
              <Row label="Email" value={user?.email} />
              <Row label="Programme" value={user?.department || 'Not set'} />
              {user?.role === 'student' && (
                <Row label="Course and year" value={user?.course || 'Not set'} />
              )}
              <Row label="ID number" value={user?.id_number || 'Not set'} />
              <Row label="Phone" value={user?.phone || 'Not set'} />
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary" onClick={() => setEditing(true)}>
                Edit profile
              </button>
            </div>
          </div>
        </section>

        <div className="stack">
          <section className="card">
            <div className="card-header">
              <h2>Change password</h2>
            </div>
            <div className="card-body">
              <form className="stack" onSubmit={savePassword} noValidate>
                {passwordError && (
                  <div className="alert alert-error" role="alert">
                    {passwordError}
                  </div>
                )}

                <div className="field">
                  <label htmlFor="pw-current">Current password</label>
                  <input
                    id="pw-current"
                    type="password"
                    autoComplete="current-password"
                    className="input"
                    value={passwords.current_password}
                    onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })}
                    disabled={savingPassword}
                  />
                </div>

                <div className="field">
                  <label htmlFor="pw-new">New password</label>
                  <input
                    id="pw-new"
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    value={passwords.new_password}
                    onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
                    disabled={savingPassword}
                  />
                  <span className="small muted">At least 8 characters.</span>
                </div>

                <div className="field">
                  <label htmlFor="pw-confirm">Confirm new password</label>
                  <input
                    id="pw-confirm"
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    disabled={savingPassword}
                  />
                </div>

                <div className="row" style={{ justifyContent: 'flex-end' }}>
                  <button type="submit" className="btn btn-primary" disabled={savingPassword}>
                    {savingPassword ? 'Updating…' : 'Update password'}
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* Administrators do not carry a scannable card. */}
          {user?.role !== 'admin' && (
            <section className="card">
              <div className="card-header">
                <h2>My laboratory card</h2>
                <span className="badge badge-brand badge-plain">QR</span>
              </div>
              <div className="card-body">
                <QrCard user={user} />
                <p className="small muted" style={{ marginTop: '0.9rem', marginBottom: 0 }}>
                  Show this at the laboratory to identify yourself. Print it or save it to your
                  phone — a screenshot scans just as well. If you lose it, an administrator can
                  issue a new one, which stops the old card working.
                </p>
              </div>
            </section>
          )}

          <section className="card">
            <div className="card-header">
              <h2>Account details</h2>
            </div>
            <div className="card-body stack" style={{ gap: '0.75rem' }}>
              <Row label="Role" value={ROLE_LABEL[user?.role] ?? user?.role} />
              <Row label="Member since" value={formatDateTime(user?.created_at)} />
              <Row label="Last sign-in" value={formatDateTime(user?.last_login_at)} />
            </div>
            <div className="card-footer">
              <button type="button" className="btn btn-secondary btn-block" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          </section>
        </div>
      </div>

      {/*
        Editing is a decision, so it gets a dialog.

        Programme and course are shown but not editable: they are set at
        sign-up and the API rejects them on a self-edit, so the disabled
        fields are a reflection of that rule rather than the rule itself.
      */}
      <Modal
        open={editing}
        onClose={() => !savingProfile && setEditing(false)}
        title="Edit profile"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditing(false)}
              disabled={savingProfile}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="profile-form"
              className="btn btn-primary"
              disabled={savingProfile}
            >
              {savingProfile ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        <form id="profile-form" className="stack" onSubmit={saveProfile} noValidate>
          <div className="field">
            <label htmlFor="p-name">Full name</label>
            <input
              id="p-name"
              className="input"
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              disabled={savingProfile}
            />
          </div>

          <div className="field">
            <label htmlFor="p-email">Email</label>
            <input id="p-email" className="input" value={user?.email ?? ''} disabled />
            <span className="small muted">
              Your email, programme and course are set by the laboratory. Contact an
              administrator if any of them need correcting.
            </span>
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="p-dept">Programme</label>
              <input id="p-dept" className="input" value={user?.department || 'Not set'} disabled />
            </div>

            {user?.role === 'student' && (
              <div className="field">
                <label htmlFor="p-course">Course and year</label>
                <input id="p-course" className="input" value={user?.course || 'Not set'} disabled />
              </div>
            )}

            <div className="field">
              <label htmlFor="p-id">ID number</label>
              <input
                id="p-id"
                className="input"
                value={profile.id_number}
                onChange={(e) => setProfile({ ...profile, id_number: e.target.value })}
                disabled={savingProfile}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="p-phone">Phone</label>
            <input
              id="p-phone"
              className="input"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              disabled={savingProfile}
            />
          </div>
        </form>
      </Modal>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="row-between">
      <span className="muted small">{label}</span>
      <strong className="small">{value}</strong>
    </div>
  );
}
