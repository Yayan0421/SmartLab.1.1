import { useState } from 'react';
import adminService from '../../services/adminService.js';
import useFetch from '../../hooks/useFetch.js';
import { useToast } from '../../context/ToastContext.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Pagination from '../../components/Pagination.jsx';
import Modal from '../../components/Modal.jsx';
import { formatDateTime, timeAgo } from '../../utils/format.js';
import { DAY_NAMES } from '../../utils/labConstants.js';

const TABS = [
  { key: 'booking', label: 'Booking rules' },
  { key: 'energy', label: 'Energy' },
  { key: 'laboratories', label: 'Laboratories' },
  { key: 'audit', label: 'Audit log' },
];

export default function AdminSettings() {
  const [tab, setTab] = useState('booking');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">System configuration and the administrator audit trail.</p>
        </div>
      </div>

      <div className="card">
        <div className="toolbar" style={{ paddingBottom: 0 }}>
          <div className="tabs" style={{ border: 'none', flex: 1 }}>
            {TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`tab ${tab === item.key ? 'is-active' : ''}`}
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'booking' && <BookingSettings />}
        {tab === 'energy' && <EnergySettings />}
        {tab === 'laboratories' && <Laboratories />}
        {tab === 'audit' && <AuditLog />}
      </div>
    </>
  );
}

/** Reads one settings group out of the /admin/settings payload. */
function useSettingsGroup(key) {
  const { data, loading, error, refetch } = useFetch(() => adminService.settings(), []);
  const group = (data?.data ?? []).find((row) => row.key === key);
  return { value: group?.value, updatedAt: group?.updated_at, loading, error, refetch };
}

