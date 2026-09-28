import { randomUUID } from 'node:crypto';
import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getPagination, paginated } from '../utils/pagination.js';
import { recordAudit } from '../services/auditService.js';
import { notify, notifyAdmins } from '../services/notificationService.js';
import {
  publishReservationChange,
  onReservationChange,
} from '../services/reservationEvents.js';
import { isAdminLike } from '../utils/roles.js';
import {
  validateReservationRequest,
  resolveInitialStatus,
  ACTIVE_STATES,
} from '../services/reservationService.js';
import { getSetting } from '../services/settingsService.js';
import { labToday, labClock } from '../utils/labTime.js';

const RESERVATION_SELECT = `
  id, user_id, computer_id, reservation_date, start_time, end_time, purpose, subject, batch_id, status,
  approved_by, approved_at, decision_note, cancelled_at, created_at, updated_at,
  checked_in_at, checked_out_at, receipt_no,
  user:users!reservations_user_id_fkey ( id, full_name, email, role, department, course ),
  computer:computers ( id, name, computer_number, status, laboratory:laboratories ( id, name ) )
`;

const flatten = (row) => ({
  ...row,
  user: Array.isArray(row.user) ? row.user[0] : row.user,
  computer: Array.isArray(row.computer) ? row.computer[0] : row.computer,
});

const todayISO = labToday;

/** Shared list builder used by both the admin list and "my reservations". */
async function queryReservations(req, { forceUserId = null } = {}) {
  const { page, limit, status, computer_id, user_id, date_from, date_to, search, scope, sort, order } =
    req.query;
  const { from, to } = getPagination({ page, limit });

  let query = supabase.from(TABLES.reservations).select(RESERVATION_SELECT, { count: 'exact' });

  if (forceUserId) query = query.eq('user_id', forceUserId);
  else if (user_id) query = query.eq('user_id', user_id);

  if (status) query = query.eq('status', status);
  if (computer_id) query = query.eq('computer_id', computer_id);
  if (date_from) query = query.gte('reservation_date', date_from);
  if (date_to) query = query.lte('reservation_date', date_to);

  if (scope === 'upcoming') {
    query = query.gte('reservation_date', todayISO()).in('status', ACTIVE_STATES);
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

/** GET /api/reservations — admin sees everything. */
export const listReservations = asyncHandler(async (req, res) => {
  const result = await queryReservations(req);
  res.json({ success: true, ...result });
});

/** GET /api/reservations/my — scoped to the caller, whatever they pass in. */
export const listMyReservations = asyncHandler(async (req, res) => {
  const result = await queryReservations(req, { forceUserId: req.user.id });
  res.json({ success: true, ...result });
});

/** GET /api/reservations/summary — counters for the faculty/student dashboard. */
export const myReservationSummary = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const today = todayISO();

  const [active, upcoming, completed, pending] = await Promise.all([
    supabase
      .from(TABLES.reservations)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ACTIVE_STATES)
      .gte('reservation_date', today),
    supabase
      .from(TABLES.reservations)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'APPROVED')
      .gt('reservation_date', today),
    supabase
      .from(TABLES.reservations)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'COMPLETED'),
    supabase
      .from(TABLES.reservations)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'PENDING'),
  ]);

  const { data: next } = await supabase
    .from(TABLES.reservations)
    .select(RESERVATION_SELECT)
    .eq('user_id', userId)
    .in('status', ACTIVE_STATES)
    .gte('reservation_date', today)
    .order('reservation_date', { ascending: true })
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

/** GET /api/reservations/stats — admin dashboard counters. */
export const reservationStats = asyncHandler(async (_req, res) => {
  const today = todayISO();

  const [pending, todayCount, approved, total] = await Promise.all([
    supabase.from(TABLES.reservations).select('id', { count: 'exact', head: true }).eq('status', 'PENDING'),
    supabase.from(TABLES.reservations).select('id', { count: 'exact', head: true }).eq('reservation_date', today),
    supabase
      .from(TABLES.reservations)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'APPROVED')
      .gte('reservation_date', today),
    supabase.from(TABLES.reservations).select('id', { count: 'exact', head: true }),
  ]);

  // Reservation volume for the last 7 days, grouped in JS over a bounded window.
  const weekAgo = labToday(new Date(Date.now() - 6 * 86_400_000));
  const { data: recent } = await supabase
    .from(TABLES.reservations)
    .select('reservation_date, status')
    .gte('reservation_date', weekAgo)
    .lte('reservation_date', today);

  const series = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = labToday(new Date(Date.now() - i * 86_400_000));
    const rows = (recent ?? []).filter((r) => r.reservation_date === day);
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

/** GET /api/reservations/:id — owner or admin only. */
export const getReservation = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from(TABLES.reservations)
    .select(RESERVATION_SELECT)
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound('That reservation could not be found.');

  if (!isAdminLike(req.user.role) && data.user_id !== req.user.id) {
    throw ApiError.forbidden('You can only view your own reservations.');
  }

  res.json({ success: true, data: flatten(data) });
});

