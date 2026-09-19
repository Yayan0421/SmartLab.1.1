import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import bookingService from '../services/bookingService.js';
import computerService from '../services/computerService.js';
import { useToast } from '../context/ToastContext.jsx';
import { formatTimeRange, todayISO, addDaysISO } from '../utils/format.js';
import {
  LAB_SUBJECTS,
  BOOKING_PURPOSES,
  DEFAULT_POLICY,
  buildTimeSlots,
  describeDays,
} from '../utils/labConstants.js';

/**
 * The booking dialog shared by faculty and student pages.
 *
 * It shows which slots are already taken so people do not submit a request
 * that will be rejected — but the server re-runs every rule regardless.
 */
export default function BookingFormModal({ open, onClose, computer, onCreated }) {
  const toast = useToast();

  const [computers, setComputers] = useState([]);
  const [computerId, setComputerId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [slot, setSlot] = useState('');
  const [purpose, setPurpose] = useState(BOOKING_PURPOSES[0]);
  const [subject, setSubject] = useState(LAB_SUBJECTS[0]);
  const [taken, setTaken] = useState([]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState('');
  const [policy, setPolicy] = useState(DEFAULT_POLICY);

  const maxDate = useMemo(() => addDaysISO(policy.advance_days ?? 14), [policy]);

  // One-hour blocks inside the laboratory's opening hours.
  const SLOTS = useMemo(
    () => buildTimeSlots(policy.open_time, policy.close_time).map((s) => [s.start, s.end]),
    [policy]
  );

  const dayIsOpen = (iso) =>
    Boolean(iso) && policy.open_days.includes(new Date(`${iso}T00:00:00Z`).getUTCDay());

  useEffect(() => {
    if (!open) return;
    bookingService
      .policy()
      .then((res) => setPolicy({ ...DEFAULT_POLICY, ...res.data }))
      .catch(() => {});
  }, [open]);

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setComputerId(computer?.id ?? '');
    setDate(todayISO());
    setSlot('');
    setPurpose(BOOKING_PURPOSES[0]);
    setSubject(LAB_SUBJECTS[0]);
    setBanner('');
  }, [open, computer]);

  // Only load the picker list when no specific machine was passed in.
  useEffect(() => {
    if (!open || computer) return;
    computerService
      .list({ status: 'AVAILABLE', bookable_only: true, limit: 100 })
      .then((res) => setComputers(res.data ?? []))
      .catch(() => setComputers([]));
  }, [open, computer]);

  // Refresh which slots are already reserved for this machine and day.
  useEffect(() => {
    if (!open || !computerId || !date) return setTaken([]);
    let cancelled = false;
    bookingService
      .availability(computerId, date)
      .then((res) => {
        if (!cancelled) setTaken(res.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setTaken([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, computerId, date]);

  function slotConflict([start, end]) {
    const s = `${start}:00`;
    const e = `${end}:00`;
    return taken.some((booking) => s < booking.end_time && e > booking.start_time);
  }

  function slotInPast([, end]) {
    if (date !== todayISO()) return false;
    const now = new Date();
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return end <= clock;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBanner('');

    if (!computerId) return setBanner('Choose a computer.');
    if (!dayIsOpen(date)) {
      return setBanner(`The laboratory is closed that day. It opens ${describeDays(policy.open_days)}.`);
    }
    if (!slot) return setBanner('Choose a time slot.');
    if (!subject) return setBanner('Choose the laboratory subject.');
    if (purpose.trim().length < 3) return setBanner('Choose the purpose of your booking.');

    const [start_time, end_time] = slot.split('|');

    setBusy(true);
    try {
      const res = await bookingService.create({
        computer_id: computerId,
        booking_date: date,
        start_time,
        end_time,
        purpose: purpose.trim(),
        subject,
      });

      const created = res.data;
      toast.success(
        created.status === 'APPROVED'
          ? 'Your booking is confirmed.'
          : 'Your booking request was submitted for approval.'
      );
      onCreated?.(created);
      onClose();
    } catch (error) {
      setBanner(error.message);
    } finally {
      setBusy(false);
    }
  }

  const selected = computer ?? computers.find((c) => c.id === computerId);

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Book a computer"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="booking-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Submitting…' : 'Confirm booking'}
          </button>
        </>
      }
    >
      <form id="booking-form" className="stack" onSubmit={handleSubmit} noValidate>
        {banner && (
          <div className="alert alert-error" role="alert">
            {banner}
          </div>
        )}

        <div className="field">
          <label htmlFor="booking-computer">Computer</label>
          {computer ? (
            <input id="booking-computer" className="input" value={computer.name} disabled />
          ) : (
            <select
              id="booking-computer"
              className="select"
              value={computerId}
              onChange={(e) => setComputerId(e.target.value)}
              disabled={busy}
            >
              <option value="">Select an available computer…</option>
              {computers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {item.laboratory?.name ?? 'Lab'}
                </option>
              ))}
            </select>
          )}
          {selected?.laboratory?.name && (
            <span className="small muted">{selected.laboratory.name}</span>
          )}
        </div>

        <div className="field">
          <label htmlFor="booking-date">Date</label>
          <input
            id="booking-date"
            type="date"
            className="input"
            value={date}
            min={todayISO()}
            max={maxDate}
            onChange={(e) => setDate(e.target.value)}
            disabled={busy}
          />
          <span className="small muted">
            Open {describeDays(policy.open_days)}, {policy.open_time}–{policy.close_time}. Up to{' '}
            {policy.advance_days} days ahead.
          </span>
          {date && !dayIsOpen(date) && (
            <span className="field-error">The laboratory is closed on the selected day.</span>
          )}
        </div>

        <div className="field">
          <label>Time slot</label>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '0.4rem',
            }}
          >
            {SLOTS.map(([start, end]) => {
              const value = `${start}|${end}`;
              const unavailable = slotConflict([start, end]) || slotInPast([start, end]);
              const active = slot === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setSlot(value)}
                  disabled={unavailable || busy || !computerId || !dayIsOpen(date)}
                  title={unavailable ? 'This slot is not available' : undefined}
                >
                  {formatTimeRange(`${start}:00`, `${end}:00`)}
                </button>
              );
            })}
          </div>
          {!computerId && <span className="small muted">Choose a computer to see availability.</span>}
        </div>

        <div className="field">
          <label htmlFor="booking-subject">Subject</label>
          <select
            id="booking-subject"
            className="select"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={busy}
          >
            {LAB_SUBJECTS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="booking-purpose">Purpose</label>
          <select
            id="booking-purpose"
            className="select"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            disabled={busy}
          >
            {BOOKING_PURPOSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </form>
    </Modal>
  );
}
