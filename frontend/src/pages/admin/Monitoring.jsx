import { useState } from 'react';
import computerService from '../../services/computerService.js';
import controlService from '../../services/controlService.js';
import useFetch from '../../hooks/useFetch.js';
import usePolling from '../../hooks/usePolling.js';
import StatCard from '../../components/StatCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import Meter from '../../components/Meter.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Modal from '../../components/Modal.jsx';
import { TrendLineChart } from '../../components/charts.jsx';
import ControlPanel from '../../components/ControlPanel.jsx';
import { formatUptime, meterTone, timeAgo } from '../../utils/format.js';

const REFRESH_MS = 15_000;

/**
 * Live monitoring wall.
 *
 * Agents push heartbeats to the API; this page reads the aggregated
 * snapshot every 15 seconds while the tab is visible. That is one request
 * per admin per interval, not one per machine — the panel scales to 30+
 * workstations without multiplying queries.
 */
export default function AdminMonitoring() {
  const [detailId, setDetailId] = useState(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [view, setView] = useState('screens');

  const { data, loading, error, refetch } = useFetch(() => computerService.monitoring(), []);

  // Screens refresh faster than telemetry: a still image that lags by 15s
  // is not much use for seeing what somebody is doing right now.
  const { data: screenData, refetch: refetchScreens } = useFetch(
    () => controlService.screens(),
    []
  );

  usePolling(() => {
    refetch();
    refetchScreens();
  }, REFRESH_MS);

  const payload = data?.data;
  // Keyed by computer id by the API, so each tile looks its own up directly.
  const screens = screenData?.data ?? {};

  if (loading && !payload) return <Spinner label="Connecting to monitoring…" />;
  if (error) return <ErrorState message={error} onRetry={refetch} />;

  const { computers, summary } = payload;

  const visible = onlyProblems
    ? computers.filter((c) => !c.is_online || c.cpu_usage >= 85 || c.temperature >= 75)
    : computers;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Monitoring</h1>
          <p className="subtitle">
            Live workstation telemetry · refreshes every {REFRESH_MS / 1000}s while this tab is open
          </p>
        </div>
        <div className="row">
          <div className="tabs" style={{ border: 'none' }}>
            <button
              type="button"
              className={`tab ${view === 'screens' ? 'is-active' : ''}`}
              onClick={() => setView('screens')}
            >
              Screens
            </button>
            <button
              type="button"
              className={`tab ${view === 'stats' ? 'is-active' : ''}`}
              onClick={() => setView('stats')}
            >
              Telemetry
            </button>
          </div>

          <button
            type="button"
            className={`btn btn-sm ${onlyProblems ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setOnlyProblems((value) => !value)}
          >
            {onlyProblems ? 'Showing issues only' : 'Show issues only'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={refetch}>
            Refresh now
          </button>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: '1rem' }}>
        <StatCard
          label="Online"
          value={summary.online}
          hint={`of ${summary.total} workstations`}
          tone="success"
          icon="◉"
        />
        <StatCard
          label="Offline"
          value={summary.offline}
          hint="No recent heartbeat"
          tone={summary.offline > 0 ? 'danger' : 'neutral'}
          icon="⏻"
        />
        <StatCard label="Average CPU" value={`${summary.avg_cpu}%`} tone="info" icon="⚙" />
        <StatCard label="Average RAM" value={`${summary.avg_ram}%`} tone="brand" icon="▦" />
        <StatCard
          label="Average temp"
          value={`${summary.avg_temperature}°C`}
          hint={summary.hot_count > 0 ? `${summary.hot_count} running hot` : 'All within range'}
          tone={summary.hot_count > 0 ? 'warning' : 'neutral'}
          icon="🌡"
        />
      </div>

      {view === 'screens' && visible.length > 0 && (
        <div className="screen-wall">
          {visible.map((computer) => {
            const shot = screens[computer.id];
            return (
              <article key={computer.id} className={`screen-tile state-${computer.status}`}>
                <button
                  type="button"
                  className="screen-frame"
                  onClick={() => setDetailId(computer.id)}
                  title="Open this workstation"
                >
                  {shot ? (
                    <img src={shot.image_url} alt={`Screen of ${computer.name}`} loading="lazy" />
                  ) : (
                    <span className="screen-none">
                      {computer.is_online ? 'Waiting for a capture…' : 'Offline'}
                    </span>
                  )}

                  {computer.is_locked && (
                    <span className="screen-locked" aria-hidden="true">🔒 Frozen</span>
                  )}
                </button>

                <div className="screen-meta">
                  <div className="row-between">
                    <strong>{computer.name}</strong>
                    <StatusBadge value={computer.status} />
                  </div>
                  <div className="small muted truncate">
                    {computer.logged_in_user || computer.current_user?.full_name || 'Nobody signed in'}
                    {shot ? ` · ${timeAgo(shot.captured_at)}` : ''}
                  </div>
                </div>

                <ControlPanel computer={computer} onDone={refetchScreens} />
              </article>
            );
          })}
        </div>
      )}

      {visible.length === 0 && (
        <div className="card">
          <EmptyState
            icon="✓"
            title={onlyProblems ? 'Nothing needs attention' : 'No computers registered'}
            message={
              onlyProblems
                ? 'Every workstation is online and running within normal limits.'
                : 'Add computers to start monitoring them.'
            }
          />
        </div>
      )}

      {view === 'stats' && visible.length > 0 && (
        <div className="pc-grid">
          {visible.map((computer) => (
            <article
              key={computer.id}
              className={`pc-card state-${computer.status}`}
              onClick={() => setDetailId(computer.id)}
              style={{ cursor: 'pointer' }}
            >
              <header className="pc-head">
                <div>
                  <div className="pc-name">{computer.name}</div>
                  <div className="pc-meta mono">{computer.ip_address ?? 'No IP'}</div>
                </div>
                <StatusBadge value={computer.status} />
              </header>

              <div className="pc-metrics">
                <Meter label="CPU" value={computer.cpu_usage} />
                <Meter label="RAM" value={computer.ram_usage} />
                <Meter label="Disk" value={computer.disk_usage} />
                <Meter
                  label="Temp"
                  value={computer.temperature}
                  suffix="°C"
                  max={100}
                  thresholds={{ warn: 70, danger: 82 }}
                />
              </div>

              <div className="pc-meta">
                {computer.current_user ? (
                  <>In use by {computer.current_user.full_name}</>
                ) : computer.is_online ? (
                  <>Idle · up {formatUptime(computer.uptime_seconds)}</>
                ) : (
                  <>Last seen {timeAgo(computer.last_seen_at)}</>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <MonitoringDetailModal id={detailId} onClose={() => setDetailId(null)} />
    </>
  );
}

/** Per-machine drilldown with its recent power and temperature history. */
function MonitoringDetailModal({ id, onClose }) {
  const { data, loading, error, refetch } = useFetch(
    () => (id ? computerService.monitoringDetail(id) : Promise.resolve(null)),
    [id],
    { immediate: Boolean(id) }
  );

  // Keep the drilldown live too, but only while it is actually open.
  usePolling(refetch, REFRESH_MS, Boolean(id));

  const computer = data?.data;

  const history = (computer?.history ?? []).map((row) => ({
    time: new Date(row.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    power: Number(row.power_watt) || 0,
    temperature: Number(row.temperature) || 0,
  }));

  return (
    <Modal open={Boolean(id)} onClose={onClose} title={computer?.name ?? 'Workstation'} size="lg">
      {loading && !computer ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !computer ? null : (
        <div className="stack">
          <div className="row-between">
            <StatusBadge value={computer.status} />
            <span className="small muted">
              Heartbeat {timeAgo(computer.last_seen_at)}
            </span>
          </div>

          <div className="stat-grid">
            <div className="stat is-info">
              <div className="stat-label">CPU</div>
              <div className={`stat-value ${meterTone(computer.cpu_usage)}`}>
                {computer.cpu_usage.toFixed(0)}%
              </div>
            </div>
            <div className="stat is-brand">
              <div className="stat-label">RAM</div>
              <div className="stat-value">{computer.ram_usage.toFixed(0)}%</div>
            </div>
            <div className="stat is-neutral">
              <div className="stat-label">Disk</div>
              <div className="stat-value">{computer.disk_usage.toFixed(0)}%</div>
            </div>
            <div className="stat is-warning">
              <div className="stat-label">Temperature</div>
              <div className="stat-value">{computer.temperature.toFixed(0)}°C</div>
            </div>
          </div>

          <div className="form-grid">
            <Detail label="IP address" value={computer.ip_address} mono />
            <Detail label="Operating system" value={computer.operating_system} />
            <Detail label="Laboratory" value={computer.laboratory?.name} />
            <Detail label="Uptime" value={formatUptime(computer.uptime_seconds)} />
            <Detail label="Current user" value={computer.current_user?.full_name ?? 'None'} />
          </div>

          {history.length > 1 && (
            <div>
              <div className="section-title">Recent power and temperature</div>
              <div className="chart-box chart-box-sm">
                <TrendLineChart
                  data={history}
                  xKey="time"
                  height={200}
                  lines={[
                    { key: 'power', label: 'Power (W)' },
                    { key: 'temperature', label: 'Temp (°C)' },
                  ]}
                />
              </div>
            </div>
          )}
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
