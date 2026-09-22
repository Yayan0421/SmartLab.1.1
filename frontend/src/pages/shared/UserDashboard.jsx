import { useState } from 'react';
import { Link } from 'react-router-dom';
import adminService from '../../services/adminService.js';
import useFetch from '../../hooks/useFetch.js';
import useRefreshOnFocus from '../../hooks/useRefreshOnFocus.js';
import { useAuth } from '../../context/AuthContext.jsx';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import BookingFormModal from '../../components/BookingFormModal.jsx';
import { formatDate, formatTimeRange, timeAgo } from '../../utils/format.js';

/**
 * The faculty and student landing page.
 *
 * Both roles see exactly the same information and capabilities, so they
 * share one implementation; only the surrounding layout differs.
 */
export default function UserDashboard() {
  const { user } = useAuth();
  const [booking, setBooking] = useState(false);

  const { data, loading, error, refetch } = useFetch(() => adminService.myDashboard(), []);

  // Booking decisions land while the dashboard is open; refresh on return.
  useRefreshOnFocus(refetch);

  const stats = data?.data;

  if (loading && !stats) return <Spinner label="Loading your dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const firstName = user?.full_name?.split(' ')[0] ?? 'there';
  const base = `/${user?.role}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome back, {firstName}</h1>
          <p className="subtitle">
            {stats.available_computers} of {stats.total_computers} computers are free right now.
          </p>
        </div>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => setBooking(true)}>
          Book a computer
        </button>
      </div>

      <div className="stat-grid" style={{ marginBottom: '1.25rem' }}>
        <StatCard
          label="Available now"
          value={stats.available_computers}
          hint={`of ${stats.total_computers} workstations`}
          tone="success"
          icon="🖥"
        />
        <StatCard
          label="Active bookings"
          value={stats.active_bookings}
          hint="Approved or awaiting approval"
          tone="brand"
          icon="🗓"
        />
        <StatCard
          label="Upcoming"
          value={stats.upcoming_bookings}
          hint="Confirmed for a future date"
          tone="info"
          icon="⏭"
        />
        <StatCard
          label="Completed"
          value={stats.completed_bookings}
          hint="Sessions finished"
          tone="neutral"
          icon="✓"
        />
      </div>

      <div className="chart-grid">
        <section className="card">
          <div className="card-header">
            <h2>Your next sessions</h2>
            <Link to={`${base}/bookings`} className="small">
              View all
            </Link>
          </div>

          {stats.next_bookings.length === 0 ? (
            <EmptyState
              icon="🗓"
              title="No upcoming bookings"
              message="Reserve a workstation and it will show up here."
              action={
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setBooking(true)}>
                  Book a computer
                </button>
              }
            />
          ) : (
            <div className="table-wrap table-cards-wrap">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>Computer</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.next_bookings.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Computer">
                        <strong>{item.computer?.name ?? '—'}</strong>
                        <div className="small muted">{item.computer?.laboratory?.name ?? ''}</div>
                      </td>
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
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Notifications</h2>
            {stats.unread_notifications > 0 && (
              <span className="badge badge-brand">{stats.unread_notifications} unread</span>
            )}
          </div>

          {stats.recent_notifications.length === 0 ? (
            <EmptyState icon="🔕" title="Nothing new" message="Updates about your bookings appear here." />
          ) : (
            <div>
              {stats.recent_notifications.map((item) => (
                <div
                  key={item.id}
                  className={`notif-item ${item.is_read ? '' : 'is-unread'}`}
                  style={{ cursor: 'default' }}
                >
                  <div className="notif-title">{item.title}</div>
                  {item.message && <div className="notif-msg">{item.message}</div>}
                  <div className="notif-time">{timeAgo(item.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <BookingFormModal
        open={booking}
        onClose={() => setBooking(false)}
        onCreated={refetch}
      />
    </>
  );
}
