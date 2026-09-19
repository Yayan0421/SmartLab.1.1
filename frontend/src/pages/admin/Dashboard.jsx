import { Link } from 'react-router-dom';
import adminService from '../../services/adminService.js';
import useFetch from '../../hooks/useFetch.js';
import usePolling from '../../hooks/usePolling.js';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { EnergyAreaChart, BookingBarChart, BreakdownDonut } from '../../components/charts.jsx';
import { formatCurrency, formatDate, formatTimeRange, timeAgo } from '../../utils/format.js';

export default function AdminDashboard() {
  const { data, loading, error, refetch } = useFetch(() => adminService.adminDashboard(), []);

  // One aggregate request per minute keeps the dashboard current without
  // putting 30 separate queries behind every open admin tab.
  usePolling(refetch, 60_000);

  const stats = data?.data;

  if (loading && !stats) return <Spinner label="Loading dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const { computers, bookings, users, energy, recent_bookings: recent } = stats;

  const computerBreakdown = [
    { name: 'Available', value: computers.available, color: '#2f7d54' },
    { name: 'In use', value: computers.in_use, color: '#2c5c86' },
    { name: 'Reserved', value: computers.reserved, color: '#9b1d30' },
    { name: 'Maintenance', value: computers.maintenance, color: '#b26a05' },
    { name: 'Offline', value: computers.offline, color: '#9a8a84' },
  ].filter((item) => item.value > 0);

  const userBreakdown = [
    { name: 'Students', value: users.students },
    { name: 'Faculty', value: users.faculty },
    { name: 'Admins', value: users.admins },
  ].filter((item) => item.value > 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="subtitle">
            Laboratory overview · updated {new Date().toLocaleTimeString()}
          </p>
        </div>
        <div className="row">
          <Link to="/admin/bookings" className="btn btn-secondary">
            Review bookings
            {bookings.pending > 0 && (
              <span className="badge badge-brand badge-plain">{bookings.pending}</span>
            )}
          </Link>
          <Link to="/admin/monitoring" className="btn btn-primary">
            Live monitoring
          </Link>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: '1rem' }}>
        <StatCard
          label="Total computers"
          value={computers.total}
          hint={`${computers.online} online · ${computers.offline} offline`}
          tone="brand"
          icon="🖥"
        />
        <StatCard
          label="Available"
          value={computers.available}
          hint={`${computers.in_use} currently in use`}
          tone="success"
          icon="✓"
        />
        <StatCard
          label="Pending bookings"
          value={bookings.pending}
          hint="Awaiting your approval"
          tone={bookings.pending > 0 ? 'warning' : 'neutral'}
          icon="⏳"
        />
        <StatCard
          label="Today's bookings"
          value={bookings.today}
          hint="Scheduled for today"
          tone="info"
          icon="🗓"
        />
        <StatCard
          label="Registered users"
          value={users.total}
          hint={`${users.active} active accounts`}
          tone="neutral"
          icon="👥"
        />
        <StatCard
          label="Energy today"
          value={`${energy.today_kwh.toFixed(2)} kWh`}
          hint={`≈ ${formatCurrency(energy.today_cost, energy.currency)}`}
          tone="warning"
          icon="⚡"
        />
      </div>

      <div className="chart-grid" style={{ marginBottom: '1rem' }}>
        <section className="card">
          <div className="card-header">
            <h2>Energy consumption today</h2>
            <Link to="/admin/energy" className="small">
              Energy management
            </Link>
          </div>
          <div className="card-body">
            <div className="chart-box">
              <EnergyAreaChart data={energy.hourly} />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Booking activity · last 7 days</h2>
          </div>
          <div className="card-body">
            <div className="chart-box">
              <BookingBarChart data={bookings.weekly} />
            </div>
          </div>
        </section>
      </div>

      <div className="chart-grid" style={{ marginBottom: '1rem' }}>
        <section className="card">
          <div className="card-header">
            <h2>Computer status</h2>
            <span className="small muted">{computers.utilization}% utilisation</span>
          </div>
          <div className="card-body">
            <div className="chart-box-sm chart-box">
              <BreakdownDonut data={computerBreakdown} height={230} />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Users by role</h2>
            <Link to="/admin/users" className="small">
              Manage users
            </Link>
          </div>
          <div className="card-body">
            <div className="chart-box-sm chart-box">
              <BreakdownDonut data={userBreakdown} height={230} />
            </div>
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header">
          <h2>Latest booking requests</h2>
          <Link to="/admin/bookings" className="small">
            View all
          </Link>
        </div>

        {recent.length === 0 ? (
          <EmptyState icon="🗓" title="No bookings yet" message="New requests will appear here." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Computer</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Requested</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((booking) => (
                  <tr key={booking.id}>
                    <td>
                      <strong>{booking.user?.full_name ?? '—'}</strong>
                      <div className="small muted">
                        <StatusBadge value={booking.user?.role} plain />
                      </div>
                    </td>
                    <td>{booking.computer?.name ?? '—'}</td>
                    <td className="nowrap">{formatDate(booking.booking_date)}</td>
                    <td className="nowrap">
                      {formatTimeRange(booking.start_time, booking.end_time)}
                    </td>
                    <td>
                      <StatusBadge value={booking.status} />
                    </td>
                    <td className="small muted nowrap">{timeAgo(booking.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
