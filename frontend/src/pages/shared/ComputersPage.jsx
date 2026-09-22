import { useState } from 'react';
import computerService from '../../services/computerService.js';
import useFetch from '../../hooks/useFetch.js';
import useDebounce from '../../hooks/useDebounce.js';
import usePolling from '../../hooks/usePolling.js';
import ComputerCard from '../../components/ComputerCard.jsx';
import BookingFormModal from '../../components/BookingFormModal.jsx';
import Modal from '../../components/Modal.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Meter from '../../components/Meter.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Pagination from '../../components/Pagination.jsx';
import { formatDate, formatTimeRange, formatUptime, timeAgo } from '../../utils/format.js';

const STATUSES = ['AVAILABLE', 'IN_USE', 'RESERVED', 'MAINTENANCE', 'OFFLINE'];

/**
 * Browse-and-book grid shared by faculty and student.
 * Read-only: no role that reaches this page can edit a workstation.
 */
export default function ComputersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [bookingTarget, setBookingTarget] = useState(null);
  const [detailId, setDetailId] = useState(null);

  const debouncedSearch = useDebounce(search);

  const { data, loading, error, refetch } = useFetch(
    () =>
      computerService.list({
        page,
        limit: 24,
        search: debouncedSearch || undefined,
        status: status || undefined,
      }),
    [page, debouncedSearch, status]
  );

  // Keep the grid fresh without a tight poll; pauses when the tab is hidden.
  usePolling(refetch, 45_000);

  const computers = data?.data ?? [];

  function changeFilter(setter) {
    return (value) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Computers</h1>
          <p className="subtitle">Browse the laboratory and reserve an available workstation.</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setBookingTarget({})}>
          Book a computer
        </button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="toolbar" style={{ borderBottom: 'none' }}>
          <input
            className="input search"
            type="search"
            placeholder="Search by name or IP address…"
            value={search}
            onChange={(e) => changeFilter(setSearch)(e.target.value)}
            aria-label="Search computers"
          />
          <select
            className="select"
            value={status}
            onChange={(e) => changeFilter(setStatus)(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.replace('_', ' ')}
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
      </div>

      {loading && computers.length === 0 ? (
        <Spinner label="Loading computers…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : computers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="🖥"
            title="No computers match your filters"
            message="Try clearing the search or choosing a different status."
          />
        </div>
      ) : (
        <>
          <div className="pc-grid">
            {computers.map((computer) => (
              <ComputerCard
                key={computer.id}
                computer={computer}
                onBook={setBookingTarget}
                onView={(item) => setDetailId(item.id)}
              />
            ))}
          </div>

          <div className="card" style={{ marginTop: '1rem' }}>
            <Pagination
              pagination={data?.pagination}
              onPageChange={setPage}
              label="computers"
            />
          </div>
        </>
      )}

      <BookingFormModal
        open={Boolean(bookingTarget)}
        computer={bookingTarget?.id ? bookingTarget : null}
        onClose={() => setBookingTarget(null)}
        onCreated={refetch}
      />

      <ComputerDetailModal id={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

/** Read-only detail dialog: specs, live telemetry and what is booked next. */
export function ComputerDetailModal({ id, onClose }) {
  const { data, loading, error } = useFetch(
    () => (id ? computerService.get(id) : Promise.resolve(null)),
    [id],
    { immediate: Boolean(id) }
  );

  const computer = data?.data;

  return (
    <Modal open={Boolean(id)} onClose={onClose} title={computer?.name ?? 'Computer details'} size="lg">
      {loading && !computer ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} />
      ) : !computer ? null : (
        <div className="stack">
          <div className="row-between">
            <StatusBadge value={computer.status} />
            <span className="small muted">
              {computer.is_online ? 'Online' : 'Offline'} · {timeAgo(computer.telemetry?.heartbeat_at)}
            </span>
          </div>

          <div className="form-grid">
            <Detail label="Laboratory" value={computer.laboratory?.name} />
            <Detail label="Computer number" value={computer.computer_number} />
            <Detail label="IP address" value={computer.ip_address} mono />
            <Detail label="Operating system" value={computer.operating_system} />
            <Detail label="Uptime" value={formatUptime(computer.telemetry?.uptime_seconds)} />
            <Detail label="Specifications" value={computer.specs} />
          </div>

          <div>
            <div className="section-title">Live telemetry</div>
            <div className="stack" style={{ gap: '0.45rem' }}>
              <Meter label="CPU" value={computer.telemetry?.cpu_usage} />
              <Meter label="RAM" value={computer.telemetry?.ram_usage} />
              <Meter label="Disk" value={computer.telemetry?.disk_usage} />
              <Meter
                label="Temp"
                value={computer.telemetry?.temperature}
                suffix="°C"
                max={100}
                thresholds={{ warn: 70, danger: 82 }}
              />
            </div>
          </div>

          <div>
            <div className="section-title">Upcoming bookings</div>
            {computer.upcoming_bookings?.length ? (
              <div className="table-wrap table-cards-wrap">
                <table className="table table-cards">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computer.upcoming_bookings.map((item) => (
                      <tr key={item.id}>
                        <td className="nowrap" data-label="Date">{formatDate(item.booking_date)}</td>
                        <td className="nowrap" data-label="Time">{formatTimeRange(item.start_time, item.end_time)}</td>
                        <td data-label="Status">
                          <StatusBadge value={item.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="small muted">Nothing booked on this computer yet.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, value, mono = false }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={mono ? 'mono' : ''}>{value || '—'}</div>
    </div>
  );
}
