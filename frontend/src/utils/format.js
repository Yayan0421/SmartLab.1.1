/** Shared formatting helpers so dates and labels look the same everywhere. */

export const STATUS_TONE = {
  AVAILABLE: 'success',
  IN_USE: 'info',
  OFFLINE: 'neutral',
  MAINTENANCE: 'warning',
  RESERVED: 'brand',
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
  COMPLETED: 'info',
  EXPIRED: 'neutral',
  active: 'success',
  inactive: 'neutral',
  suspended: 'danger',
  admin: 'brand',
  faculty: 'info',
  student: 'neutral',
};

export const ROLE_LABEL = { admin: 'Admin', faculty: 'Faculty', student: 'Student' };

/** "PENDING" -> "Pending", "IN_USE" -> "In use" */
export function humanize(value) {
  if (!value) return '—';
  const text = String(value).replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "14:30:00" -> "2:30 PM" */
export function formatTime(time) {
  if (!time) return '—';
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatTimeRange(start, end) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** "2026-09-19" -> "Sep 19, 2026" */
export function formatDate(value) {
  if (!value) return '—';
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "3 minutes ago" — used on heartbeats and audit rows. */
export function timeAgo(value) {
  if (!value) return 'never';
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 0) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function formatNumber(value, digits = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCurrency(value, currency = 'PHP') {
  const num = Number(value) || 0;
  const symbols = { PHP: '₱', USD: '$', EUR: '€' };
  return `${symbols[currency] ?? ''}${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatUptime(seconds) {
  const total = Number(seconds) || 0;
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Today as YYYY-MM-DD in the browser's timezone (not UTC). */
export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function addDaysISO(days) {
  const now = new Date(Date.now() + days * 86400000);
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** Threshold tone for a CPU/RAM percentage or a temperature reading. */
export function meterTone(value, { warn = 70, danger = 88 } = {}) {
  const num = Number(value) || 0;
  if (num >= danger) return 'is-danger';
  if (num >= warn) return 'is-warning';
  return '';
}
