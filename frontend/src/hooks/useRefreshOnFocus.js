import { useEffect, useRef } from 'react';

/**
 * Re-runs a fetch when the user comes back to the tab.
 *
 * Bookings change while a page sits open — an admin approves or rejects in
 * another tab — so returning to a stale list is the common case, not a rare
 * one. A short guard stops this firing repeatedly when someone alt-tabs
 * quickly.
 */
export default function useRefreshOnFocus(callback, { minIntervalMs = 5000 } = {}) {
  const saved = useRef(callback);
  saved.current = callback;
  const lastRun = useRef(Date.now());

  useEffect(() => {
    function maybeRefresh() {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRun.current < minIntervalMs) return;
      lastRun.current = Date.now();
      saved.current?.();
    }

    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [minIntervalMs]);
}
