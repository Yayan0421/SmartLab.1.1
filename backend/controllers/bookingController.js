import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getPagination, paginated } from '../utils/pagination.js';
import { recordAudit } from '../services/auditService.js';
import { notify, notifyAdmins } from '../services/notificationService.js';
import {
  validateBookingRequest,
  resolveInitialStatus,
  ACTIVE_STATES,
} from '../services/bookingService.js';
import { getSetting } from '../services/settingsService.js';

const BOOKING_SELECT = `
  id, user_id, computer_id, booking_date, start_time, end_time, purpose, subject, status,
  approved_by, approved_at, decision_note, cancelled_at, created_at, updated_at,
  user:users!bookings_user_id_fkey ( id, full_name, email, role, department ),
  computer:computers ( id, name, computer_number, status, laboratory:laboratories ( id, name ) )
`;

const flatten = (row) => ({
  ...row,
  user: Array.isArray(row.user) ? row.user[0] : row.user,
  computer: Array.isArray(row.computer) ? row.computer[0] : row.computer,
});

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Shared list builder used by both the admin list and "my bookings". */
async function queryBookings(req, { forceUserId = null } = {}) {
  const { page, limit, status, computer_id, user_id, date_from, date_to, search, scope, sort, order } =
    req.query;
  const { from, to } = getPagination({ page, limit });

  let query = supabase.from(TABLES.bookings).select(BOOKING_SELECT, { count: 'exact' });

  if (forceUserId) query = query.eq('user_id', forceUserId);
  else if (user_id) query = query.eq('user_id', user_id);

  if (status) query = query.eq('status', status);
  if (computer_id) query = query.eq('computer_id', computer_id);
  if (date_from) query = query.gte('booking_date', date_from);
  if (date_to) query = query.lte('booking_date', date_to);

  if (scope === 'upcoming') {
    query = query.gte('booking_date', todayISO()).in('status', ACTIVE_STATES);
  } else if (scope === 'past') {
    query = query.in('status', ['COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED']);
  } else if (scope === 'active') {
    query = query.in('status', ACTIVE_STATES);
  }

  if (req.query.subject) query = query.eq('subject', req.query.subject);

  if (search) {
    const term = `%${search.replace(/[%_]/g, '')}%`;
    query = query.or(`purpose.ilike.${term},subject.ilike.${term}`);
  }

  const { data, count, error } = await query
    .order(sort, { ascending: order === 'asc' })
    .order('start_time', { ascending: true })
    .range(from, to);

  if (error) throw ApiError.internal();

  return paginated((data ?? []).map(flatten), count, { page, limit });
}

/** GET /api/bookings — admin sees everything. */
export const listBookings = asyncHandler(async (req, res) => {
  const result = await queryBookings(req);
  res.json({ success: true, ...result });
});

/** GET /api/bookings/my — scoped to the caller, whatever they pass in. */
export const listMyBookings = asyncHandler(async (req, res) => {
  const result = await queryBookings(req, { forceUserId: req.user.id });
  res.json({ success: true, ...result });
});

/** GET /api/bookings/summary — counters for the faculty/student dashboard. */
export const myBookingSummary = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const today = todayISO();

  const [active, upcoming, completed, pending] = await Promise.all([
    supabase
      .from(TABLES.bookings)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ACTIVE_STATES)
      .gte('booking_date', today),
    supabase
      .from(TABLES.bookings)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'APPROVED')
      .gt('booking_date', today),
    supabase
      .from(TABLES.bookings)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'COMPLETED'),
    supabase
      .from(TABLES.bookings)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'PENDING'),
  ]);

  const { data: next } = await supabase
    .from(TABLES.bookings)
    .select(BOOKING_SELECT)
    .eq('user_id', userId)
    .in('status', ACTIVE_STATES)
    .gte('booking_date', today)
    .order('booking_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(5);

  res.json({
    success: true,
    data: {
      active: active.count ?? 0,
      upcoming: upcoming.count ?? 0,
      completed: completed.count ?? 0,
      pending: pending.count ?? 0,
      next: (next ?? []).map(flatten),
    },
  });
});

