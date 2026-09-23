import { receiptToText } from './receiptText.js';

/**
 * The receipt as ESC/POS bytes, for printing over Bluetooth.
 *
 * This is the shortest path the hardware offers: the page speaks to the
 * printer itself, with no print service, no Android intent and no second
 * application in between. Every one of those was a place the job could
 * disappear without reporting anything.
 *
 * ESC/POS is the command language nearly every thermal printer speaks.
 * The layout is already solved by receiptToText — fixed-width text — so
 * all that is needed here is to frame it: initialise, send the lines,
 * feed the paper clear of the head, and cut.
 */

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

/** The same job as a hex string, which is what Fully's bridge takes. */
export function receiptToHex(receipt, width = 48, options) {
  return receiptToEscPos(receipt, width, options)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Prints over Fully Kiosk's Bluetooth bridge.
 *
 * The printer is addressed by name or MAC, both of which are properties
 * of the room rather than of the code, so they are configured on the
 * device and remembered — see kiosk `?bt=` and `?btmac=`.
 *
 * Returns a short description of what happened, because none of the
 * calls below report success and the only honest signal is how far the
 * sequence got.
 */
export function printViaFullyBluetooth(receipt, width = 48, target = {}) {
  const { name, mac } = target;

  if (!window.fully?.btSendHexData && !window.fully?.btSendStringData) {
    return 'no Bluetooth bridge on this device';
  }
  if (!name && !mac) {
    return 'no printer configured — open the kiosk once with ?bt=<name>';
  }

  try {
    // Opening an already-open connection is harmless; not opening one
    // that has dropped is not, so this happens on every job.
    if (mac && typeof window.fully.btOpenByMac === 'function') {
      window.fully.btOpenByMac(mac);
    } else if (name && typeof window.fully.btOpenByName === 'function') {
      window.fully.btOpenByName(name);
    }
  } catch (error) {
    return `btOpen failed: ${error.message}`;
  }

  // The printer needs a moment after the connection before it will
  // accept a job; sending into a half-open socket loses the first bytes,
  // which on ESC/POS means losing the initialise command.
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        if (typeof window.fully.btSendHexData === 'function') {
          window.fully.btSendHexData(receiptToHex(receipt, width));
          resolve('sent as hex');
        } else {
          // Plain text loses the cut and the feed, but a receipt with no
          // cut is better than no receipt.
          window.fully.btSendStringData(receiptToText(receipt, width) + '\n\n\n');
          resolve('sent as string (no cut)');
        }
      } catch (error) {
        resolve(`send failed: ${error.message}`);
      }
    }, 600);
  });
}

/** What the device can see, for setting the printer up. */
export function bluetoothDevices() {
  try {
    if (typeof window.fully?.btGetDeviceListJson !== 'function') {
      return 'no Bluetooth bridge on this device';
    }
    return window.fully.btGetDeviceListJson();
  } catch (error) {
    return `failed: ${error.message}`;
  }
}
