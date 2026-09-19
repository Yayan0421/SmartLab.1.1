import { STATUS_TONE, humanize } from '../utils/format.js';

/**
 * One badge component for every status in the system: computer states,
 * booking states, user statuses and roles all map through STATUS_TONE.
 */
export default function StatusBadge({ value, label, plain = false }) {
  const tone = STATUS_TONE[value] ?? 'neutral';
  return (
    <span className={`badge badge-${tone}${plain ? ' badge-plain' : ''}`}>
      {label ?? humanize(value)}
    </span>
  );
}
