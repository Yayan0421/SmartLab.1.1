import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import { getSetting } from './settingsService.js';

/** States that still hold a slot on a machine. */
export const ACTIVE_STATES = ['PENDING', 'APPROVED'];

const todayISO = () => new Date().toISOString().slice(0, 10);

function hoursBetween(start, end) {
  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return (toMinutes(end) - toMinutes(start)) / 60;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Weekday of a YYYY-MM-DD string, read in UTC so it cannot drift. */
function weekdayOf(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

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

function daysAhead(dateStr) {
  const target = new Date(`${dateStr}T00:00:00Z`).getTime();
  const today = new Date(`${todayISO()}T00:00:00Z`).getTime();
  return Math.round((target - today) / 86_400_000);
}

/**
 * Runs every server-side rule a booking must satisfy before it is written.
 * Called by the controller, never by the client, so bypassing the React
 * form changes nothing.
 *
 * Returns the resolved computer and the policy in force.
 */
export async function validateBookingRequest({
  user,
  payload,
  excludeBookingId = null,
  // Bulk reservations check the per-user cap once for the whole request, and
  // allow the same person to hold several machines in the same slot.
  skipUserLimit = false,
  skipSelfOverlap = false,
}) {
  const { computer_id, booking_date, start_time, end_time } = payload;
  const policy = await getSetting('booking');

  // 3. The computer exists.
  const { data: computer, error: computerError } = await supabase
    .from(TABLES.computers)
    .select('id, name, status, is_bookable, laboratory_id')
    .eq('id', computer_id)
    .maybeSingle();

  if (computerError) throw ApiError.internal();
  if (!computer) throw ApiError.notFound('That computer could not be found.');

  // 4. The computer can be booked.
  if (!computer.is_bookable) {
    throw ApiError.conflict(`${computer.name} is not available for booking.`);
  }
  if (computer.status === 'MAINTENANCE') {
    throw ApiError.conflict(`${computer.name} is under maintenance and cannot be booked.`);
  }

  // 5-8. Date and time sanity. Ordering is also enforced by the Zod schema
  // and by a CHECK constraint in the database.
  const offset = daysAhead(booking_date);
  if (offset < 0) throw ApiError.badRequest('You cannot book a date in the past.');
  if (offset > policy.advance_days) {
    throw ApiError.badRequest(`Bookings can be made up to ${policy.advance_days} days in advance.`);
  }
  if (start_time >= end_time) {
    throw ApiError.badRequest('The end time must be after the start time.');
  }

  // The laboratory is only open on certain days, between certain hours.
  const openDays = policy.open_days ?? [1, 2, 3, 4];
  const weekday = weekdayOf(booking_date);
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
  if (duration > policy.max_hours_per_booking) {
    throw ApiError.badRequest(
      `A single booking cannot exceed ${policy.max_hours_per_booking} hours.`
    );
  }

  // If the booking is for today, the slot must not already have ended.
  if (offset === 0) {
    const now = new Date();
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    if (end_time <= clock) {
      throw ApiError.badRequest('That time slot has already passed.');
    }
  }

  // 9. No conflicting booking on the same machine.
  let conflictQuery = supabase
    .from(TABLES.bookings)
    .select('id, start_time, end_time')
    .eq('computer_id', computer_id)
    .eq('booking_date', booking_date)
    .in('status', ACTIVE_STATES)
    // Two ranges overlap when each starts before the other ends.
    .lt('start_time', end_time)
    .gt('end_time', start_time);

  if (excludeBookingId) conflictQuery = conflictQuery.neq('id', excludeBookingId);

  const { data: conflicts, error: conflictError } = await conflictQuery;
  if (conflictError) throw ApiError.internal();
  if (conflicts?.length) {
    throw ApiError.conflict('This computer is already booked during the selected time.');
  }

  // The same user must not double-book themselves across machines either.
  if (!skipSelfOverlap) {
    let selfQuery = supabase
      .from(TABLES.bookings)
      .select('id')
      .eq('user_id', user.id)
      .eq('booking_date', booking_date)
      .in('status', ACTIVE_STATES)
      .lt('start_time', end_time)
      .gt('end_time', start_time);

    if (excludeBookingId) selfQuery = selfQuery.neq('id', excludeBookingId);

    const { data: selfClash } = await selfQuery;
    if (selfClash?.length) {
      throw ApiError.conflict('You already have another booking during that time.');
    }
  }

  // 10. Per-user active booking limit. Admins are exempt so they can make
  // bookings on behalf of the laboratory.
  if (user.role !== 'admin' && !skipUserLimit) {
    let activeQuery = supabase
      .from(TABLES.bookings)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ACTIVE_STATES)
      .gte('booking_date', todayISO());

    if (excludeBookingId) activeQuery = activeQuery.neq('id', excludeBookingId);

    const { count } = await activeQuery;
    if ((count ?? 0) >= policy.max_active_per_user) {
      throw ApiError.conflict(
        `You have reached the limit of ${policy.max_active_per_user} active bookings. Cancel one before creating another.`
      );
    }
  }

  return { computer, policy, duration };
}

/** Which initial status a new booking gets, per role and policy. */
export function resolveInitialStatus(role, policy) {
  if (role === 'admin') return 'APPROVED';
  if (role === 'faculty' && policy.auto_approve_faculty) return 'APPROVED';
  if (role === 'student' && policy.auto_approve_student) return 'APPROVED';
  return 'PENDING';
}

/**
 * Marks past-dated active bookings as COMPLETED / EXPIRED.
 * Runs on a timer from server.js rather than on every request.
 */
export async function sweepStaleBookings() {
  const today = todayISO();
  const now = new Date();
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;

  const { error: completedError } = await supabase
    .from(TABLES.bookings)
    .update({ status: 'COMPLETED' })
    .eq('status', 'APPROVED')
    .or(`booking_date.lt.${today},and(booking_date.eq.${today},end_time.lte.${clock})`);

  const { error: expiredError } = await supabase
    .from(TABLES.bookings)
    .update({ status: 'EXPIRED' })
    .eq('status', 'PENDING')
    .or(`booking_date.lt.${today},and(booking_date.eq.${today},end_time.lte.${clock})`);

  if (completedError || expiredError) {
    console.error('[sweep] booking sweep failed:', completedError?.message || expiredError?.message);
  }
}

export default { validateBookingRequest, resolveInitialStatus, sweepStaleBookings, ACTIVE_STATES };
