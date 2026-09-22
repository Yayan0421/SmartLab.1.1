import { useEffect, useState } from 'react';
import energyService from '../../services/energyService.js';
import useFetch from '../../hooks/useFetch.js';
import StatCard from '../../components/StatCard.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Modal from '../../components/Modal.jsx';
import { EnergyAreaChart, RankingBarChart } from '../../components/charts.jsx';
import {
  formatCurrency,
  formatNumber,
  formatDateTime,
  todayISO,
  addDaysISO,
} from '../../utils/format.js';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom range' },
];

export default function AdminEnergy() {
  const [period, setPeriod] = useState('today');
  const [detail, setDetail] = useState(null);
  const [from, setFrom] = useState(addDaysISO(-7));
  const [to, setTo] = useState(todayISO());

  const params =
    period === 'custom' ? { period: 'custom', from, to, bucket: 'day' } : { period };

  const { data: summaryData, loading: summaryLoading, error: summaryError, refetch } =
    useFetch(() => energyService.summary(), []);

  const { data: seriesData, loading: seriesLoading } = useFetch(
    () => energyService.series(params),
    [period, from, to]
  );

  const { data: rankData } = useFetch(
    () => energyService.byComputer(params),
    [period, from, to]
  );

  const summary = summaryData?.data;
  const series = seriesData?.data;

  if (summaryLoading && !summary) return <Spinner label="Loading energy data…" />;
  if (summaryError) return <ErrorState message={summaryError} onRetry={refetch} />;

  const currency = summary.currency;
  const rankedComputers = rankData?.data ?? [];
  const ranking = rankedComputers.slice(0, 10).map((item) => ({
    name: item.name,
    value: Number(item.energy_kwh.toFixed(3)),
  }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Energy management</h1>
          <p className="subtitle">
            Consumption and cost across the laboratory · {formatCurrency(summary.rate_per_kwh, currency)} per kWh
          </p>
        </div>
      </div>

      <div className="stat-grid" style={{ marginBottom: '1rem' }}>
        <StatCard
          label="Current power"
          value={`${formatNumber(summary.current_power_watt, 0)} W`}
          hint={`${summary.active_meters} meters reporting`}
          tone="brand"
          icon="⚡"
        />
        <StatCard
          label="Today"
          value={`${summary.today_kwh.toFixed(2)} kWh`}
          hint={`≈ ${formatCurrency(summary.today_cost, currency)}`}
          tone="warning"
          icon="☀"
        />
        <StatCard
          label="Last 7 days"
          value={`${summary.week_kwh.toFixed(2)} kWh`}
          hint={`≈ ${formatCurrency(summary.week_cost, currency)}`}
          tone="info"
          icon="📆"
        />
        <StatCard
          label="Last 30 days"
          value={`${summary.month_kwh.toFixed(2)} kWh`}
          hint={`≈ ${formatCurrency(summary.month_cost, currency)}`}
          tone="success"
          icon="🗓"
        />
      </div>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header">
          <h2>Consumption</h2>
          <div className="row wrap">
            <div className="tabs" style={{ border: 'none' }}>
              {PERIODS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`tab ${period === item.key ? 'is-active' : ''}`}
                  onClick={() => setPeriod(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {period === 'custom' && (
          <div className="toolbar">
            <div className="field">
              <label htmlFor="e-from">From</label>
              <input
                id="e-from"
                type="date"
                className="input"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="e-to">To</label>
              <input
                id="e-to"
                type="date"
                className="input"
                value={to}
                min={from}
                max={todayISO()}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="card-body">
          {seriesLoading && !series ? (
            <Spinner />
          ) : !series?.series?.length ? (
            <EmptyState
              icon="⚡"
              title="No readings in this period"
              message="Energy data arrives with the monitoring heartbeats."
            />
          ) : (
            <>
              <div className="row-between" style={{ marginBottom: '0.75rem' }}>
                <div>
                  <div className="stat-label">Total consumed</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>
                    {series.total_kwh.toFixed(3)} kWh
                  </div>
                </div>
                <div className="right">
                  <div className="stat-label">Estimated cost</div>
                  <div style={{ fontSize: '1.35rem', fontWeight: 700 }}>
                    {formatCurrency(series.estimated_cost, currency)}
                  </div>
                </div>
              </div>

              <div className="chart-box">
                <EnergyAreaChart data={series.series} />
              </div>
            </>
          )}
        </div>
      </section>

      <div className="chart-grid">
        <section className="card">
          <div className="card-header">
            <h2>Hourly profile · today</h2>
          </div>
          <div className="card-body">
            <div className="chart-box">
              <EnergyAreaChart data={summary.hourly} />
            </div>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2>Highest consumers</h2>
            <span className="small muted">
              {PERIODS.find((p) => p.key === period)?.label}
            </span>
          </div>
          <div className="card-body">
            {ranking.length === 0 ? (
              <EmptyState icon="📊" title="No data for this period" />
            ) : (
              <>
                <div className="chart-box">
                  <RankingBarChart data={ranking} unit=" kWh" />
                </div>

                {/* The chart shows the shape; the list is what you can act
                    on. Opening a machine gives its readings rather than
                    its share of a bar. */}
                <div className="energy-list">
                  {rankedComputers.slice(0, 10).map((item, index) => (
                    <button
                      key={item.computer_id}
                      type="button"
                      className="energy-row"
                      onClick={() => setDetail(item)}
                    >
                      <span className="energy-rank">{index + 1}</span>
                      <span className="energy-name">{item.name}</span>
                      <span className="energy-kwh">
                        {item.energy_kwh.toFixed(3)} kWh
                      </span>
                      <span className="energy-cost">
                        {formatCurrency(item.energy_kwh * summary.rate_per_kwh, currency)}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header">
          <h2>Daily consumption · last 30 days</h2>
        </div>
        <div className="card-body">
          {summary.daily.length === 0 ? (
            <EmptyState icon="⚡" title="No readings yet" />
          ) : (
            <div className="chart-box">
              <EnergyAreaChart data={summary.daily} />
            </div>
          )}
        </div>
      </section>

      <EnergyDetailModal
        computer={detail}
        period={period}
        from={from}
        to={to}
        rate={summary.rate_per_kwh}
        currency={currency}
        onClose={() => setDetail(null)}
      />
    </>
  );
}

/**
 * One machine's power record for the chosen period.
 *
 * The ranking answers "which machines cost the most"; this answers the
 * question that follows it — why. The readings are the raw meter output,
 * newest first, because an administrator chasing an anomaly wants the
 * moment it happened rather than a daily average.
 */
function EnergyDetailModal({ computer, period, from, to, rate, currency, onClose }) {
  const [readings, setReadings] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!computer) {
      setReadings(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const params =
      period === 'custom' ? { period: 'custom', from, to, limit: 12 } : { period, limit: 12 };

    energyService
      .forComputer(computer.computer_id, params)
      .then((res) => {
        if (!cancelled) setReadings(res.data ?? []);
      })
      .catch(() => {
        // The totals above are still true even if the detail will not load.
        if (!cancelled) setReadings([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [computer, period, from, to]);

  const latest = readings?.[0];

  return (
    <Modal
      open={Boolean(computer)}
      onClose={onClose}
      title={computer ? `${computer.name} · power` : 'Power'}
      size="lg"
      footer={
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      }
    >
      {computer && (
        <>
          <div className="stat-grid" style={{ marginBottom: '1rem' }}>
            <StatCard
              label="Consumed"
              value={`${computer.energy_kwh.toFixed(3)} kWh`}
              icon="⚡"
            />
            <StatCard
              label="Estimated cost"
              value={formatCurrency(computer.energy_kwh * rate, currency)}
              icon="₱"
            />
            <StatCard
              label="Latest reading"
              value={latest ? `${formatNumber(latest.power_watt)} W` : '—'}
              icon="🔌"
            />
          </div>

          <div className="section-title">Recent readings</div>

          {loading ? (
            <Spinner label="Loading readings…" />
          ) : readings?.length ? (
            <div className="table-wrap table-cards-wrap">
              <table className="table table-cards">
                <thead>
                  <tr>
                    <th>Recorded</th>
                    <th>Power</th>
                    <th>Voltage</th>
                    <th>Current</th>
                    <th>Energy</th>
                    <th>Temp.</th>
                  </tr>
                </thead>
                <tbody>
                  {readings.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap" data-label="Recorded">
                        {formatDateTime(r.recorded_at)}
                      </td>
                      <td data-label="Power">{formatNumber(r.power_watt)} W</td>
                      <td data-label="Voltage">{formatNumber(r.voltage)} V</td>
                      <td data-label="Current">{formatNumber(r.current_amp)} A</td>
                      <td data-label="Energy">{Number(r.energy_kwh).toFixed(4)} kWh</td>
                      <td data-label="Temp.">
                        {r.temperature == null ? '—' : `${formatNumber(r.temperature)} °C`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="⚡" title="No readings in this period" />
          )}
        </>
      )}
    </Modal>
  );
}
