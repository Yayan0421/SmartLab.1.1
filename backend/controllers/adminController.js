import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getPagination, paginated } from '../utils/pagination.js';
import { getAllSettings, updateSetting } from '../services/settingsService.js';
import { recordAudit } from '../services/auditService.js';

/** GET /api/admin/audit-logs */
export const listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, from, to } = getPagination(req.query);

  let query = supabase
    .from(TABLES.auditLogs)
    .select('id, actor_id, actor_email, action, entity, entity_id, details, ip_address, created_at', {
      count: 'exact',
    });

  if (req.query.action) query = query.eq('action', req.query.action);
  if (req.query.entity) query = query.eq('entity', req.query.entity);
  if (req.query.actor_id) query = query.eq('actor_id', req.query.actor_id);
  if (req.query.search) {
    const term = `%${String(req.query.search).replace(/[%_]/g, '')}%`;
    query = query.or(`actor_email.ilike.${term},action.ilike.${term},entity.ilike.${term}`);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw ApiError.internal();
  res.json({ success: true, ...paginated(data ?? [], count, { page, limit }) });
});

/** GET /api/admin/settings */
export const listSettings = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await getAllSettings() });
});

/** PATCH /api/admin/settings/:key */
export const patchSetting = asyncHandler(async (req, res) => {
  const allowed = ['booking', 'energy', 'general'];
  if (!allowed.includes(req.params.key)) {
    throw ApiError.badRequest('Unknown settings group.');
  }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    throw ApiError.badRequest('Provide the settings to update as an object.');
  }

  const data = await updateSetting(req.params.key, req.body);

  await recordAudit(req, {
    action: 'settings.update',
    entity: 'system_settings',
    entityId: req.params.key,
    details: req.body,
  });

  res.json({ success: true, data });
});

/** GET /api/admin/laboratories */
export const listLaboratories = asyncHandler(async (_req, res) => {
  const { data, error } = await supabase
    .from(TABLES.laboratories)
    .select('id, name, building, room_number, capacity, is_active, created_at')
    .order('name');

  if (error) throw ApiError.internal();

  const { data: computers } = await supabase.from(TABLES.computers).select('laboratory_id');
  const counts = new Map();
  for (const row of computers ?? []) {
    counts.set(row.laboratory_id, (counts.get(row.laboratory_id) ?? 0) + 1);
  }

  res.json({
    success: true,
    data: (data ?? []).map((lab) => ({ ...lab, computer_count: counts.get(lab.id) ?? 0 })),
  });
});

/** POST /api/admin/laboratories */
export const createLaboratory = asyncHandler(async (req, res) => {
  const { name, building, room_number, capacity } = req.body;
  if (!name || String(name).trim().length < 2) {
    throw ApiError.badRequest('Enter a laboratory name.');
  }

  const { data, error } = await supabase
    .from(TABLES.laboratories)
    .insert({
      name: String(name).trim(),
      building: building || null,
      room_number: room_number || null,
      capacity: Number(capacity) || 0,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw ApiError.conflict('A laboratory with that name already exists.');
    throw ApiError.internal();
  }

  await recordAudit(req, { action: 'laboratory.create', entity: 'laboratories', entityId: data.id });
  res.status(201).json({ success: true, data });
});

/**
 * GET /api/admin/reports
 * Aggregate report over a date window: booking outcomes, machine
 * utilisation and the most active users.
 */
export const reports = asyncHandler(async (req, res) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from =
    req.query.from || new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);

  const { data: bookings, error } = await supabase
    .from(TABLES.bookings)
    .select(`
      id, booking_date, start_time, end_time, status,
      user:users!bookings_user_id_fkey ( id, full_name, role ),
      computer:computers ( id, name, computer_number )
    `)
    .gte('booking_date', from)
    .lte('booking_date', to)
    .limit(20000);

  if (error) throw ApiError.internal();

  const rows = bookings ?? [];
  const pick = (row, key) => (Array.isArray(row[key]) ? row[key][0] : row[key]);

  const minutes = (start, end) => {
    const toMin = (t) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    return Math.max(0, toMin(end) - toMin(start));
  };

  const byStatus = {};
  const byComputer = new Map();
  const byUser = new Map();
  const byRole = { admin: 0, faculty: 0, student: 0 };

  for (const row of rows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

    const computer = pick(row, 'computer');
    if (computer) {
      const entry = byComputer.get(computer.id) || {
        id: computer.id,
        name: computer.name,
        bookings: 0,
        hours: 0,
      };
      entry.bookings += 1;
      entry.hours += minutes(row.start_time, row.end_time) / 60;
      byComputer.set(computer.id, entry);
    }

    const user = pick(row, 'user');
    if (user) {
      byRole[user.role] = (byRole[user.role] ?? 0) + 1;
      const entry = byUser.get(user.id) || {
        id: user.id,
        name: user.full_name,
        role: user.role,
        bookings: 0,
        hours: 0,
      };
      entry.bookings += 1;
      entry.hours += minutes(row.start_time, row.end_time) / 60;
      byUser.set(user.id, entry);
    }
  }

  const round = (list) =>
    list.map((entry) => ({ ...entry, hours: Number(entry.hours.toFixed(1)) }));

  const totalHours = [...byComputer.values()].reduce((sum, e) => sum + e.hours, 0);

  res.json({
    success: true,
    data: {
      range: { from, to },
      totals: {
        bookings: rows.length,
        hours: Number(totalHours.toFixed(1)),
        completed: byStatus.COMPLETED ?? 0,
        cancelled: (byStatus.CANCELLED ?? 0) + (byStatus.REJECTED ?? 0) + (byStatus.EXPIRED ?? 0),
      },
      by_status: byStatus,
      by_role: byRole,
      top_computers: round(
        [...byComputer.values()].sort((a, b) => b.bookings - a.bookings).slice(0, 10)
      ),
      top_users: round([...byUser.values()].sort((a, b) => b.bookings - a.bookings).slice(0, 10)),
    },
  });
});
