#!/usr/bin/env node
/**
 * SMARTLAB workstation agent
 * =========================================================================
 * Runs on each laboratory PC. A browser cannot reach into a computer, so
 * this small program is what makes monitoring and remote control possible:
 *
 *   - reports CPU, RAM and temperature (the heartbeat)
 *   - uploads a thumbnail of the desktop so staff can see the screen
 *   - polls for commands and carries them out: shut down, restart, lock,
 *     show a warning
 *
 * It only ever *asks* the server for work — the server never connects in —
 * so no inbound port needs opening on the workstation.
 *
 * Everything it does uses built-in Windows tooling through PowerShell, so
 * there is nothing to install beyond Node.js.
 *
 * Usage (on each workstation):
 *   set SMARTLAB_API=http://192.168.1.11:5000/api
 *   set SMARTLAB_AGENT_KEY=<the AGENT_API_KEY from the server .env>
 *   set SMARTLAB_COMPUTER=PC-01
 *   node agent.js
 * =========================================================================
 */
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const API = (process.env.SMARTLAB_API || 'http://localhost:5000/api').replace(/\/$/, '');
const AGENT_KEY = process.env.SMARTLAB_AGENT_KEY || '';
const COMPUTER_NAME = process.env.SMARTLAB_COMPUTER || os.hostname();

const HEARTBEAT_MS = Number(process.env.SMARTLAB_HEARTBEAT_MS || 15_000);
const SCREEN_MS = Number(process.env.SMARTLAB_SCREEN_MS || 10_000);
const POLL_MS = Number(process.env.SMARTLAB_POLL_MS || 3_000);
const SCREEN_WIDTH = Number(process.env.SMARTLAB_SCREEN_WIDTH || 480);

const isWindows = process.platform === 'win32';
let computerId = null;

const log = (...args) => console.log(`[${new Date().toLocaleTimeString()}]`, ...args);

// ---------------------------------------------------------------------
// Talking to the server
// ---------------------------------------------------------------------
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-agent-key': AGENT_KEY },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
  return json;
}

/** Runs a PowerShell snippet and returns its stdout. */
async function powershell(script) {
  if (!isWindows) throw new Error('This action needs Windows.');
  const { stdout } = await run(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { windowsHide: true, maxBuffer: 20 * 1024 * 1024 }
  );
  return stdout.trim();
}

// ---------------------------------------------------------------------
// What the machine is doing
// ---------------------------------------------------------------------
let lastCpu = os.cpus();

/** CPU busy percentage, measured between calls rather than since boot. */
function cpuUsage() {
  const current = os.cpus();
  let idle = 0;
  let total = 0;

  current.forEach((core, i) => {
    const before = lastCpu[i]?.times ?? core.times;
    const deltaIdle = core.times.idle - before.idle;
    const deltaTotal = Object.keys(core.times).reduce(
      (sum, key) => sum + (core.times[key] - before[key]),
      0
    );
    idle += deltaIdle;
    total += deltaTotal;
  });

  lastCpu = current;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (1 - idle / total) * 100));
}

const ramUsage = () => ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;

/** Disk usage of the system drive, best effort. */
async function diskUsage() {
  if (!isWindows) return 0;
  try {
    const out = await powershell(
      "$d = Get-PSDrive C; " +
        "if ($d.Used + $d.Free -gt 0) { [math]::Round(($d.Used / ($d.Used + $d.Free)) * 100, 1) } else { 0 }"
    );
    return Number(out) || 0;
  } catch {
    return 0;
  }
}

/**
 * CPU temperature, where the hardware exposes it. Many desktop machines do
 * not, so a failure here is normal and simply reports zero.
 */
async function temperature() {
  if (!isWindows) return 0;
  try {
    const out = await powershell(
      "try { $t = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop; " +
        "[math]::Round((($t | Select-Object -First 1).CurrentTemperature / 10) - 273.15, 1) } catch { 0 }"
    );
    const value = Number(out);
    return Number.isFinite(value) && value > 0 && value < 120 ? value : 0;
  } catch {
    return 0;
  }
}

/** Who is signed in at the machine. */
async function loggedInUser() {
  if (!isWindows) return os.userInfo().username;
  try {
    const out = await powershell(
      "(Get-CimInstance -ClassName Win32_ComputerSystem).UserName"
    );
    return out || os.userInfo().username;
  } catch {
    return os.userInfo().username;
  }
}

