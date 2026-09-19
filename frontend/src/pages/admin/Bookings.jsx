import { useState } from 'react';
import bookingService from '../../services/bookingService.js';
import computerService from '../../services/computerService.js';
import useFetch from '../../hooks/useFetch.js';
import useRefreshOnFocus from '../../hooks/useRefreshOnFocus.js';
import useDebounce from '../../hooks/useDebounce.js';
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

export default function AdminBookings() {
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [computerId, setComputerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const [decision, setDecision] = useState(null); // { booking, action }
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const debouncedSearch = useDebounce(search);

  const { data, loading, error, refetch } = useFetch(
    () =>
      bookingService.list({
        page,
        limit: 20,
        search: debouncedSearch || undefined,
        status: status || undefined,
        computer_id: computerId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        sort: 'booking_date',
        order: 'desc',
      }),
    [page, debouncedSearch, status, computerId, dateFrom, dateTo]
  );

  const { data: statsData, refetch: refetchStats } = useFetch(() => bookingService.stats(), []);
  const { data: computersData } = useFetch(
    () => computerService.list({ limit: 100 }),
    []
  );

  useRefreshOnFocus(() => {
    refetch();
    refetchStats();
  });

  const bookings = data?.data ?? [];
  const stats = statsData?.data;
  const computers = computersData?.data ?? [];

  function openDecision(booking, action) {
    setDecision({ booking, action });
    setNote('');
  }

  async function submitDecision() {
    const { booking, action } = decision;
    setBusy(true);
    try {
      if (action === 'approve') await bookingService.approve(booking.id, note || undefined);
      else if (action === 'reject') await bookingService.reject(booking.id, note || undefined);
      else await bookingService.cancel(booking.id);

      toast.success(
        action === 'approve'
          ? 'Booking approved.'
          : action === 'reject'
            ? 'Booking rejected.'
            : 'Booking cancelled.'
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
          <h1>Bookings</h1>
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
            aria-label="Search bookings"
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

        {loading && bookings.length === 0 ? (
          <Spinner label="Loading bookings…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : bookings.length === 0 ? (
          <EmptyState icon="🗓" title="No bookings match your filters" />
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
                  {bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>
                        <strong>{booking.user?.full_name ?? '—'}</strong>
                        <div className="small muted">
                          {ROLE_LABEL[booking.user?.role] ?? booking.user?.role}
                        </div>
                      </td>
                      <td>
                        <strong>{booking.computer?.name ?? '—'}</strong>
                        <div className="small muted">{booking.computer?.laboratory?.name ?? ''}</div>
                      </td>
                      <td className="nowrap">{formatDate(booking.booking_date)}</td>
                      <td className="nowrap">
                        {formatTimeRange(booking.start_time, booking.end_time)}
                      </td>
                      <td style={{ maxWidth: 170 }}>
                        <div className="truncate" title={booking.subject}>
                          {booking.subject || '—'}
                        </div>
                      </td>
                      <td style={{ maxWidth: 190 }}>
                        <div className="truncate" title={booking.purpose}>
                          {booking.purpose || '—'}
                        </div>
                      </td>
                      <td>
                        <StatusBadge value={booking.status} />
                      </td>
                      <td className="right nowrap">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setDetail(booking)}
                        >
                          View
                        </button>
                        {booking.status === 'PENDING' && (
                          <>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--success)' }}
                              onClick={() => openDecision(booking, 'approve')}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => openDecision(booking, 'reject')}
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {booking.status === 'APPROVED' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => openDecision(booking, 'cancel')}
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

            <Pagination pagination={data?.pagination} onPageChange={setPage} label="bookings" />
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
            ? 'Approve this booking?'
            : decision?.action === 'reject'
              ? 'Reject this booking?'
              : 'Cancel this booking?'
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
                    : 'Cancel booking'}
            </button>
          </>
        }
      >
        {decision && (
          <div className="stack">
            <div className="alert alert-info">
              <div>
                <strong>{decision.booking.user?.full_name}</strong> ·{' '}
                {decision.booking.computer?.name}
                <div className="small">
                  {formatDate(decision.booking.booking_date)} ·{' '}
                  {formatTimeRange(decision.booking.start_time, decision.booking.end_time)}
                </div>
              </div>
            </div>

            <p className="small muted">{decision.booking.purpose}</p>

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

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title="Booking details" size="lg">
        {detail && (
          <div className="form-grid">
            <Detail label="Booking ID" value={detail.id} mono />
            <Detail label="Status" value={<StatusBadge value={detail.status} />} />
            <Detail label="User" value={detail.user?.full_name} />
            <Detail label="Role" value={ROLE_LABEL[detail.user?.role]} />
            <Detail label="Email" value={detail.user?.email} />
            <Detail label="Department" value={detail.user?.department} />
            <Detail label="Computer" value={detail.computer?.name} />
            <Detail label="Laboratory" value={detail.computer?.laboratory?.name} />
            <Detail label="Date" value={formatDate(detail.booking_date)} />
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

function Detail({ label, value, mono = false }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={mono ? 'mono small' : ''}>{value || '—'}</div>
    </div>
  );
}
