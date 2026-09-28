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
import Avatar from '../../components/Avatar.jsx';
import Modal, { ConfirmDialog } from '../../components/Modal.jsx';
import { formatDateTime, ROLE_LABEL, timeAgo } from '../../utils/format.js';

const ADMIN_ROLES = 'admin,super_admin';

const EMPTY_ADMIN = {
  full_name: '',
  email: '',
  password: '',
  role: 'admin',
  status: 'active',
  department: '',
};

/**
 * Manage Admins — the super admin's own screen.
 *
 * Everything here is also enforced by the API: the buttons this page
 * disables are the same operations userController refuses. The disabling is
 * courtesy, not security.
 */
export default function AdminAdministrators() {
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState(null);
  const [deactivating, setDeactivating] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [busy, setBusy] = useState(false);

  const debouncedSearch = useDebounce(search);

  const { data, loading, error, refetch } = useFetch(
    () =>
      userService.list({
        roles: ADMIN_ROLES,
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        status: status || undefined,
      }),
    [page, debouncedSearch, status]
  );

  /**
   * How many active super admins exist in total, not just on this page.
   * The API refuses to remove the last one; this is what lets the page say
   * so before the click rather than after.
   */
  const { data: superData, refetch: refetchSupers } = useFetch(
    () => userService.list({ role: 'super_admin', status: 'active', limit: 1 }),
    []
  );

  const admins = data?.data ?? [];
  const activeSupers = superData?.pagination?.total ?? 0;
  const total = data?.pagination?.total ?? 0;

  function refreshAll() {
    refetch();
    refetchSupers();
  }

  /** Why an account cannot be removed or demoted, or null when it can. */
  function lockReason(target) {
    if (target.id === currentUser.id) return 'This is the account you are signed in with';
    if (target.role === 'super_admin' && target.status === 'active' && activeSupers <= 1) {
      return 'The system must keep at least one active super administrator';
    }
    return null;
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
      toast.success(`Temporary password: ${res.data?.temporary_password}`, 'Password reset');
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
          <h1>Administrators</h1>
          <p className="subtitle">
            Accounts that can manage the system. Only a super administrator can see or change
            this list.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setEditing({ ...EMPTY_ADMIN })}
        >
          Add admin
        </button>
      </div>

      <div className="stat-grid" style={{ marginBottom: '1rem' }}>
        <StatCard label="Administrator accounts" value={total} tone="brand" icon="🛡" />
        <StatCard
          label="Active super admins"
          value={activeSupers}
          hint={activeSupers <= 1 ? 'The last one cannot be removed' : undefined}
          tone={activeSupers <= 1 ? 'warning' : 'success'}
          icon="👑"
        />
      </div>

      <div className="card">
        <div className="toolbar">
          <input
            className="input search"
            type="search"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search administrators"
          />
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
        </div>

        {loading && admins.length === 0 ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : admins.length === 0 ? (
          <EmptyState
            icon="🛡"
            title="No administrators found"
            message="No account matches these filters."
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Last login</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((item) => {
                    const locked = lockReason(item);
                    const isSelf = item.id === currentUser.id;

                    return (
                      <tr key={item.id}>
                        <td>
                          <div className="row" style={{ gap: '0.6rem' }}>
                            <Avatar user={item} size={32} />
                            <span style={{ minWidth: 0 }}>
                              <strong className="truncate">{item.full_name}</strong>
                              {isSelf && (
                                <span className="badge badge-brand badge-plain" style={{ marginLeft: 6 }}>
                                  You
                                </span>
                              )}
                              <div className="small muted truncate">{item.department || '—'}</div>
                            </span>
                          </div>
                        </td>
                        <td className="small">{item.email}</td>
                        <td>
                          <StatusBadge value={item.role} label={ROLE_LABEL[item.role]} />
                        </td>
                        <td>
                          <StatusBadge value={item.status} />
                        </td>
                        <td className="small muted nowrap">
                          {item.last_login_at ? (
                            <span title={formatDateTime(item.last_login_at)}>
                              {timeAgo(item.last_login_at)}
                            </span>
                          ) : (
                            'Never'
                          )}
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
                              disabled={Boolean(locked)}
                              title={locked ?? undefined}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => reactivate(item)}
                            >
                              Activate
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              pagination={data?.pagination}
              onPageChange={setPage}
              label="administrators"
            />
          </>
        )}
      </div>

      <AdminFormModal
        admin={editing}
        currentUser={currentUser}
        lockReason={editing ? lockReason(editing) : null}
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
        title="Deactivate administrator"
        message={
          deactivating
            ? `${deactivating.full_name} will lose access immediately. The account and its history are kept, and you can reactivate it later.`
            : ''
        }
        confirmLabel="Deactivate"
        busy={busy}
      />

      <ConfirmDialog
        open={Boolean(resetting)}
        onClose={() => setResetting(null)}
        onConfirm={confirmReset}
        title="Reset password"
        message={
          resetting
            ? `A temporary password will be generated for ${resetting.full_name}. Share it with them securely — it is shown once.`
            : ''
        }
        confirmLabel="Reset password"
        tone="warning"
        busy={busy}
      />
    </>
  );
}

/** Create or edit an administrator account. */
function AdminFormModal({ admin, currentUser, lockReason, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(admin?.id);
  const isSelf = isEdit && admin.id === currentUser.id;

  const [form, setForm] = useState(EMPTY_ADMIN);
  const [busy, setBusy] = useState(false);
  const [loadedFor, setLoadedFor] = useState(null);

  // Reset the form whenever a different account is opened.
  if (admin && loadedFor !== (admin.id ?? 'new')) {
    setLoadedFor(admin.id ?? 'new');
    setForm({
      ...EMPTY_ADMIN,
      ...admin,
      password: '',
      department: admin.department ?? '',
    });
  }

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);

    try {
      if (isEdit) {
        const patch = {
          full_name: form.full_name,
          email: form.email,
          department: form.department,
        };
        // Role and status are only sent when they actually changed, so an
        // ordinary rename never trips the last-super-admin guard.
        if (form.role !== admin.role) patch.role = form.role;
        if (form.status !== admin.status) patch.status = form.status;

        await userService.update(admin.id, patch);
        toast.success(`${form.full_name} was updated.`);
      } else {
        await userService.create({
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          role: form.role,
          status: form.status,
          department: form.department,
        });
        toast.success(`${form.full_name} can now sign in at the administrator portal.`);
      }
      onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(admin)}
      onClose={onClose}
      title={isEdit ? 'Edit administrator' : 'Add administrator'}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="admin-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create administrator'}
          </button>
        </>
      }
    >
      <form id="admin-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label htmlFor="a-name">Full name</label>
            <input
              id="a-name"
              className="input"
              value={form.full_name}
              onChange={(e) => update('full_name', e.target.value)}
              required
              minLength={2}
              disabled={busy}
            />
          </div>

          <div className="field">
            <label htmlFor="a-email">Email</label>
            <input
              id="a-email"
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              required
              disabled={busy}
            />
          </div>
        </div>

        {!isEdit && (
          <div className="field">
            <label htmlFor="a-password">Password</label>
            <input
              id="a-password"
              className="input"
              type="password"
              value={form.password}
              onChange={(e) => update('password', e.target.value)}
              required
              disabled={busy}
            />
            <span className="small muted">
              They can change this from their profile after signing in.
            </span>
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <label htmlFor="a-role">Role</label>
            <select
              id="a-role"
              className="select"
              value={form.role}
              onChange={(e) => update('role', e.target.value)}
              disabled={busy || isSelf || Boolean(lockReason)}
            >
              <option value="admin">Administrator</option>
              <option value="super_admin">Super Administrator</option>
            </select>
            {isSelf ? (
              <span className="small muted">You cannot change your own role.</span>
            ) : lockReason ? (
              <span className="small muted">{lockReason}.</span>
            ) : (
              <span className="small muted">
                A super administrator additionally manages admins, settings and audit logs.
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="a-status">Status</label>
            <select
              id="a-status"
              className="select"
              value={form.status}
              onChange={(e) => update('status', e.target.value)}
              disabled={busy || isSelf || Boolean(lockReason)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="a-department">Department</label>
          <input
            id="a-department"
            className="input"
            value={form.department}
            onChange={(e) => update('department', e.target.value)}
            placeholder="IT Services"
            disabled={busy}
          />
        </div>
      </form>
    </Modal>
  );
}