/** MAC address of the active adapter, so the server can wake this machine. */
function macAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (!address.internal && address.mac && address.mac !== '00:00:00:00:00:00') {
        return address.mac.toUpperCase();
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Registration: find this machine's id on the server
// ---------------------------------------------------------------------
async function register() {
  const res = await api('/monitoring/heartbeat', {
    method: 'POST',
    body: {
      name: COMPUTER_NAME,
      cpu_usage: 0,
      ram_usage: 0,
      disk_usage: 0,
      temperature: 0,
      uptime_seconds: Math.floor(os.uptime()),
    },
  });

  computerId = res.data.computer_id;
  log(`registered as ${COMPUTER_NAME} (${computerId})`);

  await api(`/control/agent/${computerId}/state`, {
    method: 'PATCH',
    body: { mac_address: macAddress(), logged_in_user: await loggedInUser(), is_locked: false },
  });
}

// ---------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------
async function heartbeat() {
  try {
    const cpu = cpuUsage();
    const [disk, temp] = await Promise.all([diskUsage(), temperature()]);

    await api('/monitoring/heartbeat', {
      method: 'POST',
      body: {
        computer_id: computerId,
        cpu_usage: Number(cpu.toFixed(2)),
        ram_usage: Number(ramUsage().toFixed(2)),
        disk_usage: disk,
        temperature: temp,
        uptime_seconds: Math.floor(os.uptime()),
        // Rough estimate: idle draw plus a load-dependent share.
        power_watt: Number((35 + cpu * 1.1).toFixed(2)),
      },
    });
  } catch (error) {
    log('heartbeat failed:', error.message);
  }
}

// ---------------------------------------------------------------------
// Screen capture
// ---------------------------------------------------------------------
/**
 * Captures the desktop and returns a small JPEG as a data URL.
 *
 * Uses .NET drawing through PowerShell rather than a native module, so the
 * agent stays dependency-free. The image is scaled down before encoding —
 * staff need to see what is on screen, not read it pixel for pixel, and a
 * thumbnail keeps 30 machines uploading without saturating the network.
 */
async function captureScreen() {
  const script = `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$full = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($full)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $full.Size)
$scale = ${SCREEN_WIDTH} / $b.Width
$w = [int]${SCREEN_WIDTH}
$h = [int]($b.Height * $scale)
$small = New-Object System.Drawing.Bitmap $w, $h
$gs = [System.Drawing.Graphics]::FromImage($small)
$gs.InterpolationMode = 'HighQualityBicubic'
$gs.DrawImage($full, 0, 0, $w, $h)
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, 55)
$ms = New-Object System.IO.MemoryStream
$small.Save($ms, $codec, $params)
[Convert]::ToBase64String($ms.ToArray())
$ms.Dispose(); $gs.Dispose(); $g.Dispose(); $small.Dispose(); $full.Dispose()
$b.Width
$b.Height
`;

  const out = await powershell(script);
  const lines = out.split(/\r?\n/).filter(Boolean);
  const base64 = lines[0];
  if (!base64 || base64.length < 100) throw new Error('capture produced no image');

  return {
    image: `data:image/jpeg;base64,${base64}`,
    width: Number(lines[1]) || null,
    height: Number(lines[2]) || null,
  };
}

async function uploadScreen() {
  if (!isWindows) return;
  try {
    const shot = await captureScreen();
    await api(`/control/agent/${computerId}/screen`, { method: 'POST', body: shot });
  } catch (error) {
    log('screen capture failed:', error.message);
  }
}

// ---------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------
async function runCommand(command) {
  const { id, action, payload } = command;
  log(`command: ${action}`);

  switch (action) {
    case 'shutdown':
      await powershell('shutdown /s /f /t 5 /c "SMARTLAB: this computer is shutting down."');
      return 'shutting down in 5 seconds';

    case 'restart':
      await powershell('shutdown /r /f /t 5 /c "SMARTLAB: this computer is restarting."');
      return 'restarting in 5 seconds';

    case 'lock':
      // Locking the session is the honest form of "freeze": the desktop is
      // inaccessible without a password, and nothing the student was doing
      // is lost.
      await powershell('rundll32.exe user32.dll,LockWorkStation');
      await api(`/control/agent/${computerId}/state`, {
        method: 'PATCH',
        body: { is_locked: true },
      });
      return 'workstation locked';

    case 'unlock':
      // A locked Windows session can only be opened by its owner; the agent
      // just records that staff released the hold.
      await api(`/control/agent/${computerId}/state`, {
        method: 'PATCH',
        body: { is_locked: false },
      });
      return 'lock released (the user signs in as normal)';

    case 'message': {
      const text = String(payload?.message ?? '').replace(/["`$]/g, '');
      const title = payload?.level === 'warning' ? 'SMARTLAB WARNING' : 'SMARTLAB';
      await powershell(
        `Add-Type -AssemblyName System.Windows.Forms; ` +
          `[System.Windows.Forms.MessageBox]::Show("${text}", "${title}", 'OK', ` +
          `'${payload?.level === 'warning' ? 'Warning' : 'Information'}')`
      );
      return 'message shown';
    }

    case 'screenshot':
      await uploadScreen();
      return 'screen captured';

    default:
      throw new Error(`unknown command: ${action}`);
  }
}

async function pollCommands() {
  if (!computerId) return;
  try {
    const res = await api(`/control/agent/${computerId}/commands`);
    for (const command of res.data ?? []) {
      try {
        const result = await runCommand(command);
        await api(`/control/agent/commands/${command.id}/result`, {
          method: 'POST',
          body: { ok: true, result },
        });
      } catch (error) {
        log(`command ${command.action} failed:`, error.message);
        await api(`/control/agent/commands/${command.id}/result`, {
          method: 'POST',
          body: { ok: false, result: error.message },
        });
      }
    }
  } catch (error) {
    log('poll failed:', error.message);
  }
}

// ---------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------
async function main() {
  console.log('\n  SMARTLAB workstation agent');
  console.log(`  server   : ${API}`);
  console.log(`  computer : ${COMPUTER_NAME}`);
  console.log(`  platform : ${process.platform}${isWindows ? '' : ' (screen capture and commands need Windows)'}\n`);

  if (!AGENT_KEY) {
    console.error('  SMARTLAB_AGENT_KEY is not set. Copy AGENT_API_KEY from the server .env.\n');
    process.exit(1);
  }

  // Keep retrying: a workstation often boots before the server is reachable.
  for (;;) {
    try {
      await register();
      break;
    } catch (error) {
      log('could not register:', error.message, '- retrying in 10s');
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }

  await heartbeat();
  await uploadScreen();

  setInterval(heartbeat, HEARTBEAT_MS);
  setInterval(uploadScreen, SCREEN_MS);
  setInterval(pollCommands, POLL_MS);

  log('running - press Ctrl+C to stop');
}

main();
