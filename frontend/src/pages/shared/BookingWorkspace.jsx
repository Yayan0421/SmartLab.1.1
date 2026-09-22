import { useCallback, useEffect, useMemo, useState } from 'react';
import bookingService from '../../services/bookingService.js';
import { useToast } from '../../context/ToastContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import usePolling from '../../hooks/usePolling.js';
import {
  LAB_SUBJECTS,
  BOOKING_PURPOSES,
  DEFAULT_POLICY,
  buildTimeSlots,
  describeDays,
  toDbTime,
} from '../../utils/labConstants.js';
import { formatTimeRange, todayISO, addDaysISO } from '../../utils/format.js';

/**
 * The booking workspace used by both students and faculty.
 *
 * Three panels: the booking form, the week's laboratory schedule as a
 * time × workstation grid, and the list of machines free for the chosen
 * slot. Selecting cells in the grid and cards in the list are two routes to
 * the same selection, so people can work whichever way they think.
 *
 * Everything shown here is a convenience. The server re-runs every booking
 * rule when the reservation is submitted.
 */
export default function BookingWorkspace() {
  const toast = useToast();
  const { user } = useAuth();

  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  const [date, setDate] = useState('');
  const [slotIndex, setSlotIndex] = useState(0);
  const [subject, setSubject] = useState(LAB_SUBJECTS[0]);
  const [purpose, setPurpose] = useState(BOOKING_PURPOSES[0]);
  const [selected, setSelected] = useState([]);

  const [schedule, setSchedule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // The timetable comes from the laboratory's opening hours, so the form can
  // never offer a slot the server would refuse.
  const timeSlots = useMemo(
    () => buildTimeSlots(policy.open_time, policy.close_time),
    [policy.open_time, policy.close_time]
  );

  const slot = timeSlots[Math.min(slotIndex, timeSlots.length - 1)];

  /**
   * The day tabs: the next open days only. A closed day is never offered,
   * rather than shown and then rejected on submit.
   */
  const week = useMemo(() => {
    const days = [];
    for (let i = 0; i <= policy.advance_days && days.length < 8; i += 1) {
      const iso = addDaysISO(i);
      const weekday = new Date(`${iso}T00:00:00Z`).getUTCDay();
      if (!policy.open_days.includes(weekday)) continue;
      const d = new Date(`${iso}T00:00:00`);
      days.push({
        iso,
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      });
    }
    return days;
  }, [policy]);

  // Load the rules once, then settle on the first open day.
  useEffect(() => {
    let cancelled = false;
    bookingService
      .policy()
      .then((res) => {
        if (!cancelled) setPolicy({ ...DEFAULT_POLICY, ...res.data });
      })
      .catch(() => {
        /* keep the defaults if the policy cannot be read */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!date && week.length) setDate(week[0].iso);
  }, [week, date]);

  const load = useCallback(async () => {
    if (!date) return;
    try {
      const res = await bookingService.schedule(date);
      setSchedule(res.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    setLoading(true);
    setSelected([]);
    load();
  }, [load]);

  // Someone else may book a machine while this page is open.
  usePolling(load, 30_000);

  const computers = schedule?.computers ?? [];
  const bookings = schedule?.bookings ?? [];

  const isStudent = user?.role === 'student';

  /** Is this machine taken during the given slot? Returns the booking. */
  const bookingFor = useCallback(
    (computerId, theSlot) => {
      const start = toDbTime(theSlot.start);
      const end = toDbTime(theSlot.end);
      return bookings.find(
        (b) => b.computer_id === computerId && start < b.end_time && end > b.start_time
      );
    },
    [bookings]
  );

  /**
   * A faculty reservation takes the room, so for a student the entire slot
   * is closed — not just the machines the class happens to occupy. Shown
   * here as well as enforced on the server, so nobody picks a seat that was
   * never going to be accepted.
   */
  const classHolding = useCallback(
    (theSlot) => {
      const start = toDbTime(theSlot.start);
      const end = toDbTime(theSlot.end);
      return bookings.find(
        (b) => b.by_faculty && start < b.end_time && end > b.start_time
      );
    },
    [bookings]
  );

  const slotClosedForMe = useCallback(
    (theSlot) => (isStudent && policy.faculty_priority ? Boolean(classHolding(theSlot)) : false),
    [isStudent, policy.faculty_priority, classHolding]
  );

  /** Hours this student has already committed on the chosen day. */
  const hoursUsed = bookings
    .filter((b) => b.mine)
    .reduce((total, b) => {
      const toMin = (t) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      return total + (toMin(b.end_time) - toMin(b.start_time)) / 60;
    }, 0);

  const hoursLeft = Math.max(0, (policy.student_max_hours_per_day ?? 2) - hoursUsed);
  const maxPick = isStudent ? policy.student_max_computers ?? 1 : 30;

  /**
   * Mirrors the server rule exactly (see backend validateBookingRequest):
   * only a machine withdrawn from booking or under maintenance is blocked.
   *
   * OFFLINE is deliberately *not* blocking — it only means the monitoring
   * agent is not reporting at this moment, which says nothing about whether
   * the machine can be reserved for a slot later today or next week.
   */
  const isFree = useCallback(
    (computer, theSlot) =>
      computer.is_bookable &&
      computer.status !== 'MAINTENANCE' &&
      !bookingFor(computer.id, theSlot) &&
      !slotClosedForMe(theSlot),
    [bookingFor, slotClosedForMe]
  );

  const slotIsPast = useCallback(
    (theSlot) => {
      if (date !== todayISO()) return false;
      const now = new Date();
      const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      return theSlot.end <= clock;
    },
    [date]
  );

  const availableNow = computers.filter((c) => isFree(c, slot) && !slotIsPast(slot));

  /**
   * Reserves the first N free machines for the chosen slot.
   *
   * Faculty booking a class think in numbers ("I need 25 seats"), not in
   * individual machines, so the count drives the selection. Clicking cells
   * still works and simply adjusts the same list.
   */
  function pickByCount(wanted) {
    const free = computers.filter((c) => isFree(c, slot));
    const n = Math.max(0, Math.min(Number(wanted) || 0, free.length));
    setSelected(free.slice(0, n).map((c) => c.id));

    if (Number(wanted) > free.length) {
      toast.info(
        `Only ${free.length} computer${free.length === 1 ? ' is' : 's are'} free in that slot.`
      );
    }
  }

  function toggle(computer) {
    if (!isFree(computer, slot) || slotIsPast(slot)) return;
    setSelected((current) => {
      if (current.includes(computer.id)) return current.filter((id) => id !== computer.id);
      // Students hold one machine, so picking another replaces the first
      // rather than refusing the click.
      if (current.length >= maxPick) return maxPick === 1 ? [computer.id] : current;
      return [...current, computer.id];
    });
  }

  async function submit(event) {
    event.preventDefault();

    if (!selected.length) {
      return toast.error('Select at least one computer from the schedule or the list below.');
    }
    if (slotIsPast(slot)) {
      return toast.error('That time slot has already passed.');
    }

    setSubmitting(true);
    try {
      const payload = {
        booking_date: date,
        start_time: toDbTime(slot.start),
        end_time: toDbTime(slot.end),
        purpose,
        subject,
      };

      const res =
        selected.length === 1
          ? await bookingService.create({ ...payload, computer_id: selected[0] })
          : await bookingService.createBulk({ ...payload, computer_ids: selected });

      const created = Array.isArray(res.data) ? res.data : [res.data];
      const approved = created[0]?.status === 'APPROVED';

      toast.success(
        approved
          ? `${created.length} computer${created.length > 1 ? 's' : ''} reserved for you.`
          : `Request for ${created.length} computer${created.length > 1 ? 's' : ''} sent for approval.`
      );

      setSelected([]);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading && !schedule) return <Spinner label="Loading the laboratory schedule…" />;
  if (error && !schedule) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Welcome, {user?.full_name?.split(' ')[0]}!</h1>
          <p className="subtitle">
            Book a computer for your laboratory subject, class activity or research.
          </p>
          <p className="small muted" style={{ marginTop: '0.2rem' }}>
            Laboratory hours: {describeDays(policy.open_days)}, {policy.open_time} to{' '}
            {policy.close_time}.
            {isStudent && (
              <>
                {' '}Students may book {policy.student_max_hours_per_day} hours a day on{' '}
                {policy.student_max_computers === 1
                  ? 'one computer'
                  : `${policy.student_max_computers} computers`}.
              </>
            )}
          </p>
        </div>
      </div>

      {/*
        The phone's booking panel.

        The desktop layout is a form beside a thirty-column timetable. That
        grid cannot survive a 390px screen — `width: 100%` makes it squeeze
        to about eleven pixels a column rather than scroll — and a form of
        stacked dropdowns beneath it is a web page, not an app.

        So the phone gets its own panel: the four choices as rows of chips,
        each showing what it costs you. Day, hour, machines, details. The
        desktop markup below is hidden at this width, and this panel is
        hidden above it, so neither has to compromise for the other.
      */}
      <div className="book-mobile">
        <section className="bm-step">
          <h2 className="bm-label">Day</h2>
          <div className="bm-chips bm-scroll">
            {week.map((day) => (
              <button
                key={day.iso}
                type="button"
                className={`bm-chip bm-day ${date === day.iso ? 'is-on' : ''}`}
                onClick={() => setDate(day.iso)}
              >
                <span className="bm-day-name">{day.weekday}</span>
                <span className="bm-day-date">{day.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="bm-step">
          <h2 className="bm-label">Hour</h2>
          <div className="bm-chips bm-hours">
            {timeSlots.map((s, i) => {
              const past = slotIsPast(s);
              const held = slotClosedForMe(s);
              const free = computers.filter((c) => isFree(c, s)).length;
              const state = past ? 'past' : held ? 'class' : free === 0 ? 'full' : 'open';

              return (
                <button
                  key={s.start}
                  type="button"
                  className={`bm-chip bm-hour is-${state} ${i === slotIndex ? 'is-on' : ''}`}
                  disabled={past || held || free === 0}
                  onClick={() => {
                    setSlotIndex(i);
                    setSelected([]);
                  }}
                >
                  <span className="bm-hour-time">
                    {formatTimeRange(toDbTime(s.start), toDbTime(s.end))}
                  </span>

                  <span className="bm-hour-free">
                    {past
                      ? 'Passed'
                      : held
                        ? 'Class reserved'
                        : free === 0
                          ? 'Fully booked'
                          : `${free} computer${free === 1 ? '' : 's'} free`}
                  </span>

                  {/* How much of the hour is still open, at a glance. */}
                  <span className="bm-hour-bar" aria-hidden="true">
                    <i
                      style={{
                        width: `${computers.length ? (free / computers.length) * 100 : 0}%`,
                      }}
                    />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="bm-step">
          <h2 className="bm-label">
            Computers
            <span className="bm-hint">
              {selected.length} of {availableNow.length} free picked
            </span>
          </h2>

          {/* Faculty reserve a number of seats for a class; a student holds
              one machine, so the shortcuts would only be in their way. */}
          {!isStudent && (
            <div className="bm-quick">
              {[5, 10, 20].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="bm-quick-btn"
                  onClick={() => pickByCount(n)}
                  disabled={submitting || availableNow.length === 0}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                className="bm-quick-btn"
                onClick={() => pickByCount(availableNow.length)}
                disabled={submitting || availableNow.length === 0}
              >
                All {availableNow.length}
              </button>
              <button
                type="button"
                className="bm-quick-btn is-ghost"
                onClick={() => setSelected([])}
                disabled={submitting || selected.length === 0}
              >
                Clear
              </button>
            </div>
          )}

          <div className="bm-pcs">
            {computers.map((computer) => {
              const free = isFree(computer, slot) && !slotIsPast(slot);
              const on = selected.includes(computer.id);
              const taken = bookingFor(computer.id, slot);

              return (
                <button
                  key={computer.id}
                  type="button"
                  className={`bm-pc ${on ? 'is-on' : ''} ${free ? '' : 'is-off'} ${taken?.mine ? 'is-mine' : ''}`}
                  disabled={!free}
                  onClick={() => toggle(computer)}
                  title={computer.name}
                >
                  {String(computer.computer_number ?? '').padStart(2, '0')}
                </button>
              );
            })}
          </div>

          {slotClosedForMe(slot) && (
            <p className="bm-note is-warn">
              A class has the laboratory this hour. Choose another time.
            </p>
          )}

          {isStudent && (
            <p className={`bm-note ${hoursLeft === 0 ? 'is-warn' : ''}`}>
              {hoursLeft === 0
                ? 'You have used your hours for this day.'
                : `${hoursLeft}h left of your ${policy.student_max_hours_per_day}h today.`}
            </p>
          )}
        </section>

        <section className="bm-step">
          <h2 className="bm-label">Details</h2>

          <label className="bm-field">
            <span>Subject</span>
            <select
              className="select"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={submitting}
            >
              {LAB_SUBJECTS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <label className="bm-field">
            <span>Purpose</span>
            <select
              className="select"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              disabled={submitting}
            >
              {BOOKING_PURPOSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>

          <p className="bm-note">
            {isStudent
              ? 'Student bookings are sent to an administrator for approval.'
              : 'Faculty bookings are confirmed immediately.'}
          </p>
        </section>
      </div>

      <div className="book-layout">
        {/* ---------------- booking form ---------------- */}
        <section className="card book-form">
          <div className="card-header">
            <h2>
              <span className="book-ico" aria-hidden="true">🖥</span> Book a Computer
            </h2>
          </div>

          <form id="booking-form" className="card-body stack" onSubmit={submit}>
            <div className="field field-date">
              <label htmlFor="bk-date">Date</label>
              <select
                id="bk-date"
                className="select"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={submitting}
              >
                {week.map((day) => (
                  <option key={day.iso} value={day.iso}>
                    {day.weekday}, {day.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field field-time">
              <label htmlFor="bk-time">Time</label>
              <select
                id="bk-time"
                className="select"
                value={slotIndex}
                onChange={(e) => {
                  setSlotIndex(Number(e.target.value));
                  setSelected([]);
                }}
                disabled={submitting}
              >
                {timeSlots.map((s, i) => (
                  <option key={s.start} value={i} disabled={slotIsPast(s)}>
                    {formatTimeRange(toDbTime(s.start), toDbTime(s.end))}
                    {slotIsPast(s) ? ' — passed' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* The laboratory subject this session is for. */}
            <div className="field">
              <label htmlFor="bk-subject">Subject</label>
              <select
                id="bk-subject"
                className="select"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={submitting}
              >
                {LAB_SUBJECTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="bk-purpose">Purpose</label>
              <select
                id="bk-purpose"
                className="select"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                disabled={submitting}
              >
                {BOOKING_PURPOSES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* Faculty reserve a number of seats for a class; students hold
                a single machine, so the field would only get in their way. */}
            {!isStudent && (
              <div className="field">
                <label htmlFor="bk-count">Number of computers</label>
                <div className="count-row">
                  <button
                    type="button"
                    className="count-btn"
                    onClick={() => pickByCount(selected.length - 1)}
                    disabled={submitting || selected.length === 0}
                    aria-label="One fewer computer"
                  >
                    −
                  </button>

                  <input
                    id="bk-count"
                    type="number"
                    className="input count-input"
                    min="0"
                    max={availableNow.length}
                    value={selected.length}
                    onChange={(e) => pickByCount(e.target.value)}
                    disabled={submitting || availableNow.length === 0}
                  />

                  <button
                    type="button"
                    className="count-btn"
                    onClick={() => pickByCount(selected.length + 1)}
                    disabled={submitting || selected.length >= availableNow.length}
                    aria-label="One more computer"
                  >
                    +
                  </button>

                  <span className="count-avail">
                    of {availableNow.length} free
                  </span>
                </div>

                <div className="row wrap" style={{ gap: '0.3rem', marginTop: '0.4rem' }}>
                  {[5, 10, 20].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => pickByCount(n)}
                      disabled={submitting || availableNow.length === 0}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => pickByCount(availableNow.length)}
                    disabled={submitting || availableNow.length === 0}
                  >
                    All {availableNow.length}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setSelected([])}
                    disabled={submitting || selected.length === 0}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {isStudent && (
              <div className={`allowance ${hoursLeft === 0 ? 'is-spent' : ''}`}>
                <strong>{hoursLeft}h</strong>
                <span className="small">
                  {hoursLeft === 0
                    ? 'You have used your hours for this day'
                    : `left of your ${policy.student_max_hours_per_day}h on this day`}
                </span>
              </div>
            )}

            {slotClosedForMe(slot) && (
              <div className="alert alert-warning small">
                A class has the laboratory from {classHolding(slot)?.start_time.slice(0, 5)} to{' '}
                {classHolding(slot)?.end_time.slice(0, 5)}. Choose another time.
              </div>
            )}

            <div className="field">
              <label>{isStudent ? 'Selected computer' : 'Selected computers'}</label>
              <div className="book-count">
                <strong>{selected.length}</strong>
                <span className="muted small">
                  {selected.length === 0
                    ? 'Pick from the schedule or the list below'
                    : computers
                        .filter((c) => selected.includes(c.id))
                        .map((c) => c.name)
                        .join(', ')}
                </span>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
              {submitting
                ? 'Submitting…'
                : selected.length > 1
                  ? `Book ${selected.length} computers`
                  : 'Book computer'}
            </button>

            <p className="small muted" style={{ marginBottom: 0 }}>
              {user?.role === 'faculty'
                ? 'Faculty bookings are confirmed immediately.'
                : 'Student bookings are sent to an administrator for approval.'}
            </p>
          </form>
        </section>

        {/* ---------------- schedule grid ---------------- */}
        <section className="card book-schedule">
          <div className="card-header">
            <h2>
              <span className="book-ico" aria-hidden="true">🗓</span> Computer Lab Schedule
            </h2>
            <span className="small muted">
              Open {describeDays(policy.open_days)} · {policy.open_time}–{policy.close_time}
            </span>
          </div>

          <div className="day-tabs">
            {week.map((day) => (
              <button
                key={day.iso}
                type="button"
                className={`day-tab ${date === day.iso ? 'is-active' : ''}`}
                onClick={() => setDate(day.iso)}
              >
                <span className="day-name">{day.weekday}</span>
                <span className="day-date">{day.label}</span>
              </button>
            ))}
          </div>

          <div className="grid-scroll">
            <table className="sched-grid">
              <thead>
                <tr>
                  <th className="sched-time-head">Time</th>
                  {computers.map((c) => (
                    <th key={c.id} title={c.name}>
                      {c.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeSlots.map((s, i) => {
                  const past = slotIsPast(s);
                  return (
                    <tr key={s.start} className={i === slotIndex ? 'is-current' : ''}>
                      <th className="sched-time">
                        {s.start} - {s.end}
                        {slotClosedForMe(s) && (
                          <span className="sched-closed" title="A class has the laboratory">
                            class
                          </span>
                        )}
                      </th>

                      {computers.map((computer) => {
                        const booked = bookingFor(computer.id, s);
                        const free = isFree(computer, s) && !past;
                        const isSelected = i === slotIndex && selected.includes(computer.id);

                        const classHold = classHolding(s);
                        const closed = slotClosedForMe(s);

                        let cls = 'free';
                        let title = `${computer.name} available`;

                        if (past) {
                          cls = 'past';
                          title = 'This slot has passed';
                        } else if (closed && !booked) {
                          cls = 'class';
                          title = `Reserved for a class${classHold?.subject ? ` — ${classHold.subject}` : ''}`;
                        } else if (booked) {
                          cls = booked.mine ? 'mine' : 'taken';
                          title = booked.mine
                            ? `Your booking — ${booked.subject ?? booked.purpose ?? ''}`
                            : 'Already booked';
                        } else if (!computer.is_bookable || computer.status === 'MAINTENANCE') {
                          cls = 'blocked';
                          title = 'Under maintenance — cannot be booked';
                        } else if (computer.status === 'OFFLINE') {
                          // Bookable, but worth flagging that nothing is reporting.
                          cls = 'free idle';
                          title = `${computer.name} available (monitoring agent not reporting)`;
                        }

                        return (
                          <td key={computer.id}>
                            <button
                              type="button"
                              className={`cell ${cls} ${isSelected ? 'is-selected' : ''}`}
                              title={title}
                              aria-label={`${computer.name} ${s.start} ${title}`}
                              disabled={!free}
                              onClick={() => {
                                setSlotIndex(i);
                                if (i !== slotIndex) setSelected([computer.id]);
                                else toggle(computer);
                              }}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="legend">
            <span className="legend-item"><i className="dot free" /> Available</span>
            <span className="legend-item"><i className="dot taken" /> Booked</span>
            <span className="legend-item"><i className="dot mine" /> Yours</span>
            <span className="legend-item"><i className="dot blocked" /> Unavailable</span>
            {isStudent && policy.faculty_priority && (
              <span className="legend-item"><i className="dot class" /> Class reserved</span>
            )}
            <span className="legend-item"><i className="dot is-selected-key" /> Selected</span>
          </div>
        </section>
      </div>

      {/* ---------------- available computers ---------------- */}
      <section className="card book-avail" style={{ marginTop: '1rem' }}>
        <div className="card-header">
          <h2>
            <span className="book-ico" aria-hidden="true">🖥</span> Available Computers
          </h2>
          <span className="small muted">
            {formatTimeRange(toDbTime(slot.start), toDbTime(slot.end))} ·{' '}
            {availableNow.length} of {computers.length} free
          </span>
        </div>

        <div className="card-body">
          {slotIsPast(slot) ? (
            <p className="muted small" style={{ margin: 0 }}>
              This time slot has already passed. Choose a later slot or another day.
            </p>
          ) : (
            <div className="avail-grid">
              {computers.map((computer) => {
                const booked = bookingFor(computer.id, slot);
                const free = isFree(computer, slot);
                const isSelected = selected.includes(computer.id);

                const state = booked
                  ? booked.mine
                    ? 'Yours'
                    : 'Occupied'
                  : computer.status === 'MAINTENANCE' || !computer.is_bookable
                    ? 'Maintenance'
                    : 'Available';

                return (
                  <button
                    key={computer.id}
                    type="button"
                    className={`avail-card ${free ? 'is-free' : 'is-busy'} ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => toggle(computer)}
                    disabled={!free}
                  >
                    <span className="avail-ico" aria-hidden="true">🖥</span>
                    <span className="avail-body">
                      <span className="avail-name">{computer.name}</span>
                      <span className={`avail-state ${free ? 'ok' : ''}`}>
                        <i className="dot-sm" /> {state}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/*
        The booking bar, shown only on a phone.

        On a laptop the form and the schedule sit side by side, so the
        submit button is always in view. On a phone they stack, and by the
        time somebody has scrolled down to pick machines the button is a
        screen and a half above them — so it follows, carrying the count
        with it. `form=` lets it submit the form it is no longer inside.
      */}
      <div className="book-bar">
        <span className="book-bar-count">
          <strong>{selected.length}</strong>
          <span className="small muted">
            {selected.length === 1 ? 'computer' : 'computers'} selected
          </span>
        </span>

        <button
          type="submit"
          form="booking-form"
          className="btn btn-primary"
          disabled={submitting || selected.length === 0}
        >
          {submitting
            ? 'Submitting…'
            : selected.length > 1
              ? `Book ${selected.length}`
              : 'Book'}
        </button>
      </div>

      {/* Keeps the last of the machine list clear of the fixed bars. A
          spacer rather than padding on an ancestor, so it does not depend
          on :has() being available on whatever phone this runs on. */}
      <div className="book-bar-spacer" aria-hidden="true" />
    </>
  );
}
