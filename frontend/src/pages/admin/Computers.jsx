import { useState } from 'react';
import computerService from '../../services/computerService.js';
import useFetch from '../../hooks/useFetch.js';
import useDebounce from '../../hooks/useDebounce.js';
import usePolling from '../../hooks/usePolling.js';
import { useToast } from '../../context/ToastContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import ComputerCard from '../../components/ComputerCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Pagination from '../../components/Pagination.jsx';
import Modal, { ConfirmDialog } from '../../components/Modal.jsx';
import { ComputerDetailModal } from '../shared/ComputersPage.jsx';
import { timeAgo } from '../../utils/format.js';

const STATUSES = ['AVAILABLE', 'IN_USE', 'RESERVED', 'MAINTENANCE', 'OFFLINE'];

const EMPTY_COMPUTER = {
  computer_number: '',
  name: '',
  laboratory_id: '',
  ip_address: '',
  operating_system: 'Windows 11 Pro',
  specs: '',
  status: 'AVAILABLE',
  is_bookable: true,
};

export default function AdminComputers() {
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [view, setView] = useState('grid');
  const [page, setPage] = useState(1);

  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [busy, setBusy] = useState(false);

  const debouncedSearch = useDebounce(search);

  const { data, loading, error, refetch } = useFetch(
    () =>
      computerService.list({
        page,
        limit: view === 'grid' ? 24 : 20,
        search: debouncedSearch || undefined,
        status: status || undefined,
      }),
    [page, debouncedSearch, status, view]
  );

  const { data: statsData, refetch: refetchStats } = useFetch(() => computerService.stats(), []);
  const { data: labsData } = useFetch(() => computerService.laboratories(), []);

  usePolling(() => {
    refetch();
    refetchStats();
  }, 45_000);

  const computers = data?.data ?? [];
  const stats = statsData?.data;
  const laboratories = labsData?.data ?? [];

  async function confirmDelete() {
    setBusy(true);
    try {
      await computerService.remove(deleting.id);
      toast.success(`${deleting.name} was removed.`);
      setDeleting(null);
      refetch();
      refetchStats();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Computers</h1>
          <p className="subtitle">Manage the workstations in your laboratories.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setEditing({ ...EMPTY_COMPUTER, laboratory_id: laboratories[0]?.id ?? '' })}
          disabled={laboratories.length === 0}
          title={laboratories.length === 0 ? 'Create a laboratory first' : undefined}
        >
          Add computer
        </button>
      </div>

      {stats && (
        <div className="stat-grid" style={{ marginBottom: '1rem' }}>
          <StatCard label="Total" value={stats.total} hint={`${stats.online} online`} tone="brand" icon="🖥" />
          <StatCard label="Available" value={stats.available} tone="success" icon="✓" />
          <StatCard label="In use" value={stats.in_use} tone="info" icon="👤" />
          <StatCard label="Maintenance" value={stats.maintenance} tone="warning" icon="🔧" />
          <StatCard label="Offline" value={stats.offline} tone="neutral" icon="⏻" />
        </div>
      )}

      <div className="card">
        <div className="toolbar">
          <input
            className="input search"
            type="search"
            placeholder="Search by name or IP address…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search computers"
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
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replace('_', ' ')}
              </option>
            ))}
          </select>

          <div className="tabs" style={{ border: 'none' }}>
            <button
              type="button"
              className={`tab ${view === 'grid' ? 'is-active' : ''}`}
              onClick={() => setView('grid')}
            >
              Grid
            </button>
            <button
              type="button"
              className={`tab ${view === 'table' ? 'is-active' : ''}`}
              onClick={() => setView('table')}
            >
              Table
            </button>
          </div>
        </div>

        {loading && computers.length === 0 ? (
          <Spinner label="Loading computers…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : computers.length === 0 ? (
          <EmptyState
            icon="🖥"
            title="No computers found"
            message="Add a workstation or adjust your filters."
          />
        ) : (
          <>
            {view === 'grid' ? (
              <div className="card-body">
                <div className="pc-grid">
                  {computers.map((computer) => (
                    <ComputerCard
                      key={computer.id}
                      computer={computer}
                      onView={(item) => setDetailId(item.id)}
                      onBook={null}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Laboratory</th>
                      <th>IP address</th>
                      <th>Status</th>
                      <th className="num">CPU</th>
                      <th className="num">RAM</th>
                      <th className="num">Temp</th>
                      <th>Last seen</th>
                      <th className="right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computers.map((computer) => (
                      <tr key={computer.id}>
                        <td className="muted">{computer.computer_number}</td>
                        <td>
                          <strong>{computer.name}</strong>
                          <div className="small muted">{computer.operating_system ?? '—'}</div>
                        </td>
                        <td className="small">{computer.laboratory?.name ?? '—'}</td>
                        <td className="mono small">{computer.ip_address ?? '—'}</td>
                        <td>
                          <StatusBadge value={computer.status} />
                        </td>
                        <td className="num">{Number(computer.telemetry?.cpu_usage ?? 0).toFixed(0)}%</td>
                        <td className="num">{Number(computer.telemetry?.ram_usage ?? 0).toFixed(0)}%</td>
                        <td className="num">{Number(computer.telemetry?.temperature ?? 0).toFixed(0)}°C</td>
                        <td className="small muted nowrap">
                          {timeAgo(computer.telemetry?.heartbeat_at ?? computer.last_seen_at)}
                        </td>
                        <td className="right nowrap">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setDetailId(computer.id)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setEditing(computer)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => setDeleting(computer)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Pagination pagination={data?.pagination} onPageChange={setPage} label="computers" />
          </>
        )}
      </div>

      <ComputerFormModal
        computer={editing}
        laboratories={laboratories}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refetch();
          refetchStats();
        }}
      />

      <ComputerDetailModal id={detailId} onClose={() => setDetailId(null)} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        busy={busy}
        title="Delete this computer?"
        confirmLabel="Delete"
        message={
          deleting
            ? `${deleting.name} will be removed permanently. If it has active bookings the server will refuse — set it to maintenance instead.`
            : ''
        }
      />
    </>
  );
}

function ComputerFormModal({ computer, laboratories, onClose, onSaved }) {
  const toast = useToast();
  const isEdit = Boolean(computer?.id);
  const [form, setForm] = useState(EMPTY_COMPUTER);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [busy, setBusy] = useState(false);

  const [lastKey, setLastKey] = useState(null);
  const key = computer?.id ?? (computer ? 'new' : null);
  if (key !== lastKey) {
    setLastKey(key);
    setForm(
      computer
        ? {
            ...EMPTY_COMPUTER,
            ...computer,
            laboratory_id: computer.laboratory_id ?? computer.laboratory?.id ?? '',
          }
        : EMPTY_COMPUTER
    );
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
    if (!String(form.name).trim()) nextErrors.name = 'Enter a computer name.';
    if (!form.computer_number) nextErrors.computer_number = 'Enter a computer number.';
    if (!form.laboratory_id) nextErrors.laboratory_id = 'Choose a laboratory.';
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);

    const payload = {
      computer_number: Number(form.computer_number),
      name: String(form.name).trim(),
      laboratory_id: form.laboratory_id,
      ip_address: form.ip_address?.trim() ?? '',
      operating_system: form.operating_system?.trim() ?? '',
      specs: form.specs?.trim() ?? '',
      status: form.status,
      is_bookable: Boolean(form.is_bookable),
    };

    setBusy(true);
    try {
      if (isEdit) {
        await computerService.update(computer.id, payload);
        toast.success('Computer updated.');
      } else {
        await computerService.create(payload);
        toast.success('Computer added.');
      }
      onSaved();
    } catch (err) {
      setBanner(err.message);
      if (err.fields) setErrors(err.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(computer)}
      onClose={busy ? () => {} : onClose}
      title={isEdit ? `Edit ${computer.name}` : 'Add computer'}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="computer-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add computer'}
          </button>
        </>
      }
    >
      <form id="computer-form" className="stack" onSubmit={handleSubmit} noValidate>
        {banner && (
          <div className="alert alert-error" role="alert">
            {banner}
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <label htmlFor="c-name">Name</label>
            <input
              id="c-name"
              className={`input ${errors.name ? 'has-error' : ''}`}
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="PC-01"
              disabled={busy}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="field">
            <label htmlFor="c-number">Computer number</label>
            <input
              id="c-number"
              type="number"
              min="1"
              className={`input ${errors.computer_number ? 'has-error' : ''}`}
              value={form.computer_number}
              onChange={(e) => update('computer_number', e.target.value)}
              disabled={busy}
            />
            {errors.computer_number && <span className="field-error">{errors.computer_number}</span>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="c-lab">Laboratory</label>
          <select
            id="c-lab"
            className={`select ${errors.laboratory_id ? 'has-error' : ''}`}
            value={form.laboratory_id}
            onChange={(e) => update('laboratory_id', e.target.value)}
            disabled={busy}
          >
            <option value="">Select a laboratory…</option>
            {laboratories.map((lab) => (
              <option key={lab.id} value={lab.id}>
                {lab.name}
              </option>
            ))}
          </select>
          {errors.laboratory_id && <span className="field-error">{errors.laboratory_id}</span>}
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="c-ip">IP address</label>
            <input
              id="c-ip"
              className={`input ${errors.ip_address ? 'has-error' : ''}`}
              value={form.ip_address ?? ''}
              onChange={(e) => update('ip_address', e.target.value)}
              placeholder="192.168.10.101"
              disabled={busy}
            />
            {errors.ip_address && <span className="field-error">{errors.ip_address}</span>}
          </div>

          <div className="field">
            <label htmlFor="c-os">Operating system</label>
            <input
              id="c-os"
              className="input"
              value={form.operating_system ?? ''}
              onChange={(e) => update('operating_system', e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="c-specs">Specifications</label>
          <textarea
            id="c-specs"
            className="textarea"
            value={form.specs ?? ''}
            onChange={(e) => update('specs', e.target.value)}
            placeholder="Intel Core i5 / 16GB RAM / 512GB SSD"
            disabled={busy}
          />
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="c-status">Status</label>
            <select
              id="c-status"
              className="select"
              value={form.status}
              onChange={(e) => update('status', e.target.value)}
              disabled={busy}
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="c-bookable">Bookable</label>
            <select
              id="c-bookable"
              className="select"
              value={form.is_bookable ? 'yes' : 'no'}
              onChange={(e) => update('is_bookable', e.target.value === 'yes')}
              disabled={busy}
            >
              <option value="yes">Students and faculty can book this</option>
              <option value="no">Not available for booking</option>
            </select>
          </div>
        </div>
      </form>
    </Modal>
  );
}
