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

/** Bytes to base64, without assuming Buffer or a huge call stack. */
function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary);
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
    // An em dash or a curly quote would print as a random glyph, so the
    // nearest plain equivalent goes instead.
    else if (char === '—' || char === '–') out.push(0x2d);
    else if (char === '’' || char === '‘') out.push(0x27);
    else if (char === '“' || char === '”') out.push(0x22);
    else if (char === '·') out.push(0x2d);
    else out.push(0x3f); // '?' rather than nothing, so the loss is visible
  }
  return out;
}

/**
 * Builds the whole job.
 *
 * `cut` is optional because not every till printer has a cutter; on one
 * that does not, the command is ignored, and on one that does, paper
 * that has not been fed clear of the head gets cut through the last line.
 */
export function receiptToEscPos(receipt, width = 48, { cut = true } = {}) {
  const bytes = [
    ESC, 0x40,        // initialise: clears whatever the last job left set
    ESC, 0x61, 0x00,  // align left — the text is already centred by spaces
    ...toBytes(receiptToText(receipt, width)),
    0x0a, 0x0a, 0x0a, // feed the tear-off edge clear of the print head
  ];

  if (cut) bytes.push(GS, 0x56, 0x01); // partial cut, where supported

  return bytes;
}

/**
 * Hands the print URL to Android.
 *
 * Three routes, because the two browsers this runs in behave differently
 * and only one of them is Chrome.
 *
 * Fully Kiosk is a WebView. A WebView only offers its host application
 * the chance to intercept a *main-frame* navigation, so the hidden frame
 * below — which is what makes this work in Chrome — is never seen by
 * Fully at all, and the print silently does nothing. Fully instead
 * publishes a JavaScript bridge, and `fully.startIntent` is the direct
 * way to ask it to launch RawBT.
 *
 * Assigning window.location is the fallback inside Fully: an external
 * scheme does not actually navigate the page away, because Android hands
 * it to another application instead. In Chrome that same assignment is
 * unreliable — it needs a live user gesture, and the check-in request
 * outlives it — which is why the frame stays the route there.
 */
/**
 * Pulls the kiosk back in front after handing a job to another app.
 *
 * Launching RawBT puts RawBT on the screen, and it stays there: the
 * student sees a print service instead of their receipt, and the next
 * person finds a terminal that is not the kiosk. Fully can take the
 * foreground back, and should — the printer is a detail of the kiosk,
 * not a destination.
 *
 * The delay gives Android time to deliver the intent before the
 * foreground changes under it. Tried twice, because on a slow board the
 * first attempt can land before RawBT has even appeared.
 */
function comeBack() {
  const pull = () => {
    try {
      window.fully?.bringToForeground?.();
    } catch {
      /* nothing to be done if the bridge refuses */
    }
  };

  /**
   * Tried repeatedly for eight seconds, not once or twice.
   *
   * RawBT takes the screen to do its work and how long it holds it
   * depends on the printer, the paper and the size of the job — none of
   * which this page knows. A single attempt lands while RawBT is still
   * starting and is simply overridden; the terminal is then left showing
   * a print service to whoever walks up next.
   *
   * So it keeps asking until RawBT has finished and the ask sticks. The
   * cost of an unnecessary call is nothing; the cost of giving up too
   * early is a kiosk that is not on screen.
   */
  for (const delay of [600, 1200, 2000, 3000, 4500, 6000, 8000]) {
    setTimeout(pull, delay);
  }

  // And once more when the page is shown again, which is the moment the
  // other application actually let go.
  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      document.removeEventListener('visibilitychange', onVisible);
    }
  };
  document.addEventListener('visibilitychange', onVisible);
}

