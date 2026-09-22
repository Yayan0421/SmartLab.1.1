import { useState } from 'react';
import bookingService from '../../services/bookingService.js';
import useFetch from '../../hooks/useFetch.js';
import useRefreshOnFocus from '../../hooks/useRefreshOnFocus.js';
import { useToast } from '../../context/ToastContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Pagination from '../../components/Pagination.jsx';
import BookingFormModal from '../../components/BookingFormModal.jsx';
import { ConfirmDialog } from '../../components/Modal.jsx';
import { formatDate, formatTimeRange, todayISO } from '../../utils/format.js';

const TABS = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'History' },
  { key: '', label: 'All' },
];

/** "My bookings" for faculty and student — identical rules for both. */
export default function MyBookingsPage() {
  const toast = useToast();
  const [scope, setScope] = useState('upcoming');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const { data, loading, error, refetch } = useFetch(
    () =>
      bookingService.mine({
        page,
        limit: 15,
        scope: scope || undefined,
        status: status || undefined,
        order: scope === 'past' ? 'desc' : 'asc',
      }),
    [page, scope, status]
  );

  // An admin may approve or reject while this page sits open, so pick up
  // the change as soon as the user comes back to the tab.
  useRefreshOnFocus(refetch);

  const bookings = data?.data ?? [];

  /** Only a future, still-active booking can be cancelled by its owner. */
  function canCancel(booking) {
    if (!['PENDING', 'APPROVED'].includes(booking.status)) return false;
    const today = todayISO();
    if (booking.booking_date > today) return true;
    if (booking.booking_date < today) return false;
    const now = new Date();
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    return booking.start_time > clock;
  }

  async function confirmCancel() {
    setCancelling(true);
    try {
      await bookingService.cancel(cancelTarget.id);
      toast.success('Booking cancelled.');
      setCancelTarget(null);
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My bookings</h1>
          <p className="subtitle">Your reservations and their current status.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
          Book a computer
        </button>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="tabs" style={{ border: 'none', flex: 1 }}>
            {TABS.map((tab) => (
              <button
                key={tab.key || 'all'}
                type="button"
                className={`tab ${scope === tab.key ? 'is-active' : ''}`}
                onClick={() => {
                  setScope(tab.key);
                  setPage(1);
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

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
            {['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'EXPIRED'].map((value) => (
              <option key={value} value={value}>
                {value.charAt(0) + value.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </div>

        {loading && bookings.length === 0 ? (
          <Spinner label="Loading your bookings…" />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : bookings.length === 0 ? (
          <EmptyState
            icon="🗓"
            title="No bookings to show"
            message={
              scope === 'upcoming'
                ? 'You have no upcoming sessions. Book a computer to get started.'
                : 'Nothing in this view yet.'
            }
            action={
              scope === 'upcoming' ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
                  Book a computer
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="table-wrap table-cards-wrap">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>Computer</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Subject</th>
                    <th>Purpose</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td data-label="Computer">
                        <strong>{booking.computer?.name ?? '—'}</strong>
                        <div className="small muted">{booking.computer?.laboratory?.name ?? ''}</div>
                      </td>
                      <td className="nowrap" data-label="Date">{formatDate(booking.booking_date)}</td>
                      <td className="nowrap" data-label="Time">{formatTimeRange(booking.start_time, booking.end_time)}</td>
                      <td style={{ maxWidth: 180 }} data-label="Subject">
                        <div className="truncate" title={booking.subject}>
                          {booking.subject || '—'}
                        </div>
                      </td>
                      <td style={{ maxWidth: 220 }} data-label="Purpose">
                        <div className="truncate" title={booking.purpose}>
                          {booking.purpose || '—'}
                        </div>
                        {booking.decision_note && (
                          <div className="small muted truncate" title={booking.decision_note}>
                            Note: {booking.decision_note}
                          </div>
                        )}
                      </td>
                      <td data-label="Status">
                        <StatusBadge value={booking.status} />
                      </td>
                      <td className="right">
                        {canCancel(booking) && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setCancelTarget(booking)}
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

      <BookingFormModal open={creating} onClose={() => setCreating(false)} onCreated={refetch} />

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
        busy={cancelling}
        title="Cancel this booking?"
        confirmLabel="Cancel booking"
        message={
          cancelTarget
            ? `${cancelTarget.computer?.name ?? 'This computer'} on ${formatDate(
                cancelTarget.booking_date
              )} at ${formatTimeRange(cancelTarget.start_time, cancelTarget.end_time)} will be released for others to book.`
            : ''
        }
      />
    </>
  );
}
