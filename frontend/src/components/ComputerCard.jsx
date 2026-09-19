import StatusBadge from './StatusBadge.jsx';
import Meter from './Meter.jsx';
import { timeAgo } from '../utils/format.js';

/**
 * The workstation tile used on every computer grid — admin, faculty and
 * student. `actions` lets each page decide what the footer offers without
 * forking the card itself.
 */
export default function ComputerCard({ computer, onBook, onView, showTelemetry = true }) {
  const telemetry = computer.telemetry ?? {};
  const online = computer.is_online ?? telemetry.is_online;
  const bookable = computer.status === 'AVAILABLE' && computer.is_bookable !== false;

  return (
    <article className={`pc-card state-${computer.status}`}>
      <header className="pc-head">
        <div>
          <div className="pc-name">{computer.name}</div>
          <div className="pc-meta">
            {computer.laboratory?.name ?? 'Unassigned'}
            {computer.ip_address ? ` · ${computer.ip_address}` : ''}
          </div>
        </div>
        <StatusBadge value={computer.status} />
      </header>

      {showTelemetry && (
        <div className="pc-metrics">
          <Meter label="CPU" value={telemetry.cpu_usage} />
          <Meter label="RAM" value={telemetry.ram_usage} />
          <Meter
            label="Temp"
            value={telemetry.temperature}
            suffix="°C"
            max={100}
            thresholds={{ warn: 70, danger: 82 }}
          />
        </div>
      )}

      <div className="pc-meta">
        {online ? (
          <>Online · updated {timeAgo(telemetry.heartbeat_at)}</>
        ) : (
          <>Offline · last seen {timeAgo(telemetry.heartbeat_at ?? computer.last_seen_at)}</>
        )}
      </div>

      <div className="pc-actions">
        {onView && (
          <button type="button" className="btn btn-secondary btn-sm grow" onClick={() => onView(computer)}>
            Details
          </button>
        )}
        {onBook && (
          <button
            type="button"
            className="btn btn-primary btn-sm grow"
            onClick={() => onBook(computer)}
            disabled={!bookable}
            title={bookable ? undefined : 'This computer cannot be booked right now'}
          >
            Book
          </button>
        )}
      </div>
    </article>
  );
}
