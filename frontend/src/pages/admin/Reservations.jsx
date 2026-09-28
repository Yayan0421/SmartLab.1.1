import { useState } from 'react';
import reservationService from '../../services/reservationService.js';
import computerService from '../../services/computerService.js';
import useFetch from '../../hooks/useFetch.js';
import useRefreshOnFocus from '../../hooks/useRefreshOnFocus.js';
import useDebounce from '../../hooks/useDebounce.js';
import adminService from '../../services/adminService.js';
import ReservationGroups from './ReservationGroups.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Pagination from '../../components/Pagination.jsx';
import Modal from '../../components/Modal.jsx';
import {
  formatDate,
  formatDateTime,
  formatTimeRange,
  ROLE_LABEL,
  timeAgo,
} from '../../utils/format.js';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'EXPIRED'];

export default function AdminReservations() {
  const toast = useToast();
  // Grouped first: one row per reservation is what an administrator is
  // actually deciding on.
  const [tab, setTab] = useState('groups');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [computerId, setComputerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [decision, setDecision] = useState(null); // { reservation, action }
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const debouncedSearch = useDebounce(search);

  const { data, loading, error, refetch } = useFetch(
    () =>
      reservationService.list({
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        status: status || undefined,
        computer_id: computerId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort: 'reservation_date',
        order: 'desc',
      }),
    [page, debouncedSearch, status, computerId, dateFrom, dateTo]
  );

  const { data: statsData, refetch: refetchStats } = useFetch(() => reservationService.stats(), []);
  const { data: computersData } = useFetch(
    () => computerService.list({ limit: 100 }),
    []
  );

  useRefreshOnFocus(() => {
    refetch();
    refetchStats();
  });

  const reservations = data?.data ?? [];
  const stats = statsData?.data;
  const computers = computersData?.data ?? [];

  function openDecision(reservation, action) {
    setDecision({ reservation, action });
    setNote('');
  }

  async function submitDecision() {
    const { reservation, action } = decision;
    setBusy(true);
    try {
      if (action === 'approve') await reservationService.approve(reservation.id, note || undefined);
      else if (action === 'reject') await reservationService.reject(reservation.id, note || undefined);
      else await reservationService.cancel(reservation.id);

      toast.success(
        action === 'approve'
          ? 'Reservation approved.'
          : action === 'reject'
            ? 'Reservation rejected.'
            : 'Reservation cancelled.'
      );
      setDecision(null);
      refetch();
      refetchStats();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  function clearFilters() {
    setSearch('');
    setStatus('');
    setComputerId('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const hasFilters = search || status || computerId || dateFrom || dateTo;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reservations</h1>
          <p className="subtitle">Review, approve and manage every reservation.</p>
        </div>
        {stats?.pending > 0 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setStatus('PENDING');
              setPage(1);
            }}
          >
            Review {stats.pending} pending
          </button>
        )}
      </div>

      {stats && (
        <div className="stat-grid" style={{ marginBottom: '1rem' }}>
          <StatCard
            label="Pending"
            value={stats.pending}
            hint="Awaiting a decision"
            tone={stats.pending > 0 ? 'warning' : 'neutral'}
            icon="⏳"
          />
          <StatCard label="Today" value={stats.today} hint="Scheduled today" tone="info" icon="🗓" />
          <StatCard
            label="Upcoming approved"
            value={stats.approved_upcoming}
            tone="success"
            icon="✓"
          />
          <StatCard label="All time" value={stats.total} tone="brand" icon="Σ" />
        </div>
      )}

      <div className="card">
        <div className="toolbar" style={{ paddingBottom: 0 }}>
          <div className="tabs" style={{ border: 'none', flex: 1 }}>
            <button
              type="button"
              className={`tab ${tab === 'groups' ? 'is-active' : ''}`}
              onClick={() => setTab('groups')}
            >
              Reservations
            </button>
            <button
              type="button"
              className={`tab ${tab === 'reservations' ? 'is-active' : ''}`}
              onClick={() => setTab('reservations')}
            >
              Every computer
            </button>
            <button
              type="button"
              className={`tab ${tab === 'checkins' ? 'is-active' : ''}`}
              onClick={() => setTab('checkins')}
            >
              Kiosk check-ins
            </button>
          </div>
        </div>

        {tab === 'groups' && <ReservationGroups />}
        {tab === 'checkins' && <CheckIns />}

        {tab === 'reservations' && (
        <>
        <div className="toolbar">
          <input
            className="input search"
            type="search"
            placeholder="Search purpose…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            aria-label="Search reservations"
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
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <select
            className="select"
            value={computerId}
            onChange={(e) => {
              setComputerId(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by computer"
          >
            <option value="">All computers</option>
            {computers.map((computer) => (
              <option key={computer.id} value={computer.id}>
                {computer.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="input"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            aria-label="From date"
          />
          <input
            type="date"
            className="input"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            aria-label="To date"
          />
          {hasFilters && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Clear
            </button>
          )}
        </div>

        {loading && reservations.length === 0 ? (
          <Spinner label="Loading reservations…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : reservations.length === 0 ? (
          <EmptyState icon="🗓" title="No reservations match your filters" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Computer</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Subject</th>
                    <th>Purpose</th>
                    <th>Status</th>
                    <th className="right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((reservation) => (
                    <tr key={reservation.id}>
                      <td>
                        <strong>{reservation.user?.full_name ?? '—'}</strong>
                        <div className="small muted">
                          {ROLE_LABEL[reservation.user?.role] ?? reservation.user?.role}
                        </div>
                      </td>
                      <td>
                        <strong>{reservation.computer?.name ?? '—'}</strong>
                        <div className="small muted">{reservation.computer?.laboratory?.name ?? ''}</div>
                      </td>
                      <td className="nowrap">{formatDate(reservation.reservation_date)}</td>
                      <td className="nowrap">
                        {formatTimeRange(reservation.start_time, reservation.end_time)}
                      </td>
                      <td style={{ maxWidth: 170 }}>
                        <div className="truncate" title={reservation.subject}>
                          {reservation.subject || '—'}
                        </div>
                      </td>
                      <td style={{ maxWidth: 190 }}>
                        <div className="truncate" title={reservation.purpose}>
                          {reservation.purpose || '—'}
                        </div>
                      </td>
                      <td>
                        <StatusBadge value={reservation.status} />
                      </td>
                      <td className="right nowrap">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDetail(reservation)}
                        >
                          View
                        </button>
                        {reservation.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--success)' }}
                              onClick={() => openDecision(reservation, 'approve')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => openDecision(reservation, 'reject')}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {reservation.status === 'APPROVED' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => openDecision(reservation, 'cancel')}
                          >
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination pagination={data?.pagination} onPageChange={setPage} label="reservations" />
          </>
        )}
        </>
        )}
      </div>

      {/* Decision dialog: approve and reject accept an optional note that is
          delivered to the requester as a notification. */}
      <Modal
        open={Boolean(decision)}
        onClose={busy ? () => {} : () => setDecision(null)}
        title={
          decision?.action === 'approve'
            ? 'Approve this reservation?'
            : decision?.action === 'reject'
              ? 'Reject this reservation?'
              : 'Cancel this reservation?'
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDecision(null)}
              disabled={busy}
            >
              Back
            </button>
            <button
              type="button"
              className={`btn ${decision?.action === 'approve' ? 'btn-success' : 'btn-danger'}`}
              onClick={submitDecision}
              disabled={busy}
            >
              {busy
                ? 'Working…'
                : decision?.action === 'approve'
                  ? 'Approve'
                  : decision?.action === 'reject'
                    ? 'Reject'
                    : 'Cancel reservation'}
            </button>
          </>
        }
      >
        {decision && (
          <div className="stack">
            <div className="alert alert-info">
              <div>
                <strong>{decision.reservation.user?.full_name}</strong> ·{' '}
                {decision.reservation.computer?.name}
                <div className="small">
                  {formatDate(decision.reservation.reservation_date)} ·{' '}
                  {formatTimeRange(decision.reservation.start_time, decision.reservation.end_time)}
                </div>
              </div>
            </div>

            <p className="small muted">{decision.reservation.purpose}</p>

            {decision.action !== 'cancel' && (
              <div className="field">
                <label htmlFor="decision-note">
                  Note to the requester <span className="subtle">(optional)</span>
                </label>
                <textarea
                  id="decision-note"
                  className="textarea"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  placeholder={
                    decision.action === 'reject'
                      ? 'Let them know why, e.g. the laboratory is reserved for a class.'
                      : 'Anything they should know before their session.'
                  }
                  disabled={busy}
                />
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Reservation details" size="lg">
        {detail && (
          <div className="form-grid">
            <Detail label="Reservation ID" value={detail.id} mono />
            <Detail label="Status" value={<StatusBadge value={detail.status} />} />
            <Detail label="User" value={detail.user?.full_name} />
            <Detail label="Role" value={ROLE_LABEL[detail.user?.role]} />
            <Detail label="Email" value={detail.user?.email} />
            <Detail label="Department" value={detail.user?.department} />
            <Detail label="Computer" value={detail.computer?.name} />
            <Detail label="Laboratory" value={detail.computer?.laboratory?.name} />
            <Detail label="Date" value={formatDate(detail.reservation_date)} />
            <Detail label="Time" value={formatTimeRange(detail.start_time, detail.end_time)} />
            <Detail label="Requested" value={formatDateTime(detail.created_at)} />
            <Detail
              label="Decision"
              value={detail.approved_at ? `${timeAgo(detail.approved_at)}` : 'Not decided'}
            />
            <Detail label="Subject" value={detail.subject} />
            <div style={{ gridColumn: '1 / -1' }}>
              <Detail label="Purpose" value={detail.purpose} />
            </div>
            {detail.decision_note && (
              <div style={{ gridColumn: '1 / -1' }}>
                <Detail label="Decision note" value={detail.decision_note} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/**
 * Receipts issued at the kiosk: who actually turned up, when, and on which
 * machine. A reservation says what was promised; this says what happened.
 */
function CheckIns() {
  const [page, setPage] = useState(1);
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search);

  const { data, loading, error, refetch } = useFetch(
    () =>
      adminService.receipts({
        page,
        limit: 20,
        date: date || undefined,
        search: debounced || undefined,
      }),
    [page, date, debounced]
  );

  const rows = data?.data ?? [];

  return (
    <>
      <div className="toolbar">
        <input
          className="input search"
          type="search"
          placeholder="Search receipt number…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          aria-label="Search receipts"
        />
        <input
          type="date"
          className="input"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by date"
        />
        {(search || date) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setDate('');
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {loading && rows.length === 0 ? (
        <Spinner label="Loading check-ins…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="🧾"
          title="No check-ins yet"
          message="Receipts appear here when students check in at the kiosk."
        />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Student</th>
                  <th>Computer</th>
                  <th>Reserved</th>
                  <th>Checked in</th>
                  <th>Photo</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="mono small">{row.receipt_no}</td>
                    <td>
                      <strong>{row.user?.full_name}</strong>
                      <div className="small muted">{row.user?.course || row.user?.department}</div>
                    </td>
                    <td>{row.computer?.name}</td>
                    <td className="nowrap small">
                      {formatDate(row.reservation_date)}
                      <div className="muted">
                        {formatTimeRange(row.start_time, row.end_time)}
                      </div>
                    </td>
                    <td className="nowrap small">{formatDateTime(row.checked_in_at)}</td>
                    <td>
                      {row.check_in_photo_url ? (
                        <a href={row.check_in_photo_url} target="_blank" rel="noreferrer">
                          <img
                            src={row.check_in_photo_url}
                            alt=""
                            style={{ width: 44, height: 33, objectFit: 'cover', borderRadius: 6 }}
                          />
                        </a>
                      ) : (
                        <span className="small muted">—</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge value={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination pagination={data?.pagination} onPageChange={setPage} label="check-ins" />
        </>
      )}
    </>
  );
}

function Detail({ label, value, mono = false }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={mono ? 'mono small' : ''}>{value || '—'}</div>
    </div>
  );
}
