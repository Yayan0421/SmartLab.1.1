import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getSetting } from '../services/settingsService.js';
import env from '../config/env.js';
import { labToday } from '../utils/labTime.js';
import { ADMIN_LIKE } from '../utils/roles.js';

const todayISO = labToday;

/**
 * GET /api/dashboard/admin
 *
 * One request behind the whole admin landing page. Every figure is a
 * head:true COUNT — the rows themselves are never shipped to the browser,
 * which is what keeps this fast at 1,000+ users and thousands of reservations.
 */
export const adminDashboard = asyncHandler(async (_req, res) => {
  const today = todayISO();
  const offlineCutoff = new Date(Date.now() - env.offlineAfterSeconds * 1000).toISOString();
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const count = (table) => supabase.from(table).select('id', { count: 'exact', head: true });

  const [
    totalComputers,
    availableComputers,
    inUseComputers,
    maintenanceComputers,
    reservedComputers,
    onlineStatus,
    pendingReservations,
    todayReservations,
    totalUsers,
    activeUsers,
    students,
    faculty,
    admins,
  ] = await Promise.all([
    count(TABLES.computers),
    count(TABLES.computers).eq('status', 'AVAILABLE'),
    count(TABLES.computers).eq('status', 'IN_USE'),
    count(TABLES.computers).eq('status', 'MAINTENANCE'),
    count(TABLES.computers).eq('status', 'RESERVED'),
    count(TABLES.computerStatus).eq('is_online', true).gte('heartbeat_at', offlineCutoff),
    count(TABLES.reservations).eq('status', 'PENDING'),
    count(TABLES.reservations).eq('reservation_date', today),
    count(TABLES.users),
    count(TABLES.users).eq('status', 'active'),
    count(TABLES.users).eq('role', 'student'),
    count(TABLES.users).eq('role', 'faculty'),
    count(TABLES.users).in('role', ADMIN_LIKE),
  ]);

  const total = totalComputers.count ?? 0;
  const online = onlineStatus.count ?? 0;

  // Energy consumed today.
  const { data: todayEnergy } = await supabase
    .from(TABLES.energyReadings)
    .select('energy_kwh, recorded_at')
    .gte('recorded_at', dayStart.toISOString())
    .limit(20000);

  const energyToday = (todayEnergy ?? []).reduce((sum, r) => sum + (Number(r.energy_kwh) || 0), 0);
  const { rate_per_kwh, currency } = await getSetting('energy');

  // Seven-day reservation activity.
  const weekAgo = labToday(new Date(Date.now() - 6 * 86_400_000));
  const { data: weekReservations } = await supabase
    .from(TABLES.reservations)
    .select('reservation_date, status')
    .gte('reservation_date', weekAgo)
    .lte('reservation_date', today);

  const reservationSeries = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = labToday(new Date(Date.now() - i * 86_400_000));
    const rows = (weekReservations ?? []).filter((r) => r.reservation_date === day);
    reservationSeries.push({
      date: day,
      total: rows.length,
      approved: rows.filter((r) => ['APPROVED', 'COMPLETED'].includes(r.status)).length,
      pending: rows.filter((r) => r.status === 'PENDING').length,
      rejected: rows.filter((r) => ['REJECTED', 'CANCELLED', 'EXPIRED'].includes(r.status)).length,
    });
  }

  // Hourly energy for today, bucketed for the dashboard chart.
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    label: `${String(hour).padStart(2, '0')}:00`,
    energy_kwh: 0,
  }));

  for (const row of todayEnergy ?? []) {
    const hour = new Date(row.recorded_at).getHours();
    hourly[hour].energy_kwh += Number(row.energy_kwh) || 0;
  }
  for (const bucket of hourly) bucket.energy_kwh = Number(bucket.energy_kwh.toFixed(4));

  // Latest activity for the dashboard feed.
  const { data: recentReservations } = await supabase
    .from(TABLES.reservations)
    .select(`
      id, reservation_date, start_time, end_time, status, purpose, created_at,
      user:users!reservations_user_id_fkey ( id, full_name, role ),
      computer:computers ( id, name )
    `)
    .order('created_at', { ascending: false })
    .limit(8);

  res.json({
    success: true,
    data: {
      computers: {
        total,
        online,
        offline: Math.max(0, total - online),
        available: availableComputers.count ?? 0,
        in_use: inUseComputers.count ?? 0,
        maintenance: maintenanceComputers.count ?? 0,
        reserved: reservedComputers.count ?? 0,
        utilization: total ? Number((((inUseComputers.count ?? 0) / total) * 100).toFixed(1)) : 0,
      },
      reservations: {
        pending: pendingReservations.count ?? 0,
        today: todayReservations.count ?? 0,
        weekly: reservationSeries,
      },
      users: {
        total: totalUsers.count ?? 0,
        active: activeUsers.count ?? 0,
        students: students.count ?? 0,
        faculty: faculty.count ?? 0,
        admins: admins.count ?? 0,
      },
      energy: {
        today_kwh: Number(energyToday.toFixed(3)),
        today_cost: Number((energyToday * rate_per_kwh).toFixed(2)),
        currency,
        hourly,
      },
      recent_reservations: (recentReservations ?? []).map((row) => ({
        ...row,
        user: Array.isArray(row.user) ? row.user[0] : row.user,
        computer: Array.isArray(row.computer) ? row.computer[0] : row.computer,
      })),
    },
  });
});

/**
 * GET /api/dashboard/me
 * The faculty and student landing page: their counters plus what is free now.
 */
export const userDashboard = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const today = todayISO();

  const count = (table) => supabase.from(table).select('id', { count: 'exact', head: true });

  const [availableComputers, totalComputers, active, upcoming, completed, pending, unread] =
    await Promise.all([
      count(TABLES.computers).eq('status', 'AVAILABLE').eq('is_bookable', true),
      count(TABLES.computers),
      count(TABLES.reservations).eq('user_id', userId).in('status', ['PENDING', 'APPROVED']).gte('reservation_date', today),
      count(TABLES.reservations).eq('user_id', userId).eq('status', 'APPROVED').gt('reservation_date', today),
      count(TABLES.reservations).eq('user_id', userId).eq('status', 'COMPLETED'),
      count(TABLES.reservations).eq('user_id', userId).eq('status', 'PENDING'),
      count(TABLES.notifications).eq('user_id', userId).eq('is_read', false),
    ]);

  const { data: next } = await supabase
    .from(TABLES.reservations)
    .select(`
      id, reservation_date, start_time, end_time, status, purpose,
      computer:computers ( id, name, computer_number, laboratory:laboratories ( name ) )
    `)
    .eq('user_id', userId)
    .in('status', ['PENDING', 'APPROVED'])
    .gte('reservation_date', today)
    .order('reservation_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(5);

  const { data: notifications } = await supabase
    .from(TABLES.notifications)
    .select('id, title, message, type, is_read, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5);

  res.json({
    success: true,
    data: {
      available_computers: availableComputers.count ?? 0,
      total_computers: totalComputers.count ?? 0,
      active_reservations: active.count ?? 0,
      upcoming_reservations: upcoming.count ?? 0,
      completed_reservations: completed.count ?? 0,
      pending_reservations: pending.count ?? 0,
      unread_notifications: unread.count ?? 0,
      next_reservations: (next ?? []).map((row) => ({
        ...row,
        computer: Array.isArray(row.computer) ? row.computer[0] : row.computer,
      })),
      recent_notifications: notifications ?? [],
    },
  });
});
