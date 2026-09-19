import { useState } from 'react';
import energyService from '../../services/energyService.js';
import useFetch from '../../hooks/useFetch.js';
import StatCard from '../../components/StatCard.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { EnergyAreaChart, RankingBarChart } from '../../components/charts.jsx';
import { formatCurrency, formatNumber, todayISO, addDaysISO } from '../../utils/format.js';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom range' },
];

export default function AdminEnergy() {
  const [period, setPeriod] = useState('today');
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
  const ranking = (rankData?.data ?? []).slice(0, 10).map((item) => ({
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
              <div className="chart-box">
                <RankingBarChart data={ranking} unit=" kWh" />
              </div>
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
    </>
  );
}
