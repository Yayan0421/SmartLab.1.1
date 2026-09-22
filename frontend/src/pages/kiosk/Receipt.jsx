import { formatDate, formatTimeRange, ROLE_LABEL } from '../../utils/format.js';
import { labFormat } from '../../utils/labConstants.js';

/**
 * The printed ticket.
 *
 * Hidden on screen and revealed only by the print stylesheet, sized for an
 * 80mm thermal roll — the printer a kiosk normally has. Everything on it
 * comes from the server's receipt payload, so the paper and the database
 * can never disagree.
 */
export default function Receipt({ receipt }) {
  if (!receipt) return null;

  // A booking across several machines prints one ticket listing them all.
  const machines = receipt.computers ?? (receipt.computer ? [receipt.computer] : []);

  // Formatted in laboratory time rather than the terminal's: a kiosk set
  // to the wrong timezone would otherwise print the wrong arrival time.
  const issuedTime = labFormat(receipt.issued_at, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const issuedStamp = labFormat(receipt.issued_at, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return (
    <div className="receipt" aria-hidden="true">
      <div className="receipt-head">
        <div className="receipt-logo">SMARTLAB</div>
        <div className="receipt-org">Smart Computer Laboratory</div>
        {receipt.laboratory && <div className="receipt-line">{receipt.laboratory}</div>}
        {receipt.room && <div className="receipt-line">Room {receipt.room}</div>}
      </div>

      <div className="receipt-rule" />

      <div className="receipt-title">SESSION RECEIPT</div>
      <div className="receipt-no">{receipt.number}</div>

      <div className="receipt-rule" />

      <Row label="Name" value={receipt.name} />
      {receipt.id_number && <Row label="ID No." value={receipt.id_number} />}
      <Row label="Role" value={ROLE_LABEL[receipt.role] ?? receipt.role} />
      {receipt.program && <Row label="Program" value={receipt.program} />}
      {receipt.course && <Row label="Course" value={receipt.course} />}

      <div className="receipt-rule" />

      {machines.length > 1 ? (
        /* A class booking: one ticket for the whole set, with every
           machine named on it. */
        <>
          <Row label="Computers" value={String(machines.length)} strong />
          <div className="receipt-machines">{machines.join(', ')}</div>
        </>
      ) : (
        <Row label="Computer" value={machines[0]} strong />
      )}
      <Row label="Date" value={formatDate(receipt.date)} />
      <Row label="Time" value={formatTimeRange(receipt.start_time, receipt.end_time)} />
      <Row label="Subject" value={receipt.subject} />
      <Row label="Purpose" value={receipt.purpose} />

      <div className="receipt-rule" />

      <Row label="Checked in" value={issuedTime} strong />

      <div className="receipt-rule" />

      <div className="receipt-foot">
        Please keep this receipt.
        <br />
        Return the {machines.length > 1 ? 'workstations' : 'workstation'} by{' '}
        {receipt.end_time?.slice(0, 5)}.
        <br />
        <br />
        {issuedStamp}
      </div>
    </div>
  );
}

function Row({ label, value, strong = false }) {
  if (!value) return null;
  return (
    <div className="receipt-row">
      <span>{label}</span>
      <span className={strong ? 'receipt-strong' : ''}>{value}</span>
    </div>
  );
}
