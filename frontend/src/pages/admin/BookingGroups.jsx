import { useState } from 'react';
import bookingService from '../../services/bookingService.js';
import useFetch from '../../hooks/useFetch.js';
import useDebounce from '../../hooks/useDebounce.js';
import useRefreshOnFocus from '../../hooks/useRefreshOnFocus.js';
import { useToast } from '../../context/ToastContext.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Pagination from '../../components/Pagination.jsx';
import Modal from '../../components/Modal.jsx';
import { formatDate, formatTimeRange, ROLE_LABEL, timeAgo } from '../../utils/format.js';

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'EXPIRED'];

/**
 * Bookings grouped by reservation.
 *
 * A faculty member reserving a class writes one row per machine, but it is
 * one request by one person: approving it thirty times would be absurd.
 * Each group here is a single reservation, expandable to the machines it
 * covers, and decided in one action.
 */
export default function BookingGroups() {
  const toast = useToast();

  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [decision, setDecision] = useState(null); // { group, action }
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const debounced = useDebounce(search);

  const { data, loading, error, refetch } = useFetch(
    () =>
      bookingService.groups({
        page,
        limit: 20,
        status: status || undefined,
        search: debounced || undefined,
      }),
    [page, status, debounced]
  );

  useRefreshOnFocus(refetch);

  const groups = data?.data ?? [];

  async function decide() {
    const { group, action } = decision;
    setBusy(true);
    try {
      // A single booking has no batch, so it takes the ordinary route.
      const res = group.batch_id
        ? await bookingService.decideBatch(group.batch_id, action, note || undefined)
        : await bookingService[action](group.id, note || undefined);

      toast.success(res.message ?? 'Done.');
      setDecision(null);
      setNote('');
      refetch();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="toolbar">
        <input
          className="input search"
          type="search"
          placeholder="Search subject or purpose…"
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
        {(search || status) && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSearch('');
              setStatus('');
              setPage(1);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {loading && groups.length === 0 ? (
        <Spinner label="Loading bookings…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : groups.length === 0 ? (
        <EmptyState icon="🗓" title="No bookings match your filters" />
      ) : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Computers</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Subject</th>
                  <th>Status</th>
                  <th className="right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const isOpen = expanded === group.key;
                  const canDecide = group.pending_count > 0;
                  const canCancel = group.computers.some((c) =>
                    ['PENDING', 'APPROVED'].includes(c.status)
                  );

                  return (
                    <>
                      <tr key={group.key}>
                        <td>
                          <strong>{group.user?.full_name ?? '—'}</strong>
                          <div className="small muted">
                            {ROLE_LABEL[group.user?.role] ?? group.user?.role}
                            {group.user?.course ? ` · ${group.user.course}` : ''}
                          </div>
                        </td>

                        <td>
                          {/* The number is the point of this view. */}
                          <button
                            type="button"
                            className="group-count"
                            onClick={() => setExpanded(isOpen ? null : group.key)}
                            title="Show the machines in this booking"
                          >
                            <strong>{group.count}</strong>
                            {group.count === 1 ? 'computer' : 'computers'}
                            <span className={`group-caret ${isOpen ? 'is-open' : ''}`}>▾</span>
                          </button>
                          {group.count === 1 && (
                            <div className="small muted">{group.computers[0].computer?.name}</div>
                          )}
                          {group.checked_in_count > 0 && (
                            <div className="small" style={{ color: 'var(--success)' }}>
                              {group.checked_in_count} checked in
                            </div>
                          )}
                        </td>

                        <td className="nowrap">{formatDate(group.booking_date)}</td>
                        <td className="nowrap">
                          {formatTimeRange(group.start_time, group.end_time)}
                        </td>
                        <td style={{ maxWidth: 180 }}>
                          <div className="truncate" title={group.subject}>
                            {group.subject || '—'}
                          </div>
                          <div className="small muted truncate">{group.purpose}</div>
                        </td>

                        <td>
                          {group.status === 'MIXED' ? (
                            <span className="badge badge-neutral" title="The machines are not all in the same state">
                              Mixed
                            </span>
                          ) : (
                            <StatusBadge value={group.status} />
                          )}
                          {group.pending_count > 0 && group.status === 'MIXED' && (
                            <div className="small muted">{group.pending_count} pending</div>
                          )}
                        </td>

                        <td className="right nowrap">
                          {canDecide && (
                            <>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--success)' }}
                                onClick={() => setDecision({ group, action: 'approve' })}
                              >
                                Approve{group.count > 1 ? ` all ${group.pending_count}` : ''}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)' }}
                                onClick={() => setDecision({ group, action: 'reject' })}
                              >
                                Reject
                              </button>
                            </>
                          )}
                          {!canDecide && canCancel && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => setDecision({ group, action: 'cancel' })}
                            >
                              Cancel
                            </button>
                          )}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr key={`${group.key}-detail`} className="group-detail">
                          <td colSpan={7}>
                            <div className="group-machines">
                              {group.computers.map((item) => (
                                <div key={item.booking_id} className="group-machine">
                                  <strong>{item.computer?.name}</strong>
                                  <StatusBadge value={item.status} />
                                  {item.checked_in_at && (
                                    <span className="small muted">
                                      in {timeAgo(item.checked_in_at)}
                                      {item.receipt_no ? ` · ${item.receipt_no}` : ''}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination pagination={data?.pagination} onPageChange={setPage} label="bookings" />
        </>
      )}

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
              onClick={decide}
              disabled={busy}
            >
              {busy ? 'Working…' : decision?.action === 'approve' ? 'Approve' : decision?.action === 'reject' ? 'Reject' : 'Cancel booking'}
            </button>
          </>
        }
      >
        {decision && (
          <div className="stack">
            <div className="alert alert-info">
              <div>
                <strong>{decision.group.user?.full_name}</strong> ·{' '}
                {decision.group.count === 1
                  ? decision.group.computers[0].computer?.name
                  : `${decision.group.count} computers`}
                <div className="small">
                  {formatDate(decision.group.booking_date)} ·{' '}
                  {formatTimeRange(decision.group.start_time, decision.group.end_time)} ·{' '}
                  {decision.group.subject}
                </div>
              </div>
            </div>

            {decision.group.count > 1 && decision.action === 'approve' && (
              <p className="small muted">
                All {decision.group.pending_count} machines are checked again before approval — if
                one was taken in the meantime, the rest still go through and you are told which
                did not.
              </p>
            )}

            {decision.action !== 'cancel' && (
              <div className="field">
                <label htmlFor="grp-note">
                  Note to the requester <span className="subtle">(optional)</span>
                </label>
                <textarea
                  id="grp-note"
                  className="textarea"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  disabled={busy}
                />
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
