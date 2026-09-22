import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getPagination, paginated } from '../utils/pagination.js';
import { recordAudit } from '../services/auditService.js';
import env from '../config/env.js';
import { labToday } from '../utils/labTime.js';

const COMPUTER_SELECT = `
  id, computer_number, name, laboratory_id, ip_address, operating_system, specs,
  status, is_bookable, current_user_id, last_seen_at, created_at, updated_at,
  laboratory:laboratories ( id, name, building, room_number ),
  telemetry:computer_status ( cpu_usage, ram_usage, disk_usage, temperature, is_online, heartbeat_at, uptime_seconds )
`;

/**
 * A heartbeat older than the offline threshold means the agent stopped
 * reporting, so the stored snapshot is presented as offline regardless of
 * what the last reading said.
 */
function decorate(computer) {
  const telemetry = Array.isArray(computer.telemetry) ? computer.telemetry[0] : computer.telemetry;
  const heartbeat = telemetry?.heartbeat_at ? new Date(telemetry.heartbeat_at) : null;
  const stale = !heartbeat || Date.now() - heartbeat.getTime() > env.offlineAfterSeconds * 1000;

  return {
    ...computer,
    laboratory: Array.isArray(computer.laboratory) ? computer.laboratory[0] : computer.laboratory,
    telemetry: telemetry
      ? { ...telemetry, is_online: telemetry.is_online && !stale }
      : { cpu_usage: 0, ram_usage: 0, disk_usage: 0, temperature: 0, is_online: false, heartbeat_at: null, uptime_seconds: 0 },
    is_online: telemetry ? telemetry.is_online && !stale : false,
  };
}

/** GET /api/computers — available to every signed-in role. */
export const listComputers = asyncHandler(async (req, res) => {
  const { page, limit, search, status, laboratory_id, bookable_only } = req.query;
  const { from, to } = getPagination({ page, limit });

  let query = supabase.from(TABLES.computers).select(COMPUTER_SELECT, { count: 'exact' });

  if (status) query = query.eq('status', status);
  if (laboratory_id) query = query.eq('laboratory_id', laboratory_id);
  if (bookable_only) query = query.eq('is_bookable', true);
  if (search) {
    const term = `%${search.replace(/[%_]/g, '')}%`;
    query = query.or(`name.ilike.${term},ip_address.ilike.${term}`);
  }

  const { data, count, error } = await query
    .order('computer_number', { ascending: true })
    .range(from, to);

  if (error) throw ApiError.internal();

  res.json({ success: true, ...paginated(data.map(decorate), count, { page, limit }) });
});

/** GET /api/computers/stats */
export const computerStats = asyncHandler(async (_req, res) => {
  const states = ['AVAILABLE', 'IN_USE', 'OFFLINE', 'MAINTENANCE', 'RESERVED'];

  const [total, ...byState] = await Promise.all([
    supabase.from(TABLES.computers).select('id', { count: 'exact', head: true }),
    ...states.map((state) =>
      supabase.from(TABLES.computers).select('id', { count: 'exact', head: true }).eq('status', state)
    ),
  ]);

  const cutoff = new Date(Date.now() - env.offlineAfterSeconds * 1000).toISOString();
  const { count: online } = await supabase
    .from(TABLES.computerStatus)
    .select('id', { count: 'exact', head: true })
    .eq('is_online', true)
    .gte('heartbeat_at', cutoff);

  const counts = Object.fromEntries(states.map((state, i) => [state, byState[i].count ?? 0]));

  res.json({
    success: true,
    data: {
      total: total.count ?? 0,
      online: online ?? 0,
      offline: (total.count ?? 0) - (online ?? 0),
      available: counts.AVAILABLE,
      in_use: counts.IN_USE,
      maintenance: counts.MAINTENANCE,
      reserved: counts.RESERVED,
      by_status: counts,
    },
  });
});

/** GET /api/computers/:id */
export const getComputer = asyncHandler(async (req, res) => {
  const { data, error } = await supabase
    .from(TABLES.computers)
    .select(COMPUTER_SELECT)
    .eq('id', req.params.id)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound('That computer could not be found.');

  const today = labToday();
  const { data: bookings } = await supabase
    .from(TABLES.bookings)
    .select('id, booking_date, start_time, end_time, status, purpose, user:users ( id, full_name, role )')
    .eq('computer_id', data.id)
    .gte('booking_date', today)
    .in('status', ['PENDING', 'APPROVED'])
    .order('booking_date', { ascending: true })
    .limit(10);

  res.json({ success: true, data: { ...decorate(data), upcoming_bookings: bookings ?? [] } });
});

/** POST /api/computers — admin only. */
export const createComputer = asyncHandler(async (req, res) => {
  const payload = {
    ...req.body,
    ip_address: req.body.ip_address || null,
    operating_system: req.body.operating_system || null,
    specs: req.body.specs || null,
  };

  const { data, error } = await supabase
    .from(TABLES.computers)
    .insert(payload)
    .select(COMPUTER_SELECT)
    .single();

  if (error) {
    if (error.code === '23505') {
      throw ApiError.conflict('That computer number is already used in this laboratory.');
    }
    throw ApiError.internal();
  }

  // Give every computer a telemetry row so monitoring joins always resolve.
  await supabase.from(TABLES.computerStatus).insert({ computer_id: data.id, is_online: false });

  await recordAudit(req, { action: 'computer.create', entity: 'computers', entityId: data.id });
  res.status(201).json({ success: true, data: decorate(data) });
});

/** PATCH /api/computers/:id — admin only. */
export const updateComputer = asyncHandler(async (req, res) => {
  const patch = { ...req.body };
  for (const key of ['ip_address', 'operating_system', 'specs']) {
    if (patch[key] === '') patch[key] = null;
  }

  const { data, error } = await supabase
    .from(TABLES.computers)
    .update(patch)
    .eq('id', req.params.id)
    .select(COMPUTER_SELECT)
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      throw ApiError.conflict('That computer number is already used in this laboratory.');
    }
    throw ApiError.internal();
  }
  if (!data) throw ApiError.notFound('That computer could not be found.');

  await recordAudit(req, {
    action: 'computer.update',
    entity: 'computers',
    entityId: data.id,
    details: patch,
  });

  res.json({ success: true, data: decorate(data) });
});

/** DELETE /api/computers/:id — blocked while bookings are still active. */
export const deleteComputer = asyncHandler(async (req, res) => {
  const id = req.params.id;

  const { count } = await supabase
    .from(TABLES.bookings)
    .select('id', { count: 'exact', head: true })
    .eq('computer_id', id)
    .in('status', ['PENDING', 'APPROVED']);

  if ((count ?? 0) > 0) {
    throw ApiError.conflict(
      'This computer has active bookings. Cancel them first, or set the computer to maintenance instead.'
    );
  }

  const { error } = await supabase.from(TABLES.computers).delete().eq('id', id);
  if (error) throw ApiError.internal();

  await recordAudit(req, { action: 'computer.delete', entity: 'computers', entityId: id });
  res.json({ success: true, message: 'Computer removed.' });
});

/** GET /api/computers/laboratories — lab list for filters and forms. */
export const listLaboratories = asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from(TABLES.laboratories)
    .select('id, name, building, room_number, capacity, is_active')
    .order('name');

  if (error) throw ApiError.internal();
  res.json({ success: true, data });
});

export { COMPUTER_SELECT, decorate };