/** POST /api/reservations */
export const createReservation = asyncHandler(async (req, res) => {
  const payload = req.body;

  const { computer, policy } = await validateReservationRequest({ user: req.user, payload });
  const status = resolveInitialStatus(req.user.role, policy);

  const { data, error } = await supabase
    .from(TABLES.reservations)
    .insert({
      user_id: req.user.id,
      computer_id: payload.computer_id,
      reservation_date: payload.reservation_date,
      start_time: payload.start_time,
      end_time: payload.end_time,
      purpose: payload.purpose,
      subject: payload.subject,
      status,
      approved_by: status === 'APPROVED' ? req.user.id : null,
      approved_at: status === 'APPROVED' ? new Date().toISOString() : null,
    })
    .select(RESERVATION_SELECT)
    .single();

  if (error) throw ApiError.internal();

  await recordAudit(req, {
    action: 'reservation.create',
    entity: 'reservations',
    entityId: data.id,
    details: { computer: computer.name, status },
  });
  publishReservationChange({ id: data.id, userId: data.user_id, status: status, action: 'create' });

  if (status === 'PENDING') {
    await notifyAdmins({
      title: 'New reservation request',
      message: `${req.user.full_name} requested ${computer.name} on ${payload.reservation_date} (${payload.start_time.slice(0, 5)}-${payload.end_time.slice(0, 5)}).`,
      type: 'reservation',
      link: '/admin/reservations',
    });
  }

  await notify(req.user.id, {
    title: status === 'APPROVED' ? 'Reservation confirmed' : 'Reservation submitted',
    message:
      status === 'APPROVED'
        ? `${computer.name} is reserved for you on ${payload.reservation_date}.`
        : `Your request for ${computer.name} is awaiting approval.`,
    type: 'reservation',
  });

  res.status(201).json({ success: true, data: flatten(data) });
});

/** Loads a reservation and checks it is in a state the requested action allows. */
async function loadForDecision(id, allowedStates) {
  const { data, error } = await supabase
    .from(TABLES.reservations)
    .select(RESERVATION_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound('That reservation could not be found.');
  if (!allowedStates.includes(data.status)) {
    throw ApiError.conflict(`This reservation is ${data.status.toLowerCase()} and can no longer be changed.`);
  }
  return flatten(data);
}

/** PATCH /api/reservations/:id/approve — admin only. */
export const approveReservation = asyncHandler(async (req, res) => {
  const reservation = await loadForDecision(req.params.id, ['PENDING']);

  // Re-check for conflicts: another reservation may have been approved for the
  // same slot while this one sat in the queue.
  await validateReservationRequest({
    user: { id: reservation.user_id, role: 'admin' },
    payload: {
      computer_id: reservation.computer_id,
      reservation_date: reservation.reservation_date,
      start_time: reservation.start_time,
      end_time: reservation.end_time,
    },
    excludeReservationId: reservation.id,
  });

  const { data, error } = await supabase
    .from(TABLES.reservations)
    .update({
      status: 'APPROVED',
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
      decision_note: req.body?.note || null,
    })
    .eq('id', reservation.id)
    .eq('status', 'PENDING')
    .select(RESERVATION_SELECT)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.conflict('This reservation was already decided by someone else.');

  await recordAudit(req, { action: 'reservation.approve', entity: 'reservations', entityId: reservation.id });
  publishReservationChange({ id: reservation.id, userId: reservation.user_id, status: 'APPROVED', action: 'approve' });
  await notify(reservation.user_id, {
    title: 'Reservation approved',
    message: `${reservation.computer?.name ?? 'Your computer'} is reserved for you on ${reservation.reservation_date}.`,
    type: 'success',
  });

  res.json({ success: true, data: flatten(data) });
});

/**
 * GET /api/reservations/stream — server-sent events.
 *
 * Holds the connection open and writes a line whenever a reservation
 * changes, so an approval reaches the person who made the request without
 * them refreshing anything.
 *
 * Each subscriber is filtered by the role it connected with: an
 * administrator hears about every reservation, everybody else only about
 * their own. The payload carries no detail beyond an id and a status - the
 * page refetches through the ordinary endpoints, which re-check permission
 * the usual way. Nothing here becomes a second way to read data.
 */
export const streamReservations = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Render and most proxies buffer responses by default, which would
    // hold every event back until the connection closed.
    'X-Accel-Buffering': 'no',
  });

  // How long the browser waits before reconnecting if this drops.
  res.write('retry: 5000\n\n');
  res.write('event: ready\ndata: {}\n\n');

  const isAdmin = isAdminLike(req.user.role);
  const mine = req.user.id;

  const unsubscribe = onReservationChange((event) => {
    if (!isAdmin && event.user_id !== mine) return;
    res.write(`event: reservation\ndata: ${JSON.stringify(event)}\n\n`);
  });

  // A comment line every 25s: proxies drop idle connections, and this is
  // cheaper than letting the browser reconnect every minute.
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  });
};

