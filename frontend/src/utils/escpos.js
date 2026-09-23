import { receiptToText, receiptToEscPos } from './receiptText.js';

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
