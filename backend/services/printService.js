import net from 'node:net';
import env from '../config/env.js';
import { labFormat } from '../utils/labTime.js';

/**
 * Printing straight to a network thermal printer.
 *
 * A Wi-Fi or Ethernet receipt printer listens on TCP 9100 and prints
 * whatever ESC/POS it is sent. That makes the server the shortest path to
 * paper: no print service to install, no Android intent to be swallowed,
 * no browser to be launched with the right flag, and nothing that depends
 * on which device happened to check the student in.
 *
 * It is also the only route that reports back. A socket either connects
 * and accepts the bytes or it does not, so a failure is a logged error
 * rather than silence.
 *
 * Off unless PRINTER_HOST is set. A laboratory printing from the kiosk's
 * own browser should not suddenly get two receipts because the server
 * learned how to print.
 */

const ROLE_LABEL = { admin: 'Admin', faculty: 'Faculty', student: 'Student' };

/** "14:30:00" -> "2:30 PM" */
function clockTime(time) {
  if (!time) return '';
  const [h, m] = String(time).split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/** "2026-09-23" -> "Sep 23, 2026" */
function calendarDate(value) {
  if (!value) return '';
  const date = String(value).length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * The receipt as fixed-width text.
 *
 * Deliberately the same layout as the browser's version, built the same
 * way: a thermal printer has one font and a fixed number of characters per
 * line, so the layout is spaces rather than CSS. 58mm fits 32 characters,
 * 80mm fits 48.
 */
export function receiptToText(receipt, width = 32) {
  const lines = [];

  const centre = (text) => {
    const value = String(text ?? '');
    const pad = Math.max(0, Math.floor((width - value.length) / 2));
    return ' '.repeat(pad) + value;
  };

  /** Label left, value right, wrapping the value if the pair is too long. */
  const pair = (label, value) => {
    const v = String(value ?? '');
    if (!v) return;
    const gap = width - label.length - v.length;
    if (gap >= 1) lines.push(label + ' '.repeat(gap) + v);
    else {
      lines.push(label);
      lines.push(v.padStart(width));
    }
  };

  const rule = () => lines.push('-'.repeat(width));

  lines.push(centre('S M A R T L A B'));
  lines.push(centre('Smart Computer Laboratory'));
  if (receipt.laboratory) lines.push(centre(receipt.laboratory));
  if (receipt.room) lines.push(centre(`Room ${receipt.room}`));

  rule();
  lines.push(centre('SESSION RECEIPT'));
  lines.push(centre(receipt.number));
  rule();

  pair('Name', receipt.name);
  pair('ID No.', receipt.id_number);
  pair('Role', ROLE_LABEL[receipt.role] ?? receipt.role);
  pair('Program', receipt.program);
  pair('Course', receipt.course);

  rule();

  const machines = receipt.computers ?? (receipt.computer ? [receipt.computer] : []);

  if (machines.length > 1) {
    // A class booking: every machine named, wrapped across as many lines
    // as the roll needs. The list is the point of the ticket.
    lines.push(`Computers (${machines.length})`);
    let line = '';
    for (const value of machines) {
      const next = line ? `${line}, ${value}` : value;
      if (next.length > width - 2) {
        lines.push(`  ${line}`);
        line = value;
      } else {
        line = next;
      }
    }
    if (line) lines.push(`  ${line}`);
  } else {
    pair('Computer', machines[0]);
  }

  pair('Date', calendarDate(receipt.date));
  pair('Time', `${clockTime(receipt.start_time)} - ${clockTime(receipt.end_time)}`);
  pair('Subject', receipt.subject);
  pair('Purpose', receipt.purpose);

  rule();
  pair('Checked in', labFormat(receipt.issued_at, { hour: '2-digit', minute: '2-digit', hour12: true }));
  rule();

  lines.push(centre('Please keep this receipt.'));
  lines.push(
    centre(
      `Return by ${String(receipt.end_time ?? '').slice(0, 5)}.`
    )
  );
  lines.push('');
  lines.push(
    centre(
      labFormat(receipt.issued_at, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    )
  );

  return lines.join('\n');
}

const ESC = 0x1b;
const GS = 0x1d;

/** Printable ASCII only: a thermal printer has no font for the rest. */
function toBytes(text) {
  const out = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code === 0x0a) out.push(0x0a);
    else if (code >= 0x20 && code <= 0x7e) out.push(code);
    else if (char === '—' || char === '–') out.push(0x2d);
    else if (char === '’' || char === '‘') out.push(0x27);
    else if (char === '“' || char === '”') out.push(0x22);
    else if (char === '·') out.push(0x2d);
    else out.push(0x3f); // '?' rather than nothing, so the loss is visible
  }
  return out;
}

/** The whole job: initialise, the text, feed clear of the head, cut. */
export function receiptToEscPos(receipt, width = 32, { cut = true } = {}) {
  const bytes = [
    ESC, 0x40,       // initialise: clears whatever the last job left set
    ESC, 0x61, 0x00, // align left - the text is already centred by spaces
    ...toBytes(receiptToText(receipt, width)),
    0x0a, 0x0a, 0x0a, 0x0a,
  ];

  // Ignored by a printer with no cutter, so it is safe to always ask.
  if (cut) bytes.push(GS, 0x56, 0x01);

  return Buffer.from(bytes);
}

/** Whether this server has a printer to talk to at all. */
export function printerConfigured() {
  return Boolean(env.printerHost);
}

/**
 * Sends the bytes and waits for the socket to close.
 *
 * Resolves with a short description either way rather than throwing: a
 * printer that is off, out of paper or on a different subnet must never
 * stop a student being checked in. The receipt is a courtesy; the session
 * is the thing that matters.
 */
export function printReceipt(receipt, { width = env.printerWidth } = {}) {
  if (!printerConfigured()) {
    return Promise.resolve({ ok: false, detail: 'no PRINTER_HOST configured' });
  }

  const host = env.printerHost;
  const port = env.printerPort;
  const job = receiptToEscPos(receipt, width);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, detail });
    };

    /**
     * A short timeout on purpose.
     *
     * An unreachable address does not refuse a connection, it hangs until
     * the operating system gives up minutes later. Nobody at a kiosk waits
     * that long, and the check-in has already succeeded regardless.
     */
    const socket = net.createConnection({ host, port, timeout: 4000 });

    socket.on('connect', () => {
      socket.write(job, () => {
        // end() flushes, and 'close' is the printer having taken it all.
        socket.end();
      });
    });

    socket.on('close', () => finish(true, `${job.length} bytes to ${host}:${port}`));
    socket.on('timeout', () => finish(false, `${host}:${port} did not answer within 4s`));
    socket.on('error', (error) => finish(false, `${host}:${port} ${error.message}`));
  });
}

/**
 * Prints without making the caller wait or handle a failure.
 *
 * Used on the check-in path, which must answer the kiosk immediately: the
 * student is standing there, and the paper arrives a moment later.
 */
export function printReceiptInBackground(receipt) {
  if (!printerConfigured()) return;

  printReceipt(receipt)
    .then(({ ok, detail }) =>
      console.log(`[printer] ${ok ? 'printed' : 'FAILED'}: ${detail}`)
    )
    .catch((error) => console.error('[printer] unexpected:', error.message));
}
