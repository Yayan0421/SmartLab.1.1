import { useState } from 'react';
import adminService from '../../services/adminService.js';
import useFetch from '../../hooks/useFetch.js';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { BreakdownDonut, RankingBarChart } from '../../components/charts.jsx';
import { addDaysISO, formatNumber, ROLE_LABEL, todayISO } from '../../utils/format.js';

const PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

export default function AdminReports() {
  const [from, setFrom] = useState(addDaysISO(-29));
  const [to, setTo] = useState(todayISO());

  const { data, loading, error, refetch } = useFetch(
    () => adminService.reports({ from, to }),
    [from, to]
  );

  const report = data?.data;

  function applyPreset(days) {
    setFrom(addDaysISO(-(days - 1)));
    setTo(todayISO());
  }

  /** Exports the current view as CSV, generated in the browser. */
  function exportCsv() {
    if (!report) return;

    const lines = [
      ['SMARTLAB booking report'],
      [`Range,${report.range.from} to ${report.range.to}`],
      [],
      ['Summary'],
      ['Total bookings', report.totals.bookings],
      ['Total hours', report.totals.hours],
      ['Completed', report.totals.completed],
      ['Cancelled / rejected / expired', report.totals.cancelled],
      [],
      ['Bookings by status'],
      ...Object.entries(report.by_status).map(([status, count]) => [status, count]),
      [],
      ['Bookings by role'],
      ...Object.entries(report.by_role).map(([role, count]) => [role, count]),
      [],
      ['Most used computers'],
      ['Computer', 'Bookings', 'Hours'],
      ...report.top_computers.map((item) => [item.name, item.bookings, item.hours]),
      [],
      ['Most active users'],
      ['User', 'Role', 'Bookings', 'Hours'],
      ...report.top_users.map((item) => [item.name, item.role, item.bookings, item.hours]),
    ];

    const csv = lines
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smartlab-report-${report.range.from}-to-${report.range.to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="subtitle">Booking activity, utilisation and usage patterns.</p>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={exportCsv}
          disabled={!report || report.totals.bookings === 0}
        >
          Export CSV
        </button>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="toolbar" style={{ borderBottom: 'none' }}>
          {PRESETS.map((preset) => (
            <button
              key={preset.days}
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => applyPreset(preset.days)}
            >
              {preset.label}
            </button>
          ))}
          <span className="grow" />
          <div className="field">
            <label htmlFor="r-from">From</label>
            <input
              id="r-from"
              type="date"
              className="input"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="r-to">To</label>
            <input
              id="r-to"
              type="date"
              className="input"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      {loading && !report ? (
        <Spinner label="Building report…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !report || report.totals.bookings === 0 ? (
        <div className="card">
          <EmptyState
            icon="📈"
            title="No bookings in this range"
            message="Choose a wider date range to see activity."
          />
        </div>
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: '1rem' }}>
            <StatCard label="Total bookings" value={report.totals.bookings} tone="brand" icon="🗓" />
            <StatCard
              label="Laboratory hours"
              value={`${formatNumber(report.totals.hours, 1)} h`}
              hint="Total reserved time"
              tone="info"
              icon="⏱"
            />
            <StatCard label="Completed" value={report.totals.completed} tone="success" icon="✓" />
            <StatCard
              label="Not honoured"
              value={report.totals.cancelled}
              hint="Cancelled, rejected or expired"
              tone="warning"
              icon="✕"
            />
          </div>

          <div className="chart-grid" style={{ marginBottom: '1rem' }}>
            <section className="card">
              <div className="card-header">
                <h2>Bookings by status</h2>
              </div>
              <div className="card-body">
                <div className="chart-box">
                  <BreakdownDonut
                    data={Object.entries(report.by_status).map(([name, value]) => ({
                      name: name.charAt(0) + name.slice(1).toLowerCase(),
                      value,
                    }))}
                  />
                </div>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <h2>Bookings by role</h2>
              </div>
              <div className="card-body">
                <div className="chart-box">
                  <BreakdownDonut
                    data={Object.entries(report.by_role)
                      .filter(([, value]) => value > 0)
                      .map(([name, value]) => ({ name: ROLE_LABEL[name] ?? name, value }))}
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="chart-grid">
            <section className="card">
              <div className="card-header">
                <h2>Most used computers</h2>
              </div>
              <div className="card-body">
                <div className="chart-box">
                  <RankingBarChart
                    data={report.top_computers.map((item) => ({
                      name: item.name,
                      value: item.bookings,
                    }))}
                  />
                </div>
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <h2>Most active users</h2>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th className="num">Bookings</th>
                      <th className="num">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.top_users.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                        </td>
                        <td>
                          <StatusBadge value={item.role} label={ROLE_LABEL[item.role]} />
                        </td>
                        <td className="num">{item.bookings}</td>
                        <td className="num">{formatNumber(item.hours, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