/** GET /api/bookings/stats — admin dashboard counters. */
export const bookingStats = asyncHandler(async (_req, res) => {
  const today = todayISO();

  const [pending, todayCount, approved, total] = await Promise.all([
    supabase.from(TABLES.bookings).select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from(TABLES.bookings).select('id', { count: 'exact', head: true }).eq('booking_date', today),
    supabase
      .from(TABLES.bookings)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'APPROVED')
      .gte('booking_date', today),
    supabase.from(TABLES.bookings).select('id', { count: 'exact', head: true }),
  ]);

  // Booking volume for the last 7 days, grouped in JS over a bounded window.
  const weekAgo = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const { data: recent } = await supabase
    .from(TABLES.bookings)
    .select('booking_date, status')
    .gte('booking_date', weekAgo)
    .lte('booking_date', today);

  const series = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const rows = (recent ?? []).filter((r) => r.booking_date === day);
    series.push({
      date: day,
      total: rows.length,
      approved: rows.filter((r) => r.status === 'APPROVED' || r.status === 'COMPLETED').length,
      pending: rows.filter((r) => r.status === 'PENDING').length,
    });
  }

  res.json({
    success: true,
    data: {
      pending: pending.count ?? 0,
      today: todayCount.count ?? 0,
      approved_upcoming: approved.count ?? 0,
      total: total.count ?? 0,
      weekly: series,
    },
  });
});

/** GET /api/bookings/:id — owner or admin only. */
export const getBooking = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from(TABLES.bookings)
    .select(BOOKING_SELECT)
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound('That booking could not be found.');

  if (req.user.role !== 'admin' && data.user_id !== req.user.id) {
    throw ApiError.forbidden('You can only view your own bookings.');
  }

  res.json({ success: true, data: flatten(data) });
});

/** POST /api/bookings */
export const createBooking = asyncHandler(async (req, res) => {
  const payload = req.body;

  const { computer, policy } = await validateBookingRequest({ user: req.user, payload });
  const status = resolveInitialStatus(req.user.role, policy);

  const { data, error } = await supabase
    .from(TABLES.bookings)
    .insert({
      user_id: req.user.id,
      computer_id: payload.computer_id,
      booking_date: payload.booking_date,
      start_time: payload.start_time,
      end_time: payload.end_time,
      purpose: payload.purpose,
      subject: payload.subject,
      status,
      approved_by: status === 'APPROVED' ? req.user.id : null,
      approved_at: status === 'APPROVED' ? new Date().toISOString() : null,
    })
    .select(BOOKING_SELECT)
    .single();

  if (error) throw ApiError.internal();

  await recordAudit(req, {
    action: 'booking.create',
    entity: 'bookings',
    entityId: data.id,
    details: { computer: computer.name, status },
  });

  if (status === 'PENDING') {
    await notifyAdmins({
      title: 'New booking request',
      message: `${req.user.full_name} requested ${computer.name} on ${payload.booking_date} (${payload.start_time.slice(0, 5)}-${payload.end_time.slice(0, 5)}).`,
      type: 'booking',
      link: '/admin/bookings',
    });
  }

  await notify(req.user.id, {
    title: status === 'APPROVED' ? 'Booking confirmed' : 'Booking submitted',
    message:
      status === 'APPROVED'
        ? `${computer.name} is reserved for you on ${payload.booking_date}.`
        : `Your request for ${computer.name} is awaiting approval.`,
    type: 'booking',
  });

  res.status(201).json({ success: true, data: flatten(data) });
});