function handOff(url) {
  // 1. Fully Kiosk's own bridge, where it exists.
  try {
    if (typeof window.fully?.startIntent === 'function') {
      window.fully.startIntent(url);
      lastRoute = 'fully.startIntent';
      comeBack();
      return;
    }
  } catch (error) {
    lastRoute = `fully.startIntent threw: ${error.message}`;
  }

  /**
   * 2. Fully's other intent doors, in case startIntent is not the one.
   *
   * Deliberately NOT window.location here. Inside a WebView an unhandled
   * scheme does not quietly hand off — it navigates, and the kiosk ends
   * up on an error page with the session behind it. Losing the screen a
   * student is standing at is worse than not printing.
   */
  try {
    if (typeof window.fully?.broadcastIntent === 'function') {
      window.fully.broadcastIntent(url);
      lastRoute = 'fully.broadcastIntent';
      comeBack();
      return;
    }
  } catch (error) {
    lastRoute = `broadcastIntent threw: ${error.message}`;
  }

  // 3. Chrome, and a last resort inside Fully: a hidden frame. It needs
  //    no user gesture and, crucially, cannot navigate the page away.
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px';
  document.body.appendChild(frame);
  frame.src = url;
  // Long enough for Android to pick the intent up, short enough that a
  // day of check-ins does not leave a hundred frames behind.
  setTimeout(() => frame.remove(), 4000);
  lastRoute = 'hidden iframe';
}

/**
 * Which route the last print attempt took.
 *
 * None of these report success — Android takes the URL and says nothing
 * back — so the only honest diagnostic is which door the job went
 * through. When a kiosk prints in one browser and silently does nothing
 * in another, that is the single fact worth knowing.
 */
let lastRoute = 'none yet';

/** A snapshot of what this device offers, for the kiosk's ?debug=1 panel. */
export function printDiagnostics() {
  let fullyKeys = [];
  try {
    if (window.fully) fullyKeys = Object.keys(window.fully).slice(0, 40);
  } catch {
    /* the bridge may exist but refuse enumeration */
  }

  return {
    route: lastRoute,
    fullyPresent: Boolean(window.fully),
    startIntent: typeof window.fully?.startIntent,
    fullyApi: fullyKeys.join(', ') || '(none)',
    ua: navigator.userAgent,
  };
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
    /**
     * base64, which is what RawBT documents and expects.
     *
     * It was being sent URI-encoded plain text, which RawBT cannot
     * parse — so it opened, showed its own screen and printed nothing.
     * That looked like the hand-off failing when the hand-off was fine
     * and the payload was wrong.
     *
     * Carrying ESC/POS bytes rather than text also buys the paper feed
     * and the cut, which plain text has no way to ask for.
     */
    const payload = `base64,${bytesToBase64(receiptToEscPos(receipt, width))}`;

    /**
     * The action is the part that decides whether this prints.
     *
     * An intent URL naming only a package has no action, so Android
     * falls back to launching that application's main screen — RawBT
     * appears, sits there, and prints nothing. It looks like a hang and
     * is really a wrong request.
     *
     * VIEW on a rawbt: scheme is the same thing Chrome sends when it
     * follows the bare URL, which is why printing works there and not
     * here. Naming the package as well keeps Android from offering a
     * chooser.
     */
    const asIntent =
      `intent:${payload}#Intent;scheme=rawbt;action=android.intent.action.VIEW;` +
      `package=ru.a402d.rawbtprinter;end`;
    const asScheme = `rawbt:${payload}`;

    /**
     * Fully gets the intent: form, whatever the mode says.
     *
     * Its startIntent expects an Android intent URL. A bare custom
     * scheme is what Chrome wants, and handing that to startIntent is
     * asking it to parse something it was not built for — which fails
     * silently, because nothing in this chain reports back. The intent:
     * form also names RawBT's package outright, so Android has no
     * chooser to show and nothing to guess at.
     */
    const preferIntent = mode === 'intent' || Boolean(window.fully);

    handOff(preferIntent ? asIntent : asScheme);
    return true;
  } catch {
    return false;
  }
}
