import { meterTone } from '../utils/format.js';

/** Labelled bar for CPU, RAM, disk and temperature readings. */
export default function Meter({ label, value, suffix = '%', max = 100, thresholds }) {
  const num = Number(value) || 0;
  const pct = Math.min(100, Math.max(0, (num / max) * 100));
  return (
    <div className="meter-row">
      <span>{label}</span>
      <span className="meter">
        <span className={`meter-fill ${meterTone(num, thresholds)}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="meter-value">
        {num.toFixed(0)}
        {suffix}
      </span>
    </div>
  );
}
