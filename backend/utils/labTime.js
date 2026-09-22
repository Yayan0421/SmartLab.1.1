import env from '../config/env.js';

/**
 * Dates and times in the laboratory's own timezone.
 *
 * Everything a booking means is local: "today", "09:00", "30 minutes late".
 * Computing those from UTC breaks for any country that is not on it — in
 * Manila (UTC+8) the server would still call it yesterday until 08:00 local,
 * which is inside laboratory hours, so the first hour of every day would
 * reject check-ins as "not for today".
 *
 * Set LAB_TIMEZONE to an IANA name such as Asia/Manila.
 */
const ZONE = env.labTimezone;

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** Today in the laboratory, as YYYY-MM-DD. */
export function labToday(date = new Date()) {
  // en-CA formats as YYYY-MM-DD, which is what Postgres `date` expects.
  return dateFormatter.format(date);
}

/** The date this many days from today, as YYYY-MM-DD. */
export function labDateOffset(days, from = new Date()) {
  return labToday(new Date(from.getTime() + days * 86_400_000));
}

/** The laboratory clock as HH:MM:SS, for comparing against a `time` column. */
export function labClock(date = new Date()) {
  return timeFormatter.format(date);
}

/** Minutes since local midnight. */
export function labMinutes(date = new Date()) {
  const [h, m] = labClock(date).split(':').map(Number);
  return h * 60 + m;
}

/** Local weekday, 0 = Sunday, matching JavaScript's own numbering. */
export function labWeekday(dateStr) {
  // A YYYY-MM-DD string has no timezone, so read it as a plain calendar
  // date rather than letting it be parsed as UTC midnight.
  const [y, m, d] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Whole days between today and a YYYY-MM-DD date, in laboratory time. */
export function labDaysAhead(dateStr) {
  const toUtcMidnight = (value) => {
    const [y, m, d] = String(value).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtcMidnight(dateStr) - toUtcMidnight(labToday())) / 86_400_000);
}

export { ZONE as LAB_TIMEZONE };