/** Loads a booking and checks it is in a state the requested action allows. */
async function loadForDecision(id, allowedStates) {
  const { data, error } = await supabase
    .from(TABLES.bookings)
    .select(BOOKING_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound('That booking could not be found.');
  if (!allowedStates.includes(data.status)) {
    throw ApiError.conflict(`This booking is ${data.status.toLowerCase()} and can no longer be changed.`);
  }
  return flatten(data);
}

/** PATCH /api/bookings/:id/approve — admin only. */
export const approveBooking = asyncHandler(async (req, res) => {
  const booking = await loadForDecision(req.params.id, ['PENDING']);

  // Re-check for conflicts: another booking may have been approved for the
  // same slot while this one sat in the queue.
  await validateBookingRequest({
    user: { id: booking.user_id, role: 'admin' },
    payload: {
      computer_id: booking.computer_id,
      booking_date: booking.booking_date,
      start_time: booking.start_time,
      end_time: booking.end_time,
    },
    excludeBookingId: booking.id,
  });

  const { data, error } = await supabase
    .from(TABLES.bookings)
    .update({
      status: 'APPROVED',
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
      decision_note: req.body?.note || null,
    })
    .eq('id', booking.id)
    .eq('status', 'PENDING')
    .select(BOOKING_SELECT)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.conflict('This booking was already decided by someone else.');

  await recordAudit(req, { action: 'booking.approve', entity: 'bookings', entityId: booking.id });
  await notify(booking.user_id, {
    title: 'Booking approved',
    message: `${booking.computer?.name ?? 'Your computer'} is reserved for you on ${booking.booking_date}.`,
    type: 'success',
  });

  res.json({ success: true, data: flatten(data) });
});

/** PATCH /api/bookings/:id/reject — admin only. */
export const rejectBooking = asyncHandler(async (req, res) => {
  const booking = await loadForDecision(req.params.id, ['PENDING']);

  const { data, error } = await supabase
    .from(TABLES.bookings)
    .update({
      status: 'REJECTED',
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
      decision_note: req.body?.note || null,
    })
    .eq('id', booking.id)
    .eq('status', 'PENDING')
    .select(BOOKING_SELECT)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.conflict('This booking was already decided by someone else.');

  await recordAudit(req, {
    action: 'booking.reject',
    entity: 'bookings',
    entityId: booking.id,
    details: { note: req.body?.note || null },
  });

  await notify(booking.user_id, {
    title: 'Booking rejected',
    message: req.body?.note
      ? `Your booking on ${booking.booking_date} was rejected: ${req.body.note}`
      : `Your booking on ${booking.booking_date} was rejected.`,
    type: 'warning',
  });

  res.json({ success: true, data: flatten(data) });
});

/** PATCH /api/bookings/:id/cancel — owner or admin. */
export const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await loadForDecision(req.params.id, ['PENDING', 'APPROVED']);

  const isOwner = booking.user_id === req.user.id;
  if (!isOwner && req.user.role !== 'admin') {
    throw ApiError.forbidden('You can only cancel your own bookings.');
  }

  // A slot that has already started cannot be cancelled by its owner; an
  // admin still can, to free the machine.
  if (isOwner && req.user.role !== 'admin') {
    const now = new Date();
    const today = todayISO();
    const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    if (booking.booking_date < today || (booking.booking_date === today && booking.start_time <= clock)) {
      throw ApiError.conflict('This booking has already started and can no longer be cancelled.');
    }
  }

  const { data, error } = await supabase
    .from(TABLES.bookings)
    .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
    .eq('id', booking.id)
    .in('status', ['PENDING', 'APPROVED'])
    .select(BOOKING_SELECT)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.conflict('This booking is no longer active.');

  await recordAudit(req, { action: 'booking.cancel', entity: 'bookings', entityId: booking.id });

  if (!isOwner) {
    await notify(booking.user_id, {
      title: 'Booking cancelled',
      message: `An administrator cancelled your booking on ${booking.booking_date}.`,
      type: 'warning',
    });
  }

  res.json({ success: true, data: flatten(data) });
});


/**
 * GET /api/bookings/policy
 *
 * The booking rules in force, for any signed-in user. The booking screens
 * build their day tabs and time slots from this, so the form can never
 * offer a slot the server would reject.
 */
export const getPolicy = asyncHandler(async (_req, res) => {
  const policy = await getSetting('booking');
  res.json({
    success: true,
    data: {
      open_days: policy.open_days ?? [1, 2, 3, 4],
      open_time: policy.open_time ?? '07:00',
      close_time: policy.close_time ?? '17:00',
      advance_days: policy.advance_days,
      max_active_per_user: policy.max_active_per_user,
      max_hours_per_booking: policy.max_hours_per_booking,
      student_max_hours_per_day: policy.student_max_hours_per_day ?? 2,
      student_max_computers: policy.student_max_computers ?? 1,
      faculty_priority: policy.faculty_priority !== false,
    },
  });
});

/**
 * GET /api/bookings/schedule?date=YYYY-MM-DD
 *
 * Everything the laboratory schedule grid needs in one request: the list of
 * workstations and the day's active bookings. The grid itself is assembled
 * in the browser, which keeps this endpoint cheap and cacheable.
 */
export const getSchedule = asyncHandler(async (req, res) => {
  const date = req.query.date || todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw ApiError.badRequest('Provide a date as YYYY-MM-DD.');
  }

  const [{ data: computers, error: computerError }, { data: bookings, error: bookingError }] =
    await Promise.all([
      supabase
        .from(TABLES.computers)
        .select('id, name, computer_number, status, is_bookable, laboratory:laboratories ( id, name )')
        .order('computer_number', { ascending: true }),
      supabase
        .from(TABLES.bookings)
        .select(`
          id, computer_id, user_id, start_time, end_time, status, subject, purpose,
          user:users!bookings_user_id_fkey ( role, full_name ),
          computer:computers ( laboratory_id )
        `)
        .eq('booking_date', date)
        .in('status', ACTIVE_STATES),
    ]);

  if (computerError || bookingError) throw ApiError.internal();

  res.json({
    success: true,
    data: {
      date,
      computers: (computers ?? []).map((c) => ({
        ...c,
        laboratory: Array.isArray(c.laboratory) ? c.laboratory[0] : c.laboratory,
      })),
      // `mine` highlights the caller's own reservations; `by_faculty` lets
      // the grid close a whole row when a class has the room.
      bookings: (bookings ?? []).map((b) => {
        const holder = Array.isArray(b.user) ? b.user[0] : b.user;
        const machine = Array.isArray(b.computer) ? b.computer[0] : b.computer;
        return {
          id: b.id,
          computer_id: b.computer_id,
          start_time: b.start_time,
          end_time: b.end_time,
          status: b.status,
          subject: b.subject,
          mine: b.user_id === req.user.id,
          by_faculty: holder?.role === 'faculty',
          holder_name: holder?.full_name ?? null,
          laboratory_id: machine?.laboratory_id ?? null,
        };
      }),
    },
  });
});

