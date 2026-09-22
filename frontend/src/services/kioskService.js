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
const KIOSK_KEY = import.meta.env.VITE_KIOSK_KEY || '';

const kiosk = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json', 'x-kiosk-key': KIOSK_KEY },
  timeout: 15000,
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
};

export default kioskService;