function BookingSettings() {
  const toast = useToast();
  const { value, updatedAt, loading, error, refetch } = useSettingsGroup('booking');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  // Seed the form once the stored values arrive.
  if (value && form === null) setForm({ ...value });

  if (loading && !form) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!form) return null;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      if (!form.open_days?.length) {
        setBusy(false);
        return toast.error('Choose at least one open day.');
      }
      if (form.open_time >= form.close_time) {
        setBusy(false);
        return toast.error('The closing time must be after the opening time.');
      }

      await adminService.updateSetting('booking', {
        max_active_per_user: Number(form.max_active_per_user),
        max_hours_per_booking: Number(form.max_hours_per_booking),
        advance_days: Number(form.advance_days),
        auto_approve_faculty: Boolean(form.auto_approve_faculty),
        auto_approve_student: Boolean(form.auto_approve_student),
        open_days: [...form.open_days].sort((a, b) => a - b),
        open_time: form.open_time,
        close_time: form.close_time,
      });
      toast.success('Booking rules saved.');
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card-body stack" onSubmit={save}>
      <div className="alert alert-info">
        These rules are enforced on the server for every booking request, so changing them here
        applies to the API as well as the booking form.
      </div>

      {/* Which days and hours the laboratory is open. */}
      <div>
        <div className="section-title">Laboratory opening days</div>
        <div className="row wrap" style={{ gap: '0.4rem' }}>
          {DAY_NAMES.map((name, index) => {
            const active = form.open_days?.includes(index);
            return (
              <button
                key={name}
                type="button"
                className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() =>
                  setForm({
                    ...form,
                    open_days: active
                      ? form.open_days.filter((d) => d !== index)
                      : [...(form.open_days ?? []), index],
                  })
                }
                disabled={busy}
                aria-pressed={active}
              >
                {name.slice(0, 3)}
              </button>
            );
          })}
        </div>
        <p className="small muted" style={{ marginTop: '0.4rem' }}>
          Closed days are never offered on the booking screens, and the API refuses them.
        </p>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="s-open">Opens at</label>
          <input
            id="s-open"
            type="time"
            className="input"
            value={form.open_time ?? '07:00'}
            onChange={(e) => setForm({ ...form, open_time: e.target.value })}
            disabled={busy}
          />
        </div>

        <div className="field">
          <label htmlFor="s-close">Closes at</label>
          <input
            id="s-close"
            type="time"
            className="input"
            value={form.close_time ?? '17:00'}
            onChange={(e) => setForm({ ...form, close_time: e.target.value })}
            disabled={busy}
          />
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="s-active">Maximum active bookings per user</label>
          <input
            id="s-active"
            type="number"
            min="1"
            max="20"
            className="input"
            value={form.max_active_per_user}
            onChange={(e) => setForm({ ...form, max_active_per_user: e.target.value })}
            disabled={busy}
          />
        </div>

        <div className="field">
          <label htmlFor="s-hours">Maximum hours per booking</label>
          <input
            id="s-hours"
            type="number"
            min="1"
            max="12"
            className="input"
            value={form.max_hours_per_booking}
            onChange={(e) => setForm({ ...form, max_hours_per_booking: e.target.value })}
            disabled={busy}
          />
        </div>

        <div className="field">
          <label htmlFor="s-advance">How far ahead bookings can be made (days)</label>
          <input
            id="s-advance"
            type="number"
            min="1"
            max="120"
            className="input"
            value={form.advance_days}
            onChange={(e) => setForm({ ...form, advance_days: e.target.value })}
            disabled={busy}
          />
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="s-faculty">Faculty bookings</label>
          <select
            id="s-faculty"
            className="select"
            value={form.auto_approve_faculty ? 'auto' : 'manual'}
            onChange={(e) => setForm({ ...form, auto_approve_faculty: e.target.value === 'auto' })}
            disabled={busy}
          >
            <option value="auto">Approve automatically</option>
            <option value="manual">Require administrator approval</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="s-student">Student bookings</label>
          <select
            id="s-student"
            className="select"
            value={form.auto_approve_student ? 'auto' : 'manual'}
            onChange={(e) => setForm({ ...form, auto_approve_student: e.target.value === 'auto' })}
            disabled={busy}
          >
            <option value="auto">Approve automatically</option>
            <option value="manual">Require administrator approval</option>
          </select>
        </div>
      </div>

      <div className="row-between">
        <span className="small muted">
          {updatedAt ? `Last changed ${timeAgo(updatedAt)}` : ''}
        </span>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save booking rules'}
        </button>
      </div>
    </form>
  );
}

function EnergySettings() {
  const toast = useToast();
  const { value, loading, error, refetch } = useSettingsGroup('energy');
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  if (value && form === null) setForm({ ...value });

  if (loading && !form) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;
  if (!form) return null;

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await adminService.updateSetting('energy', {
        rate_per_kwh: Number(form.rate_per_kwh),
        currency: form.currency,
      });
      toast.success('Energy settings saved.');
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card-body stack" onSubmit={save}>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="s-rate">Electricity rate per kWh</label>
          <input
            id="s-rate"
            type="number"
            step="0.01"
            min="0"
            className="input"
            value={form.rate_per_kwh}
            onChange={(e) => setForm({ ...form, rate_per_kwh: e.target.value })}
            disabled={busy}
          />
          <span className="small muted">Used for every cost estimate on the energy page.</span>
        </div>

        <div className="field">
          <label htmlFor="s-currency">Currency</label>
          <select
            id="s-currency"
            className="select"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
            disabled={busy}
          >
            <option value="PHP">PHP — Philippine peso</option>
            <option value="USD">USD — US dollar</option>
            <option value="EUR">EUR — Euro</option>
          </select>
        </div>
      </div>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save energy settings'}
        </button>
      </div>
    </form>
  );
}

