import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { getSetting } from './settingsService.js';
import { labToday, labClock, labWeekday, labDaysAhead } from '../utils/labTime.js';
import { isAdminLike } from '../utils/roles.js';

/** States that still hold a slot on a machine. */
export const ACTIVE_STATES = ['PENDING', 'APPROVED'];

const todayISO = labToday;

function hoursBetween(start, end) {
  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return (toMinutes(end) - toMinutes(start)) / 60;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const weekdayOf = labWeekday;

/** "07:00" or "07:00:00" -> minutes since midnight. */
function minutesOf(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** "Monday, Tuesday, Wednesday and Thursday" */
function listDays(days) {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]);
  if (names.length <= 1) return names[0] ?? 'no days';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const daysAhead = labDaysAhead;

/**
 * Runs every server-side rule a reservation must satisfy before it is written.
 * Called by the controller, never by the client, so bypassing the React
 * form changes nothing.
 *
 * Returns the resolved computer and the policy in force.
 */
export async function validateReservationRequest({
  user,
  payload,
  excludeReservationId = null,
  // Bulk reservations check the per-user cap once for the whole request, and
  // allow the same person to hold several machines in the same slot.
  skipUserLimit = false,
  skipSelfOverlap = false,
}) {
  const { computer_id, reservation_date, start_time, end_time } = payload;
  const policy = await getSetting('reservation');

  // 3. The computer exists.
  const { data: computer, error: computerError } = await supabase
    .from(TABLES.computers)
    .select('id, name, status, is_bookable, laboratory_id')
    .eq('id', computer_id)
    .maybeSingle();

  if (computerError) throw ApiError.internal();
  if (!computer) throw ApiError.notFound('That computer could not be found.');

  // 4. The computer can be reserved.
  if (!computer.is_bookable) {
    throw ApiError.conflict(`${computer.name} is not available for reservation.`);
  }
  if (computer.status === 'MAINTENANCE') {
    throw ApiError.conflict(`${computer.name} is under maintenance and cannot be reserved.`);
  }

  // 5-8. Date and time sanity. Ordering is also enforced by the Zod schema
  // and by a CHECK constraint in the database.
  const offset = daysAhead(reservation_date);
  if (offset < 0) throw ApiError.badRequest('You cannot reserve a date in the past.');
  if (offset > policy.advance_days) {
    throw ApiError.badRequest(`Reservations can be made up to ${policy.advance_days} days in advance.`);
  }
  if (start_time >= end_time) {
    throw ApiError.badRequest('The end time must be after the start time.');
  }

  // The laboratory is only open on certain days, between certain hours.
  const openDays = policy.open_days ?? [1, 2, 3, 4];
  const weekday = weekdayOf(reservation_date);
  if (!openDays.includes(weekday)) {
    throw ApiError.badRequest(
      `The laboratory is closed on ${DAY_NAMES[weekday]}. It is open ${listDays(openDays)}.`
    );
  }

  const openMin = minutesOf(policy.open_time ?? '07:00');
  const closeMin = minutesOf(policy.close_time ?? '17:00');
  if (minutesOf(start_time) < openMin || minutesOf(end_time) > closeMin) {
    throw ApiError.badRequest(
      `The laboratory is open from ${policy.open_time ?? '07:00'} to ${policy.close_time ?? '17:00'}.`
    );
  }

  const duration = hoursBetween(start_time, end_time);
  if (duration > policy.max_hours_per_reservation) {
    throw ApiError.badRequest(
      `A single reservation cannot exceed ${policy.max_hours_per_reservation} hours.`
    );
  }

  // If the reservation is for today, the slot must not already have ended.
  if (offset === 0 && end_time <= labClock()) {
    throw ApiError.badRequest('That time slot has already passed.');
  }

  // 9. No conflicting reservation on the same machine.
  let conflictQuery = supabase
    .from(TABLES.reservations)
    .select('id, start_time, end_time')
    .eq('computer_id', computer_id)
    .eq('reservation_date', reservation_date)
    .in('status', ACTIVE_STATES)
    // Two ranges overlap when each starts before the other ends.
    .lt('start_time', end_time)
    .gt('end_time', start_time);

  if (excludeReservationId) conflictQuery = conflictQuery.neq('id', excludeReservationId);

  const { data: conflicts, error: conflictError } = await conflictQuery;
  if (conflictError) throw ApiError.internal();
  if (conflicts?.length) {
    throw ApiError.conflict('This computer is already reserved during the selected time.');
  }

  // The same user must not double-reserve themselves across machines either.
  if (!skipSelfOverlap) {
    let selfQuery = supabase
      .from(TABLES.reservations)
      .select('id')
      .eq('user_id', user.id)
      .eq('reservation_date', reservation_date)
      .in('status', ACTIVE_STATES)
      .lt('start_time', end_time)
      .gt('end_time', start_time);

    if (excludeReservationId) selfQuery = selfQuery.neq('id', excludeReservationId);

    const { data: selfClash } = await selfQuery;
    if (selfClash?.length) {
      throw ApiError.conflict('You already have another reservation during that time.');
    }
  }

  // ------------------------------------------------------------------
  // Faculty priority: a class reservation takes the whole laboratory.
  // Checked before the student's own allowance, because "the room is
  // reserved for a class" is the more useful message of the two.
  // ------------------------------------------------------------------
  if (user.role === 'student' && policy.faculty_priority !== false) {
    const { data: overlapping } = await supabase
      .from(TABLES.reservations)
      .select('id, start_time, end_time, user:users!reservations_user_id_fkey ( role, full_name ), computer:computers ( laboratory_id )')
      .eq('reservation_date', reservation_date)
      .in('status', ACTIVE_STATES)
      .lt('start_time', end_time)
      .gt('end_time', start_time);

    const facultyHold = (overlapping ?? []).find((row) => {
      const holder = Array.isArray(row.user) ? row.user[0] : row.user;
      const machine = Array.isArray(row.computer) ? row.computer[0] : row.computer;
      return holder?.role === 'faculty' && machine?.laboratory_id === computer.laboratory_id;
    });

    if (facultyHold) {
      throw ApiError.conflict(
        `The laboratory is reserved for a class between ${facultyHold.start_time.slice(0, 5)} ` +
          `and ${facultyHold.end_time.slice(0, 5)}. Please choose another time.`
      );
    }
  }

  // ------------------------------------------------------------------
  // Student allowance: a limited number of hours per day, on one machine
  // at a time. Faculty and admins are not capped this way.
  // ------------------------------------------------------------------
  if (user.role === 'student') {
    const maxHours = policy.student_max_hours_per_day ?? 2;

    let dayQuery = supabase
      .from(TABLES.reservations)
      .select('id, start_time, end_time')
      .eq('user_id', user.id)
      .eq('reservation_date', reservation_date)
      .in('status', ACTIVE_STATES);

    if (excludeReservationId) dayQuery = dayQuery.neq('id', excludeReservationId);

    const { data: sameDay } = await dayQuery;
    const alreadyBooked = (sameDay ?? []).reduce(
      (total, row) => total + hoursBetween(row.start_time, row.end_time),
      0
    );

    if (alreadyBooked + duration > maxHours) {
      const left = Math.max(0, maxHours - alreadyBooked);
      throw ApiError.conflict(
        left === 0
          ? `You have already used your ${maxHours} hours for that day.`
          : `Students may reserve ${maxHours} hours a day. You have ${left} hour${left === 1 ? '' : 's'} left on that day.`
      );
    }
  }

  // 10. Active reservation cap. This one is a student rule: a faculty class
  // reservation is one session but thirty rows, so counting rows would stop
  // faculty reservation the room at all. Faculty and admins are bounded instead
  // by opening hours and by conflicts with existing reservations.
  if (user.role === 'student' && !skipUserLimit) {
    let activeQuery = supabase
      .from(TABLES.reservations)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ACTIVE_STATES)
      .gte('reservation_date', todayISO());

    if (excludeReservationId) activeQuery = activeQuery.neq('id', excludeReservationId);

    const { count } = await activeQuery;
    if ((count ?? 0) >= policy.max_active_per_user) {
      throw ApiError.conflict(
        `You have reached the limit of ${policy.max_active_per_user} active reservations. Cancel one before creating another.`
      );
    }
  }

  return { computer, policy, duration };
}

