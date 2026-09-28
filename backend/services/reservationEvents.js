import { EventEmitter } from 'node:events';

/**
 * Tells connected browsers that a reservation changed.
 *
 * The obvious way to do this would be Supabase Realtime, straight from the
 * page. We deliberately cannot: RLS is enabled with no permissive policies
 * precisely so the anon key reads nothing from a browser, and opening that
 * up would mean writing the whole RBAC a second time as SQL policies. The
 * rules live in Express, so the live feed does too.
 *
 * This is an in-process bus. One Node process serves the laboratory, so
 * every subscriber is on the same instance as every publisher. Run the API
 * on more than one instance and a browser would only hear about changes
 * that happened to land on its own - at which point this wants Postgres
 * LISTEN/NOTIFY or Redis behind the same two functions.
 */
const bus = new EventEmitter();

// One listener per connected browser, and a laboratory can easily have
// thirty tabs open. The default ceiling of ten would warn long before
// anything is actually wrong.
bus.setMaxListeners(0);

/**
 * Announces a change. Deliberately forgiving: a live feed is a
 * convenience, and a failure here must never turn a successful approval
 * into an error for the administrator who made it.
 */
export function publishReservationChange({ id, userId, status, action }) {
  try {
    bus.emit('change', {
      id,
      user_id: userId ?? null,
      status: status ?? null,
      action,
      at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[reservation-events] could not publish:', error.message);
  }
}

/** Subscribes, and returns the function that unsubscribes. */
export function onReservationChange(listener) {
  bus.on('change', listener);
  return () => bus.off('change', listener);
}

export default { publishReservationChange, onReservationChange };
