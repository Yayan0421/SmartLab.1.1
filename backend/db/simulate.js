/**
 * Monitoring agent simulator.
 *
 * Stands in for the agent that would run on each laboratory PC: posts a
 * heartbeat with CPU/RAM/temperature and a power sample to the API, for
 * every registered computer, on an interval.
 *
 *   npm run simulate
 *
 * A real agent does exactly this one request; nothing else about the
 * monitoring pipeline is simulator-specific.
 */
import { supabase, TABLES } from '../config/database.js';
import env from '../config/env.js';

const INTERVAL_MS = 15_000;
const API = `http://localhost:${env.port}/api/monitoring/heartbeat`;

const rand = (min, max) => Math.random() * (max - min) + min;

// Each machine keeps its own drifting load so the charts are not uniform.
const state = new Map();

function nextSample(id) {
  const prev = state.get(id) ?? { cpu: rand(10, 40), ram: rand(30, 60), temp: rand(40, 55) };
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  const next = {
    cpu: clamp(prev.cpu + rand(-12, 12), 2, 98),
    ram: clamp(prev.ram + rand(-6, 6), 20, 95),
    temp: clamp(prev.temp + rand(-3, 3), 34, 82),
  };
  state.set(id, next);
  return next;
}

async function tick(computers) {
  let ok = 0;
  let failed = 0;

  await Promise.all(
    computers.map(async (computer) => {
      const sample = nextSample(computer.id);
      // Power tracks CPU load, as it does on real hardware.
      const watts = 35 + sample.cpu * 1.1 + rand(-5, 5);

      try {
        const response = await fetch(API, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-agent-key': env.agentApiKey,
          },
          body: JSON.stringify({
            computer_id: computer.id,
            cpu_usage: Number(sample.cpu.toFixed(2)),
            ram_usage: Number(sample.ram.toFixed(2)),
            disk_usage: Number(rand(40, 75).toFixed(2)),
            temperature: Number(sample.temp.toFixed(2)),
            uptime_seconds: Math.floor(rand(3600, 200_000)),
            power_watt: Number(watts.toFixed(2)),
            voltage: Number(rand(218, 232).toFixed(2)),
          }),
        });
        if (response.ok) ok += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    })
  );

  console.log(`[${new Date().toLocaleTimeString()}] heartbeats sent: ${ok} ok, ${failed} failed`);
}

async function main() {
  if (!env.agentApiKey) {
    console.error('AGENT_API_KEY is not set in backend/.env — the API will reject heartbeats.');
    process.exit(1);
  }

  const { data: computers, error } = await supabase
    .from(TABLES.computers)
    .select('id, name, status')
    .neq('status', 'MAINTENANCE')
    .order('computer_number');

  if (error || !computers?.length) {
    console.error('No computers found. Run `npm run seed` first.');
    process.exit(1);
  }

  console.log(`\nSimulating ${computers.length} monitoring agents every ${INTERVAL_MS / 1000}s.`);
  console.log('Press Ctrl+C to stop.\n');

  await tick(computers);
  setInterval(() => tick(computers), INTERVAL_MS);
}

main();
