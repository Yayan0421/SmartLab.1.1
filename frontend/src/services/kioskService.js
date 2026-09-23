import axios from 'axios';

const BASE_URL =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:5000/api`;

/**
 * The kiosk talks to the API as a device, not as a signed-in person, so it
 * carries its own key instead of a bearer token.
 *
 * That key must only ever be configured on the kiosk machine itself — it is
 * a shared secret for a device standing in a public room, which is why the
 * kiosk endpoints can do nothing except scan a card and start a session.
 */
const KEY_STORE = 'smartlab.kiosk.key';

/**
 * The kiosk's device key, which must never reach an ordinary visitor.
 *
 * A VITE_ variable is compiled into the bundle every browser downloads, so
 * setting the key that way publishes it: anyone who opened the site could
 * check bookings in and read cards. In a deployed build the variable is
 * left unset and the key is instead stored on the kiosk device itself,
 * put there once through /kiosk?key=… and kept in localStorage.
 *
 * The build-time variable is still honoured because it is convenient on a
 * closed laboratory network — but it is the fallback, not the source.
 */
function kioskKey() {
  try {
    const stored = window.localStorage.getItem(KEY_STORE);
    if (stored) return stored;
  } catch {
    // Storage blocked; fall through to the build-time value.
  }
  return import.meta.env.VITE_KIOSK_KEY || '';
}

/** Stores the key on this device. Called once, from the kiosk page. */
export function rememberKioskKey(key) {
  try {
    window.localStorage.setItem(KEY_STORE, key);
    return true;
  } catch {
    return false;
  }
}

const kiosk = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Read at request time: the key may be stored after the module loads.
kiosk.interceptors.request.use((config) => {
  config.headers['x-kiosk-key'] = kioskKey();
  return config;
});

kiosk.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (!error.response) {
      return Promise.reject(new Error('The laboratory server cannot be reached.'));
    }
    return Promise.reject(
      new Error(error.response.data?.message || 'Something went wrong. Please try again.')
    );
  }
);

export const kioskService = {
  scan: (code) => kiosk.post('/kiosk/scan', { code }),
  /**
   * Starts a session. Given a batch_id — a class booking across several
   * machines — the whole set is checked in together under one receipt.
   */
  checkIn: ({ booking_id, batch_id, photo } = {}) =>
    kiosk.post('/kiosk/check-in', { booking_id, batch_id, photo }),
  checkOut: (booking_id) => kiosk.post('/kiosk/check-out', { booking_id }),
  /**
   * Asks the server to print a receipt again on the network printer.
   * By number, so the second copy is read back from the database rather
   * than from whatever this device is holding.
   */
  print: (receipt_no) => kiosk.post('/kiosk/print', { receipt_no }),
};

export default kioskService;