function Laboratories() {
  const toast = useToast();
  const { data, loading, error, refetch } = useFetch(() => adminService.laboratories(), []);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', building: '', room_number: '', capacity: '' });
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState('');

  const laboratories = data?.data ?? [];

  async function create(event) {
    event.preventDefault();
    setBanner('');
    if (form.name.trim().length < 2) return setBanner('Enter a laboratory name.');

    setBusy(true);
    try {
      await adminService.createLaboratory({
        name: form.name.trim(),
        building: form.building.trim(),
        room_number: form.room_number.trim(),
        capacity: Number(form.capacity) || 0,
      });
      toast.success('Laboratory created.');
      setOpen(false);
      setForm({ name: '', building: '', room_number: '', capacity: '' });
      refetch();
    } catch (err) {
      setBanner(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && laboratories.length === 0) return <Spinner />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  return (
    <>
      <div className="toolbar">
        <span className="grow" />
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
          Add laboratory
        </button>
      </div>

      {laboratories.length === 0 ? (
        <EmptyState
          icon="🏛"
          title="No laboratories yet"
          message="Create a laboratory before adding computers."
        />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Building</th>
                <th>Room</th>
                <th className="num">Capacity</th>
                <th className="num">Computers</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {laboratories.map((lab) => (
                <tr key={lab.id}>
                  <td>
                    <strong>{lab.name}</strong>
                  </td>
                  <td>{lab.building || '—'}</td>
                  <td>{lab.room_number || '—'}</td>
                  <td className="num">{lab.capacity}</td>
                  <td className="num">{lab.computer_count}</td>
                  <td>
                    <span className={`badge badge-${lab.is_active ? 'success' : 'neutral'}`}>
                      {lab.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={open}
        onClose={busy ? () => {} : () => setOpen(false)}
        title="Add laboratory"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" form="lab-form" className="btn btn-primary" disabled={busy}>
              {busy ? 'Creating…' : 'Create laboratory'}
            </button>
          </>
        }
      >
        <form id="lab-form" className="stack" onSubmit={create} noValidate>
          {banner && (
            <div className="alert alert-error" role="alert">
              {banner}
            </div>
          )}

          <div className="field">
            <label htmlFor="l-name">Name</label>
            <input
              id="l-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Computer Laboratory 2"
              disabled={busy}
            />
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="l-building">Building</label>
              <input
                id="l-building"
                className="input"
                value={form.building}
                onChange={(e) => setForm({ ...form, building: e.target.value })}
                disabled={busy}
              />
            </div>

            <div className="field">
              <label htmlFor="l-room">Room number</label>
              <input
                id="l-room"
                className="input"
                value={form.room_number}
                onChange={(e) => setForm({ ...form, room_number: e.target.value })}
                disabled={busy}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="l-capacity">Capacity</label>
            <input
              id="l-capacity"
              type="number"
              min="0"
              className="input"
              value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })}
              disabled={busy}
            />
          </div>
        </form>
      </Modal>
    </>
  );
}

function AuditLog() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const { data, loading, error, refetch } = useFetch(
    () => adminService.auditLogs({ page, limit: 25, search: search || undefined }),
    [page, search]
  );

  const logs = data?.data ?? [];

  return (
    <>
      <div className="toolbar">
        <input
          className="input search"
          type="search"
          placeholder="Search by action, entity or email…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search audit log"
        />
      </div>

      {loading && logs.length === 0 ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : logs.length === 0 ? (
        <EmptyState icon="📋" title="No audit entries" message="Administrator actions are recorded here." />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="small nowrap" title={formatDateTime(log.created_at)}>
                      {timeAgo(log.created_at)}
                    </td>
                    <td className="small">{log.actor_email ?? 'system'}</td>
                    <td>
                      <span className="badge badge-neutral badge-plain">{log.action}</span>
                    </td>
                    <td className="small muted">
                      {log.entity}
                      {log.entity_id ? (
                        <span className="mono"> · {String(log.entity_id).slice(0, 8)}</span>
                      ) : null}
                    </td>
                    <td className="small mono muted">{log.ip_address ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination pagination={data?.pagination} onPageChange={setPage} label="entries" />
        </>
      )}
    </>
  );
}