/** Which initial status a new reservation gets, per role and policy. */
export function resolveInitialStatus(role, policy) {
  if (isAdminLike(role)) return 'APPROVED';
  if (role === 'faculty' && policy.auto_approve_faculty) return 'APPROVED';
  if (role === 'student' && policy.auto_approve_student) return 'APPROVED';
  return 'PENDING';
}

/**
 * Marks past-dated active reservations as COMPLETED / EXPIRED.
 * Runs on a timer from server.js rather than on every request.
 */
export async function sweepStaleReservations() {
  const today = todayISO();
  const clock = labClock();

  const { error: completedError } = await supabase
    .from(TABLES.reservations)
    .update({ status: 'COMPLETED' })
    .eq('status', 'APPROVED')
    .or(`reservation_date.lt.${today},and(reservation_date.eq.${today},end_time.lte.${clock})`);

  const { error: expiredError } = await supabase
    .from(TABLES.reservations)
    .update({ status: 'EXPIRED' })
    .eq('status', 'PENDING')
    .or(`reservation_date.lt.${today},and(reservation_date.eq.${today},end_time.lte.${clock})`);

  if (completedError || expiredError) {
    console.error('[sweep] reservation sweep failed:', completedError?.message || expiredError?.message);
  }
}

export default { validateReservationRequest, resolveInitialStatus, sweepStaleReservations, ACTIVE_STATES };