/** PATCH /api/reservations/:id/reject — admin only. */
export const rejectReservation = asyncHandler(async (req, res) => {
  const reservation = await loadForDecision(req.params.id, ['PENDING']);

  const { data, error } = await supabase
    .from(TABLES.reservations)
    .update({
      status: 'REJECTED',
      approved_by: req.user.id,
      approved_at: new Date().toISOString(),
      decision_note: req.body?.note || null,
    })
    .eq('id', reservation.id)
    .eq('status', 'PENDING')
    .select(RESERVATION_SELECT)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.conflict('This reservation was already decided by someone else.');

  await recordAudit(req, {
    action: 'reservation.reject',
    entity: 'reservations',
    entityId: reservation.id,
    details: { note: req.body?.note || null },
  });
  publishReservationChange({ id: reservation.id, userId: reservation.user_id, status: 'REJECTED', action: 'reject' });

  await notify(reservation.user_id, {
    title: 'Reservation rejected',
    message: req.body?.note
      ? `Your reservation on ${reservation.reservation_date} was rejected: ${req.body.note}`
      : `Your reservation on ${reservation.reservation_date} was rejected.`,
    type: 'warning',
  });

  res.json({ success: true, data: flatten(data) });
});

/** PATCH /api/reservations/:id/cancel — owner or admin. */
export const cancelReservation = asyncHandler(async (req, res) => {
  const reservation = await loadForDecision(req.params.id, ['PENDING', 'APPROVED']);

  const isOwner = reservation.user_id === req.user.id;
  if (!isOwner && !isAdminLike(req.user.role)) {
    throw ApiError.forbidden('You can only cancel your own reservations.');
  }

  // A slot that has already started cannot be cancelled by its owner; an
  // admin still can, to free the machine.
  if (isOwner && !isAdminLike(req.user.role)) {
    const today = todayISO();
    const clock = labClock();
    if (reservation.reservation_date < today || (reservation.reservation_date === today && reservation.start_time <= clock)) {
      throw ApiError.conflict('This reservation has already started and can no longer be cancelled.');
    }
  }

  const { data, error } = await supabase
    .from(TABLES.reservations)
    .update({ status: 'CANCELLED', cancelled_at: new Date().toISOString() })
    .eq('id', reservation.id)
    .in('status', ['PENDING', 'APPROVED'])
    .select(RESERVATION_SELECT)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.conflict('This reservation is no longer active.');

  await recordAudit(req, { action: 'reservation.cancel', entity: 'reservations', entityId: reservation.id });
  publishReservationChange({ id: reservation.id, userId: reservation.user_id, status: 'CANCELLED', action: 'cancel' });

  if (!isOwner) {
    await notify(reservation.user_id, {
      title: 'Reservation cancelled',
      message: `An administrator cancelled your reservation on ${reservation.reservation_date}.`,
      type: 'warning',
    });
  }

  res.json({ success: true, data: flatten(data) });
});


