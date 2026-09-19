import { supabase, TABLES } from '../config/database.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import env from '../config/env.js';

const MONITOR_SELECT = `
  id, computer_number, name, ip_address, operating_system, status, last_seen_at,
  laboratory:laboratories ( id, name ),
  current_user:users ( id, full_name, role ),
  telemetry:computer_status ( cpu_usage, ram_usage, disk_usage, temperature, uptime_seconds, is_online, heartbeat_at )
`;

function shape(row, cutoffMs) {
  const telemetry = Array.isArray(row.telemetry) ? row.telemetry[0] : row.telemetry;
  const heartbeat = telemetry?.heartbeat_at ? new Date(telemetry.heartbeat_at).getTime() : 0;
  const online = Boolean(telemetry?.is_online) && heartbeat >= cutoffMs;

  return {
    id: row.id,
    computer_number: row.computer_number,
    name: row.name,
    ip_address: row.ip_address,
    operating_system: row.operating_system,
    status: online ? row.status : 'OFFLINE',
    laboratory: Array.isArray(row.laboratory) ? row.laboratory[0] : row.laboratory,
    current_user: Array.isArray(row.current_user) ? row.current_user[0] : row.current_user,
    last_seen_at: telemetry?.heartbeat_at ?? row.last_seen_at,
    is_online: online,
    cpu_usage: Number(telemetry?.cpu_usage ?? 0),
    ram_usage: Number(telemetry?.ram_usage ?? 0),
    disk_usage: Number(telemetry?.disk_usage ?? 0),
    temperature: Number(telemetry?.temperature ?? 0),
    uptime_seconds: Number(telemetry?.uptime_seconds ?? 0),
  };
}

/** GET /api/monitoring — live telemetry for every computer (admin only). */
export const listMonitoring = asyncHandler(async (_req, res) => {
  const cutoffMs = Date.now() - env.offlineAfterSeconds * 1000;

  const { data, error } = await supabase
    .from(TABLES.computers)
    .select(MONITOR_SELECT)
    .order('computer_number', { ascending: true });

  if (error) throw ApiError.internal();

  const computers = (data ?? []).map((row) => shape(row, cutoffMs));
  const online = computers.filter((c) => c.is_online);

  const average = (key) =>
    online.length ? Number((online.reduce((sum, c) => sum + c[key], 0) / online.length).toFixed(1)) : 0;

  res.json({
    success: true,
    data: {
      computers,
      summary: {
        total: computers.length,
        online: online.length,
        offline: computers.length - online.length,
        avg_cpu: average('cpu_usage'),
        avg_ram: average('ram_usage'),
        avg_temperature: average('temperature'),
        hot_count: online.filter((c) => c.temperature >= 75).length,
      },
    },
  });
});

/** GET /api/monitoring/:computerId — detail plus a short telemetry history. */
export const getMonitoring = asyncHandler(async (req, res) => {
  const cutoffMs = Date.now() - env.offlineAfterSeconds * 1000;

  const { data, error } = await supabase
    .from(TABLES.computers)
    .select(MONITOR_SELECT)
    .eq('id', req.params.computerId)
    .maybeSingle();

  if (error) throw ApiError.internal();
  if (!data) throw ApiError.notFound('That computer could not be found.');

  // Energy readings double as the telemetry timeline for power and temp.
  const { data: history } = await supabase
    .from(TABLES.energyReadings)
    .select('power_watt, temperature, recorded_at')
    .eq('computer_id', req.params.computerId)
    .order('recorded_at', { ascending: false })
    .limit(60);

  res.json({
    success: true,
    data: { ...shape(data, cutoffMs), history: (history ?? []).reverse() },
  });
});

/**
 * POST /api/monitoring/heartbeat
 *
 * Called by the agent on each laboratory PC, authenticated with the shared
 * agent key rather than a user session. Upserts the telemetry snapshot and
 * optionally appends an energy reading in the same request, so a 30-machine
 * lab costs two writes per machine per interval instead of constant polling
 * from the browser.
 */
export const heartbeat = asyncHandler(async (req, res) => {
  const body = req.body;

  let computerQuery = supabase.from(TABLES.computers).select('id, status');
  if (body.computer_id) computerQuery = computerQuery.eq('id', body.computer_id);
  else if (body.ip_address) computerQuery = computerQuery.eq('ip_address', body.ip_address);
  else computerQuery = computerQuery.eq('name', body.name);

  const { data: computer, error: findError } = await computerQuery.maybeSingle();
  if (findError) throw ApiError.internal();
  if (!computer) throw ApiError.notFound('This machine is not registered in SMARTLAB.');

  const now = new Date().toISOString();

  const { error: statusError } = await supabase.from(TABLES.computerStatus).upsert(
    {
      computer_id: computer.id,
      cpu_usage: body.cpu_usage,
      ram_usage: body.ram_usage,
      disk_usage: body.disk_usage,
      temperature: body.temperature,
      uptime_seconds: body.uptime_seconds,
      is_online: true,
      heartbeat_at: now,
      updated_at: now,
    },
    { onConflict: 'computer_id' }
  );

  if (statusError) throw ApiError.internal();

  await supabase.from(TABLES.computers).update({ last_seen_at: now }).eq('id', computer.id);

  // A machine previously marked OFFLINE comes back as AVAILABLE; an admin
  // setting of MAINTENANCE is never overridden by an agent.
  if (computer.status === 'OFFLINE') {
    await supabase.from(TABLES.computers).update({ status: 'AVAILABLE' }).eq('id', computer.id);
  }

  if (body.power_watt !== undefined) {
    const voltage = body.voltage ?? 220;
    await supabase.from(TABLES.energyReadings).insert({
      computer_id: computer.id,
      voltage,
      current_amp: body.current_amp ?? Number((body.power_watt / voltage).toFixed(3)),
      power_watt: body.power_watt,
      // One reading per minute of runtime: watts -> kWh for that minute.
      energy_kwh: Number((body.power_watt / 1000 / 60).toFixed(5)),
      temperature: body.temperature,
      recorded_at: now,
    });
  }

  res.json({ success: true, data: { computer_id: computer.id, received_at: now } });
});

/**
 * Marks computers whose agent has gone quiet as OFFLINE.
 * Called on a timer from server.js.
 */
export async function markStaleComputersOffline() {
  const cutoff = new Date(Date.now() - env.offlineAfterSeconds * 1000).toISOString();

  const { data: stale, error } = await supabase
    .from(TABLES.computerStatus)
    .select('computer_id')
    .eq('is_online', true)
    .lt('heartbeat_at', cutoff);

  if (error || !stale?.length) return;

  const ids = stale.map((row) => row.computer_id);

  await supabase.from(TABLES.computerStatus).update({ is_online: false }).in('computer_id', ids);
  await supabase
    .from(TABLES.computers)
    .update({ status: 'OFFLINE', current_user_id: null })
    .in('id', ids)
    .neq('status', 'MAINTENANCE');
}
