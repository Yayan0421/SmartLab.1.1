import { formatDate, formatTimeRange, ROLE_LABEL } from './format.js';
import { labFormat } from './labConstants.js';

/**
 * The receipt as plain text, for printing straight to a thermal printer.
 *
 * Print services such as RawBT accept a job through a URL scheme, which
 * skips Android's print dialog entirely — the difference between a kiosk
 * and a web page someone has to tap twice. They take text, not HTML, so
 * the layout is built with spaces at a fixed character width.
 *
 * 80mm paper fits 48 characters at the usual font; 58mm fits 32.
 */
export function receiptToText(receipt, width = 48) {
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
    if (gap >= 1) {
      lines.push(label + ' '.repeat(gap) + v);
    } else {
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

  /** Wraps a long list of machine names across as many lines as it needs. */
  const wrapped = (label, values) => {
    lines.push(`${label} (${values.length})`);
    let line = '';
    for (const value of values) {
      const next = line ? `${line}, ${value}` : value;
      if (next.length > width - 2) {
        lines.push(`  ${line}`);
        line = value;
      } else {
        line = next;
      }
    }
    if (line) lines.push(`  ${line}`);
  };

  const machines = receipt.computers ?? (receipt.computer ? [receipt.computer] : []);
  if (machines.length > 1) wrapped('Computers', machines);
  else pair('Computer', machines[0]);

  pair('Date', formatDate(receipt.date));
  pair('Time', formatTimeRange(receipt.start_time, receipt.end_time));
  pair('Subject', receipt.subject);
  pair('Purpose', receipt.purpose);

  rule();

  pair(
    'Checked in',
    labFormat(receipt.issued_at, { hour: '2-digit', minute: '2-digit', hour12: true })
  );

  rule();
  lines.push(centre('Please keep this receipt.'));
  lines.push(
    centre(
      `Return the ${machines.length > 1 ? 'workstations' : 'workstation'} by ${receipt.end_time?.slice(0, 5)}.`
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

  // Blank lines so the tear-off edge clears the print head.
  lines.push('', '', '');

  return lines.join('\n');
}

/**
 * Hands the URL to Android through a hidden frame.
 *
 * Assigning window.location would work only while the scan still counts as
 * a fresh user gesture, and the check-in request outlives that window — so
 * an automatic print was being blocked while the same URL printed fine from
 * a button. A frame also leaves the kiosk page loaded, which matters: the
 * page navigating away mid-session is what a kiosk must never do.
 */
function handOff(url) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px';
  document.body.appendChild(frame);
  frame.src = url;
  // Long enough for Android to pick the intent up, short enough that a
  // day of check-ins does not leave a hundred frames behind.
  setTimeout(() => frame.remove(), 4000);
}

/** How the job reaches RawBT. Two encodings, because devices differ. */
export const PRINT_MODES = ['rawbt', 'intent', 'browser'];

/**
 * Sends the receipt to the RawBT print service, which prints with no dialog.
 *
 * `mode` picks the encoding: 'rawbt' is the plain URL scheme, 'intent' is
 * the Android intent: form naming RawBT's package, which Chrome accepts in
 * some builds that ignore a bare custom scheme. Neither reports back, so
 * there is nothing to await and nothing to detect — if one does not print,
 * the other is the thing to try.
 *
 * Returns false only when the job could not be built, so the caller can
 * fall back to the browser rather than leave somebody with no receipt.
 */
export function printViaRawBT(receipt, width = 48, mode = 'rawbt') {
  try {
    const payload = encodeURIComponent(receiptToText(receipt, width));

    handOff(
      mode === 'intent'
        ? `intent:${payload}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end`
        : `rawbt:${payload}`
    );
    return true;
  } catch {
    return false;
  }
}
