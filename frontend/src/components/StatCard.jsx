import { formatNumber } from '../utils/format.js';

/**
 * Dashboard tile. `tone` drives the accent bar only, so a row of tiles
 * stays calm instead of turning into six competing colours.
 */
export default function StatCard({ label, value, hint, tone = 'brand', icon, digits = 0 }) {
  const display = typeof value === 'number' ? formatNumber(value, digits) : value;
  return (
    <div className={`stat is-${tone}`}>
      <div className="row-between">
        <div className="stat-label">{label}</div>
        {icon && <span aria-hidden="true" style={{ opacity: 0.5 }}>{icon}</span>}
      </div>
      <div className="stat-value">{display}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
