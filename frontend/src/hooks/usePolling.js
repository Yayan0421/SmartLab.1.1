import { useEffect, useRef } from 'react';

/**
 * Calls `callback` on an interval, but only while the tab is visible.
 *
 * Monitoring and notifications refresh this way rather than with a blind
 * setInterval: a backgrounded tab stops requesting entirely, which keeps 30
 * open dashboards from hammering the API for no benefit.
 */
export default function usePolling(callback, intervalMs, enabled = true) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!enabled || !intervalMs) return undefined;

    let timer = null;

    const tick = () => {
      if (document.visibilityState === 'visible') saved.current();
    };

    const start = () => {
      stop();
      timer = setInterval(tick, intervalMs);
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        saved.current();
        start();
      } else {
        stop();
      }
    };

    start();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
