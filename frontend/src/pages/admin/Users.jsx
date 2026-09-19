import { useState } from 'react';
import userService from '../../services/userService.js';
import useFetch from '../../hooks/useFetch.js';
import useDebounce from '../../hooks/useDebounce.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Pagination from '../../components/Pagination.jsx';
import Modal, { ConfirmDialog } from '../../components/Modal.jsx';
import { formatDateTime, initials, ROLE_LABEL, timeAgo } from '../../utils/format.js';

const EMPTY_USER = {
  full_name: '',
  email: '',
  password: '',
  role: 'student',
  status: 'active',
  department: '',
  id_number: '',
  phone: '',
};

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState(null); // user object, or EMPTY_USER for create
  const [deactivating, setDeactivating] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [busy, setBusy] = useState(false);

  const debouncedSearch = useDebounce(search);

  const { data, loading, error, refetch } = useFetch(
    () =>
      userService.list({
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        role: role || undefined,
        status: status || undefined,
      }),
    [page, debouncedSearch, role, status]
  );

  const { data: statsData, refetch: refetchStats } = useFetch(() => userService.stats(), []);
  const stats = statsData?.data;
  const users = data?.data ?? [];

  function refreshAll() {
    refetch();
    refetchStats();
  }

  async function confirmDeactivate() {
    setBusy(true);
    try {
      await userService.deactivate(deactivating.id);
      toast.success(`${deactivating.full_name} was deactivated.`);
      setDeactivating(null);
      refreshAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmReset() {
    setBusy(true);
    try {
      const res = await userService.resetPassword(resetting.id);
      const temp = res.data?.temporary_password;
      toast.success(`Temporary password: ${temp}`, 'Password reset');
      setResetting(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function reactivate(target) {
    try {
      await userService.update(target.id, { status: 'active' });
      toast.success(`${target.full_name} was reactivated.`);
      refreshAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="subtitle">Manage student, faculty and administrator accounts.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ ...EMPTY_USER })}>
          Add user
        </button>
      </div>

      {stats && (
        <div className="stat-grid" style={{ marginBottom: '1rem' }}>
          <StatCard label="Total users" value={stats.total} hint={`${stats.active} active`} tone="brand" icon="👥" />
          <StatCard label="Students" value={stats.students} tone="neutral" icon="🎓" />
          <StatCard label="Faculty" value={stats.faculty} tone="info" icon="👩‍🏫" />
          <StatCard label="Administrators" value={stats.admins} tone="warning" icon="🛡" />
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <input
            className="input search"
            type="search"
            placeholder="Search by name, email or ID number…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search users"
          />
          <select
            className="select"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by role"
          >
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="faculty">Faculty</option>
            <option value="student">Student</option>
          </select>
          <select
            className="select"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>
          {(search || role || status) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch('');
                setRole('');
                setStatus('');
                setPage(1);
              }}
            >
              Clear
            </button>
          )}
        </div>

        {loading && users.length === 0 ? (
          <Spinner label="Loading users…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : users.length === 0 ? (
          <EmptyState icon="👥" title="No users match your filters" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Last login</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="row" style={{ gap: '0.6rem' }}>
                          <span className="avatar" style={{ width: 32, height: 32, fontSize: '0.72rem' }}>
                            {initials(item.full_name)}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <strong className="truncate">{item.full_name}</strong>
                            {item.id === currentUser.id && (
                              <span className="badge badge-brand badge-plain" style={{ marginLeft: 6 }}>
                                You
                              </span>
                            )}
                            <div className="small muted truncate">{item.email}</div>
                          </span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge value={item.role} label={ROLE_LABEL[item.role]} />
                      </td>
                      <td>
                        <StatusBadge value={item.status} />
                      </td>
                      <td className="small muted nowrap">{formatDateTime(item.created_at)}</td>
                      <td className="small muted nowrap">
                        {item.last_login_at ? timeAgo(item.last_login_at) : 'Never'}
                      </td>
                      <td className="right nowrap">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setEditing(item)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setResetting(item)}
                        >
                          Reset
                        </button>
                        {item.status === 'active' ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setDeactivating(item)}
                            disabled={item.id === currentUser.id}
                            title={
                              item.id === currentUser.id
                                ? 'You cannot deactivate your own account'
                                : undefined
                            }
                            style={{ color: item.id === currentUser.id ? undefined : 'var(--danger)' }}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => reactivate(item)}
                            style={{ color: 'var(--success)' }}
                          >
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination pagination={data?.pagination} onPageChange={setPage} label="users" />
          </>
        )}
      </div>

      <UserFormModal
        user={editing}
        currentUser={currentUser}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refreshAll();
        }}
      />

      <ConfirmDialog
        open={Boolean(deactivating)}
        onClose={() => setDeactivating(null)}
        onConfirm={confirmDeactivate}
        busy={busy}
        title="Deactivate this user?"
        confirmLabel="Deactivate"
        message={
          deactivating
            ? `${deactivating.full_name} will no longer be able to sign in. Their booking history is kept, and you can reactivate the account later.`
            : ''
        }
      />

      <ConfirmDialog
        open={Boolean(resetting)}
        onClose={() => setResetting(null)}
        onConfirm={confirmReset}
        busy={busy}
        tone="primary"
        title="Reset this password?"
        confirmLabel="Generate password"
        message={
          resetting
            ? `A temporary password will be generated for ${resetting.full_name}. Share it with them securely — it is shown only once.`
            : ''
        }
      />
    </>
  );
}

