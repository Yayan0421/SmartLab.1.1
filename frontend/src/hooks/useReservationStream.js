import { useEffect, useRef } from 'react';
import api, { tokenStore } from '../services/api.js';

/**
 * Calls `onChange` whenever a reservation changes anywhere the signed-in
 * user is allowed to hear about.
 *
 * This is a fetch stream rather than an EventSource. EventSource cannot
 * set request headers, and the API authenticates with a bearer token, so
 * the alternative would be putting the token in the query string - where
 * it lands in proxy logs and Referer headers. Reading the body as a stream
 * costs about thirty lines and keeps the token in the header where it
 * belongs.
 *
 * The server filters by role, so a student is only told about their own
 * reservations. The event carries an id and a status and nothing else:
 * the caller refetches through the ordinary endpoints, which re-check
 * permission. That keeps this from becoming a second way to read data.
 */
export default function useReservationStream(onChange, { enabled = true } = {}) {
  const saved = useRef(onChange);
  saved.current = onChange;

  useEffect(() => {
    if (!enabled) return undefined;

    const token = tokenStore.get();
    if (!token) return undefined;

    const controller = new AbortController();
    let retry;
    let stopped = false;

    // Each attempt waits longer than the last, so a server that is down -
    // or a free instance that is asleep - is not hammered by every open
    // tab at once.
    let attempt = 0;

    async function connect() {
      try {
        const res = await fetch(`${api.defaults.baseURL}/reservations/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (!res.ok || !res.body) throw new Error(`stream refused (${res.status})`);

        attempt = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Frames are separated by a blank line. Anything after the last
          // one is a partial frame and waits for the next chunk.
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            let event = 'message';
            const data = [];

            for (const line of frame.split('\n')) {
              // A line starting with ':' is a keep-alive comment.
              if (line.startsWith(':')) continue;
              if (line.startsWith('event:')) event = line.slice(6).trim();
              else if (line.startsWith('data:')) data.push(line.slice(5).trim());
            }

            if (event !== 'reservation' || data.length === 0) continue;

            try {
              saved.current?.(JSON.parse(data.join('\n')));
            } catch {
              // A frame we cannot read is not worth dropping the
              // connection over.
            }
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
      }

      if (stopped || controller.signal.aborted) return;
      attempt += 1;
      retry = setTimeout(connect, Math.min(30_000, 2_000 * attempt));
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(retry);
      controller.abort();
    };
  }, [enabled]);
}
