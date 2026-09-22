/**
 * Laboratory-specific option lists shared by the booking screens.
 * Kept in one place so the booking form, the schedule and the admin
 * filters always offer exactly the same values.
 */

/** Subjects taught in the computer laboratory. */
export const LAB_SUBJECTS = [
  'Computer Programming 1',
  'Computer Programming 2',
  'Data Structures and Algorithms',
  'Object-Oriented Programming',
  'Database Management Systems',
  'Web Systems and Technologies',
  'Networking and Data Communications',
  'Operating Systems',
  'Software Engineering',
  'Information Assurance and Security',
  'Computer Systems Servicing',
  'Digital Logic Design',
  'Multimedia and Graphics',
  'Capstone Project / Thesis',
];

/** Why the workstation is needed — the reference's "Purpose" dropdown. */
export const BOOKING_PURPOSES = [
  'Laboratory exercise',
  'Hands-on activity',
  'Machine problem',
  'Thesis / capstone work',
  'Research and data analysis',
  'Programming practice',
  'Group project',
  'Examination / practical exam',
  'Make-up laboratory class',
];

/**
 * Engineering programmes served by the laboratory, and the degree and year
 * level under each. The course list depends on the programme, so the two
 * dropdowns stay consistent: you cannot end up a Civil Engineering student
 * enrolled in BSCpE.
 */
export const PROGRAMS = [
  'Computer Engineering',
  'Civil Engineering',
  'Electrical Engineering',
];

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year'];

const DEGREE_OF = {
  'Computer Engineering': 'BSCpE',
  'Civil Engineering': 'BSCE',
  'Electrical Engineering': 'BSEE',
};

export const COURSES_BY_PROGRAM = Object.fromEntries(
  PROGRAMS.map((program) => [program, YEARS.map((year) => `${DEGREE_OF[program]} - ${year}`)])
);

/** The courses available for a programme, or an empty list if none is chosen. */
export function coursesFor(program) {
  return COURSES_BY_PROGRAM[program] ?? [];
}

/**
 * The laboratory's timezone.
 *
 * A kiosk terminal is often set to whatever timezone it shipped with, and
 * nobody thinks to change it. Times printed on a receipt or shown on the
 * kiosk clock must be the laboratory's, not the device's — otherwise a
 * receipt says a student arrived at 8am when they arrived at 9pm.
 *
 * Keep this matching LAB_TIMEZONE in the backend .env.
 */
export const LAB_TIMEZONE = 'Asia/Manila';

/** Formats a date in laboratory time, whatever the device is set to. */
export function labFormat(value, options) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: LAB_TIMEZONE, ...options }).format(date);
}

export const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

/** The opening rule used until the server's policy arrives. */
export const DEFAULT_POLICY = {
  open_days: [1, 2, 3, 4], // Monday to Thursday
  open_time: '07:00',
  close_time: '17:00',
  advance_days: 14,
  student_max_hours_per_day: 2,
  student_max_computers: 1,
  faculty_priority: true,
};

/**
 * Builds the one-hour timetable from the laboratory's opening hours, so the
 * form can only ever offer slots the server will accept.
 */
export function buildTimeSlots(openTime = '07:00', closeTime = '17:00') {
  const toMin = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (mins) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

  const slots = [];
  for (let m = toMin(openTime); m + 60 <= toMin(closeTime); m += 60) {
    slots.push({ start: fmt(m), end: fmt(m + 60) });
  }
  return slots;
}

/** "Monday, Tuesday, Wednesday and Thursday" */
export function describeDays(days = []) {
  const names = [...days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]);
  if (names.length <= 1) return names[0] ?? 'no days';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "08:00" -> "08:00:00", the form Postgres `time` columns use. */
export const toDbTime = (value) => (value.length === 5 ? `${value}:00` : value);