/** Create/edit dialog. The same form serves both, keyed off `user.id`. */
function UserFormModal({ user, currentUser, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(user?.id);
  const [form, setForm] = useState(EMPTY_USER);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset the form whenever a different user is opened.
  const [lastKey, setLastKey] = useState(null);
  const key = user?.id ?? (user ? 'new' : null);
  if (key !== lastKey) {
    setLastKey(key);
    setForm(user ? { ...EMPTY_USER, ...user, password: '' } : EMPTY_USER);
    setErrors({});
    setBanner('');
  }

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBanner('');

    const nextErrors = {};
    if (form.full_name.trim().length < 2) nextErrors.full_name = 'Enter a full name.';
    if (!form.email.trim()) nextErrors.email = 'Email is required.';
    if (!isEdit && form.password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.';
    }
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);

    setBusy(true);
    try {
      if (isEdit) {
        const patch = {
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          role: form.role,
          status: form.status,
          department: form.department?.trim() ?? '',
          id_number: form.id_number?.trim() ?? '',
          phone: form.phone?.trim() ?? '',
        };
        await userService.update(user.id, patch);
        toast.success('User updated.');
      } else {
        await userService.create({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          status: form.status,
          department: form.department?.trim() ?? '',
          id_number: form.id_number?.trim() ?? '',
          phone: form.phone?.trim() ?? '',
        });
        toast.success('User created.');
      }
      onSaved();
    } catch (err) {
      setBanner(err.message);
      if (err.fields) setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  }

  const isSelf = isEdit && user.id === currentUser.id;

  return (
    <Modal
      open={Boolean(user)}
      onClose={busy ? () => {} : onClose}
      title={isEdit ? 'Edit user' : 'Add user'}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="user-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create user'}
          </button>
        </>
      }
    >
      <form id="user-form" className="stack" onSubmit={handleSubmit} noValidate>
        {banner && (
          <div className="alert alert-error" role="alert">
            {banner}
          </div>
        )}

        <div className="field">
          <label htmlFor="u-name">Full name</label>
          <input
            id="u-name"
            className={`input ${errors.full_name ? 'has-error' : ''}`}
            value={form.full_name}
            onChange={(e) => update('full_name', e.target.value)}
            disabled={busy}
          />
          {errors.full_name && <span className="field-error">{errors.full_name}</span>}
        </div>

        <div className="field">
          <label htmlFor="u-email">Email</label>
          <input
            id="u-email"
            type="email"
            className={`input ${errors.email ? 'has-error' : ''}`}
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            disabled={busy}
          />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </div>

        {!isEdit && (
          <div className="field">
            <label htmlFor="u-password">Temporary password</label>
            <input
              id="u-password"
              type="text"
              className={`input ${errors.password ? 'has-error' : ''}`}
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              placeholder="At least 8 characters"
              disabled={busy}
            />
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <label htmlFor="u-role">Role</label>
            <select
              id="u-role"
              className="select"
              value={form.role}
              onChange={(e) => update('role', e.target.value)}
              disabled={busy || isSelf}
            >
              <option value="student">Student</option>
              <option value="faculty">Faculty</option>
              <option value="admin">Administrator</option>
            </select>
            {isSelf && <span className="small muted">You cannot change your own role.</span>}
          </div>

          <div className="field">
            <label htmlFor="u-status">Status</label>
            <select
              id="u-status"
              className="select"
              value={form.status}
              onChange={(e) => update('status', e.target.value)}
              disabled={busy || isSelf}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="u-dept">Department</label>
            <input
              id="u-dept"
              className="input"
              value={form.department ?? ''}
              onChange={(e) => update('department', e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="field">
            <label htmlFor="u-idnum">ID number</label>
            <input
              id="u-idnum"
              className="input"
              value={form.id_number ?? ''}
              onChange={(e) => update('id_number', e.target.value)}
              disabled={busy}
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