/**
 * GET /api/reservations/policy
 *
 * The reservation rules in force, for any signed-in user. The reservation screens
 * build their day tabs and time slots from this, so the form can never
 * offer a slot the server would reject.
 */
export const getPolicy = asyncHandler(async (_req, res) => {
  const policy = await getSetting('reservation');
  res.json({
    success: true,
    data: {
      open_days: policy.open_days ?? [1, 2, 3, 4],
      open_time: policy.open_time ?? '07:00',
      close_time: policy.close_time ?? '17:00',
      advance_days: policy.advance_days,
      max_active_per_user: policy.max_active_per_user,
      max_hours_per_reservation: policy.max_hours_per_reservation,
      student_max_hours_per_day: policy.student_max_hours_per_day ?? 2,
      student_max_computers: policy.student_max_computers ?? 1,
      faculty_priority: policy.faculty_priority !== false,
    },
  });
});

/**
 * GET /api/reservations/schedule?date=YYYY-MM-DD
 *
 * Everything the laboratory schedule grid needs in one request: the list of
 * workstations and the day's active reservations. The grid itself is assembled
 * in the browser, which keeps this endpoint cheap and cacheable.
 */
export const getSchedule = asyncHandler(async (req, res) => {
  const date = req.query.date || todayISO();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw ApiError.badRequest('Provide a date as YYYY-MM-DD.');
  }

  const [{ data: computers, error: computerError }, { data: reservations, error: reservationError }] =
    await Promise.all([
      supabase
        .from(TABLES.computers)
        .select('id, name, computer_number, status, is_bookable, laboratory:laboratories ( id, name )')
        .order('computer_number', { ascending: true }),
      supabase
        .from(TABLES.reservations)
        .select(`
          id, computer_id, user_id, start_time, end_time, status, subject, purpose,
          user:users!reservations_user_id_fkey ( role, full_name ),
          computer:computers ( laboratory_id )
        `)
        .eq('reservation_date', date)
        .in('status', ACTIVE_STATES),
    ]);

  if (computerError || reservationError) throw ApiError.internal();

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
      reservations: (reservations ?? []).map((b) => {
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
 * POST /api/reservations/bulk
 *
 * Reserves several workstations for the same slot, for a class or group.
 * Every machine is validated first; only if all of them pass is anything
 * written, so the caller never ends up with a half-made reservation.
 */
export const createBulkReservation = asyncHandler(async (req, res) => {
  const { computer_ids, reservation_date, start_time, end_time, purpose, subject } = req.body;
  const unique = [...new Set(computer_ids)];

  const policy = await getSetting('reservation');

  // Students work on one machine; reserving a set of them is a faculty
  // action, for running a class.
  if (req.user.role === 'student') {
    const maxComputers = policy.student_max_computers ?? 1;
    if (unique.length > maxComputers) {
      throw ApiError.conflict(
        maxComputers === 1
          ? 'Students may reserve one computer at a time.'
          : `Students may reserve up to ${maxComputers} computers at a time.`
      );
    }
  }

  // The cap counts the whole request rather than each machine, and applies
  // to students only — faculty reserve whole rooms for classes.
  if (req.user.role === 'student') {
    const { count } = await supabase
      .from(TABLES.reservations)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.user.id)
      .in('status', ACTIVE_STATES)
      .gte('reservation_date', todayISO());

    if ((count ?? 0) + unique.length > policy.max_active_per_user) {
      throw ApiError.conflict(
        `You can hold ${policy.max_active_per_user} active reservations at a time. ` +
          `You already have ${count ?? 0}, so you can reserve ` +
          `${Math.max(0, policy.max_active_per_user - (count ?? 0))} more.`
      );
    }
  }

  // Validate every machine before writing any of them.
  const checked = [];
  for (const computer_id of unique) {
    const { computer } = await validateReservationRequest({
      user: req.user,
      payload: { computer_id, reservation_date, start_time, end_time },
      skipUserLimit: true,
      skipSelfOverlap: true,
    });
    checked.push(computer);
  }

  const status = resolveInitialStatus(req.user.role, policy);
  const now = new Date().toISOString();
  // One identity for the whole reservation, so 25 machines read as one
  // reservation in the administrator's list.
  const batchId = randomUUID();

  const { data, error } = await supabase
    .from(TABLES.reservations)
    .insert(
      unique.map((computer_id) => ({
        user_id: req.user.id,
        computer_id,
        batch_id: batchId,
        reservation_date,
        start_time,
        end_time,
        purpose,
        subject,
        status,
        approved_by: status === 'APPROVED' ? req.user.id : null,
        approved_at: status === 'APPROVED' ? now : null,
      }))
    )
    .select(RESERVATION_SELECT);

  if (error) throw ApiError.internal();

  const names = checked.map((c) => c.name).join(', ');

  await recordAudit(req, {
    action: 'reservation.create_bulk',
    entity: 'reservations',
    details: { count: unique.length, subject, computers: names },
  });
  publishReservationChange({ id: null, userId: req.user.id, status: status, action: 'create_bulk' });

  if (status === 'PENDING') {
    await notifyAdmins({
      title: 'New reservation request',
      message: `${req.user.full_name} requested ${unique.length} computer(s) on ${reservation_date} for ${subject}.`,
      type: 'reservation',
      link: '/admin/reservations',
    });
  }

  await notify(req.user.id, {
    title: status === 'APPROVED' ? 'Reservation confirmed' : 'Reservation submitted',
    message:
      status === 'APPROVED'
        ? `${names} reserved on ${reservation_date}.`
        : `Your request for ${names} is awaiting approval.`,
    type: 'reservation',
  });

  res.status(201).json({ success: true, data: (data ?? []).map(flatten) });
});


/**
 * GET /api/reservations/groups
 *
 * The administrator's list, with a multi-computer reservation shown as one
 * entry instead of thirty. Rows sharing a batch_id collapse into a group;
 * a single reservation is a group of one.
 *
 * Grouping happens here rather than in SQL because the shape the screen
 * needs — a parent row with its machines nested — is not a shape Postgres
 * returns cheaply. The query is bounded by status and date so the set being
 * grouped stays small.
 */
export const listReservationGroups = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, date_from, date_to, search } = req.query;

  let query = supabase.from(TABLES.reservations).select(RESERVATION_SELECT).limit(1000);

  if (status) query = query.eq('status', status);
  if (date_from) query = query.gte('reservation_date', date_from);
  if (date_to) query = query.lte('reservation_date', date_to);
  if (req.query.user_id) query = query.eq('user_id', req.query.user_id);
  if (req.query.subject) query = query.eq('subject', req.query.subject);
  if (search) {
    const term = `%${String(search).replace(/[%_]/g, '')}%`;
    query = query.or(`purpose.ilike.${term},subject.ilike.${term}`);
  }

  const { data, error } = await query
    .order('reservation_date', { ascending: false })
    .order('start_time', { ascending: true });

  if (error) throw ApiError.internal();

  const groups = new Map();

  for (const row of data ?? []) {
    const reservation = flatten(row);
    // A reservation with no batch is its own group, keyed by its own id.
    const key = reservation.batch_id ?? reservation.id;

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        batch_id: reservation.batch_id,
        // Kept so single reservations can still be acted on by id.
        id: reservation.id,
        user: reservation.user,
        reservation_date: reservation.reservation_date,
        start_time: reservation.start_time,
        end_time: reservation.end_time,
        subject: reservation.subject,
        purpose: reservation.purpose,
        created_at: reservation.created_at,
        decision_note: reservation.decision_note,
        computers: [],
        statuses: {},
      });
    }

    const group = groups.get(key);
    group.computers.push({
      reservation_id: reservation.id,
      computer: reservation.computer,
      status: reservation.status,
      checked_in_at: reservation.checked_in_at ?? null,
      receipt_no: reservation.receipt_no ?? null,
    });
    group.statuses[reservation.status] = (group.statuses[reservation.status] ?? 0) + 1;
  }

  const list = [...groups.values()].map((group) => {
    const states = Object.keys(group.statuses);
    return {
      ...group,
      count: group.computers.length,
      // A group is "mixed" when its machines are not all in the same state,
      // which happens once somebody cancels one seat of a class reservation.
      status: states.length === 1 ? states[0] : 'MIXED',
      pending_count: group.statuses.PENDING ?? 0,
      checked_in_count: group.computers.filter((c) => c.checked_in_at).length,
    };
  });

  const start = (Number(page) - 1) * Number(limit);
  const pageItems = list.slice(start, start + Number(limit));

  res.json({
    success: true,
    data: pageItems,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total: list.length,
      totalPages: Math.max(1, Math.ceil(list.length / Number(limit))),
      hasNext: start + Number(limit) < list.length,
      hasPrev: Number(page) > 1,
    },
  });
});