/**
 * POST /api/bookings/bulk
 *
 * Reserves several workstations for the same slot, for a class or group.
 * Every machine is validated first; only if all of them pass is anything
 * written, so the caller never ends up with a half-made reservation.
 */
export const createBulkBooking = asyncHandler(async (req, res) => {
  const { computer_ids, booking_date, start_time, end_time, purpose, subject } = req.body;
  const unique = [...new Set(computer_ids)];

  const policy = await getSetting('booking');

  // Students work on one machine; reserving a set of them is a faculty
  // action, for running a class.
  if (req.user.role === 'student') {
    const maxComputers = policy.student_max_computers ?? 1;
    if (unique.length > maxComputers) {
      throw ApiError.conflict(
        maxComputers === 1
          ? 'Students may book one computer at a time.'
          : `Students may book up to ${maxComputers} computers at a time.`
      );
    }
  }

  // The cap counts the whole request rather than each machine, and applies
  // to students only — faculty reserve whole rooms for classes.
  if (req.user.role === 'student') {
    const { count } = await supabase
      .from(TABLES.bookings)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .in('status', ACTIVE_STATES)
      .gte('booking_date', todayISO());

    if ((count ?? 0) + unique.length > policy.max_active_per_user) {
      throw ApiError.conflict(
        `You can hold ${policy.max_active_per_user} active bookings at a time. ` +
          `You already have ${count ?? 0}, so you can reserve ` +
          `${Math.max(0, policy.max_active_per_user - (count ?? 0))} more.`
      );
    }
  }

  // Validate every machine before writing any of them.
  const checked = [];
  for (const computer_id of unique) {
    const { computer } = await validateBookingRequest({
      user: req.user,
      payload: { computer_id, booking_date, start_time, end_time },
      skipUserLimit: true,
      skipSelfOverlap: true,
    });
    checked.push(computer);
  }

  const status = resolveInitialStatus(req.user.role, policy);
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(TABLES.bookings)
    .insert(
      unique.map((computer_id) => ({
        user_id: req.user.id,
        computer_id,
        booking_date,
        start_time,
        end_time,
        purpose,
        subject,
        status,
        approved_by: status === 'APPROVED' ? req.user.id : null,
        approved_at: status === 'APPROVED' ? now : null,
      }))
    )
    .select(BOOKING_SELECT);

  if (error) throw ApiError.internal();

  const names = checked.map((c) => c.name).join(', ');

  await recordAudit(req, {
    action: 'booking.create_bulk',
    entity: 'bookings',
    details: { count: unique.length, subject, computers: names },
  });

  if (status === 'PENDING') {
    await notifyAdmins({
      title: 'New booking request',
      message: `${req.user.full_name} requested ${unique.length} computer(s) on ${booking_date} for ${subject}.`,
      type: 'booking',
      link: '/admin/bookings',
    });
  }

  await notify(req.user.id, {
    title: status === 'APPROVED' ? 'Booking confirmed' : 'Booking submitted',
    message:
      status === 'APPROVED'
        ? `${names} reserved on ${booking_date}.`
        : `Your request for ${names} is awaiting approval.`,
    type: 'booking',
  });

  res.status(201).json({ success: true, data: (data ?? []).map(flatten) });
});

/** GET /api/bookings/availability?computer_id=&date= — slots already taken. */
export const getAvailability = asyncHandler(async (req, res) => {
  const { computer_id, date } = req.query;
  if (!computer_id || !date) {
    throw ApiError.badRequest('Provide computer_id and date.');
  }

  const { data, error } = await supabase
    .from(TABLES.bookings)
    .select('id, start_time, end_time, status')
    .eq('computer_id', computer_id)
    .eq('booking_date', date)
    .in('status', ACTIVE_STATES)
    .order('start_time');

  if (error) throw ApiError.internal();

  res.json({ success: true, data: data ?? [] });
});