/**
 * PATCH /api/reservations/batch/:batchId/:decision
 *
 * Decides a whole class reservation at once. Each machine is still checked
 * individually — another reservation may have taken one of them while this sat
 * in the queue — so the reply says exactly how many went through.
 */
export const decideBatch = asyncHandler(async (req, res) => {
  const { batchId, decision } = req.params;
  if (!['approve', 'reject', 'cancel'].includes(decision)) {
    throw ApiError.badRequest('That is not a decision this system can make.');
  }

  const allowed = decision === 'cancel' ? ACTIVE_STATES : ['PENDING'];

  const { data: rows, error } = await supabase
    .from(TABLES.reservations)
    .select(RESERVATION_SELECT)
    .eq('batch_id', batchId)
    .in('status', allowed);

  if (error) throw ApiError.internal();
  if (!rows?.length) {
    throw ApiError.conflict('There is nothing left to decide in that reservation.');
  }

  const reservations = rows.map(flatten);
  const now = new Date().toISOString();
  const note = req.body?.note || null;

  let done = 0;
  const skipped = [];

  for (const reservation of reservations) {
    if (decision === 'approve') {
      // Re-check the slot: a machine may have been taken since the request.
      try {
        await validateReservationRequest({
          user: { id: reservation.user_id, role: 'admin' },
          payload: {
            computer_id: reservation.computer_id,
            reservation_date: reservation.reservation_date,
            start_time: reservation.start_time,
            end_time: reservation.end_time,
          },
          excludeReservationId: reservation.id,
          skipUserLimit: true,
          skipSelfOverlap: true,
        });
      } catch (conflict) {
        skipped.push({ computer: reservation.computer?.name, reason: conflict.message });
        continue;
      }
    }

    const patch =
      decision === 'cancel'
        ? { status: 'CANCELLED', cancelled_at: now }
        : {
            status: decision === 'approve' ? 'APPROVED' : 'REJECTED',
            approved_by: req.user.id,
            approved_at: now,
            decision_note: note,
          };

    const { data: updated } = await supabase
      .from(TABLES.reservations)
      .update(patch)
      .eq('id', reservation.id)
      .in('status', allowed)
      .select('id')
      .maybeSingle();

    if (updated) done += 1;
  }

  const first = reservations[0];

  await recordAudit(req, {
    action: `reservation.batch_${decision}`,
    entity: 'reservations',
    entityId: batchId,
    details: { count: done, skipped: skipped.length, subject: first.subject },
  });

  if (done > 0) {
    const verb =
      decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'cancelled';
    await notify(first.user_id, {
      title: `Reservation ${verb}`,
      message:
        `${done} computer${done === 1 ? '' : 's'} ${verb} for ${first.subject} on ` +
        `${first.reservation_date} at ${first.start_time.slice(0, 5)}.` +
        (note ? ` Note: ${note}` : ''),
      type: decision === 'approve' ? 'success' : 'warning',
    });
  }

  res.json({
    success: true,
    message:
      skipped.length === 0
        ? `${done} computer${done === 1 ? '' : 's'} ${decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'cancelled'}.`
        : `${done} done, ${skipped.length} could not be: ${skipped[0].reason}`,
    data: { done, skipped },
  });
});

/** GET /api/reservations/availability?computer_id=&date= — slots already taken. */
export const getAvailability = asyncHandler(async (req, res) => {
  const { computer_id, date } = req.query;
  if (!computer_id || !date) {
    throw ApiError.badRequest('Provide computer_id and date.');
  }

  const { data, error } = await supabase
    .from(TABLES.reservations)
    .select('id, start_time, end_time, status')
    .eq('computer_id', computer_id)
    .eq('reservation_date', date)
    .in('status', ACTIVE_STATES)
    .order('start_time');

  if (error) throw ApiError.internal();

  res.json({ success: true, data: data ?? [] });
});
