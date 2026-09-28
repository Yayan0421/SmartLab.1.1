import { useState } from 'react';
import adminService from '../../services/adminService.js';
import useFetch from '../../hooks/useFetch.js';
import useDebounce from '../../hooks/useDebounce.js';
import Spinner from '../../components/Spinner.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Pagination from '../../components/Pagination.jsx';
import { formatDateTime, timeAgo } from '../../utils/format.js';

/**
 * The actions worth filtering by, grouped the way somebody investigating
 * would look for them. The API matches `action` exactly, so these are the
 * literal strings recordAudit writes rather than free text.
 */
const ACTION_GROUPS = [
  {
    label: 'Administrator accounts',
    actions: [
      'admin.create',
      'admin.update',
      'admin.role_change',
      'admin.reset_password',
      'admin.deactivate',
      'admin.permission_denied',
    ],
  },
  {
    label: 'User accounts',
    actions: [
      'user.create',
      'user.update',
      'user.role_change',
      'user.reset_password',
      'user.deactivate',
      'user.qr_scan',
      'user.qr_reissue',
    ],
  },
  {
    label: 'Sign in',
    actions: [
      'auth.login',
      'auth.logout',
      'auth.register',
      'auth.admin_register',
      'auth.admin_signup_denied',
      'auth.change_password',
    ],
  },
  {
    label: 'Laboratory',
    actions: [
      'reservation.create',
      'reservation.create_bulk',
      'reservation.approve',
      'reservation.reject',
      'reservation.cancel',
      'computer.create',
      'computer.update',
      'computer.delete',
      'kiosk.check_in',
      'kiosk.check_out',
    ],
  },
  {
    label: 'System',
    actions: ['settings.update', 'laboratory.create'],
  },
];

/** A refusal is the entry you most want to spot in a long list. */
const isDenial = (action) => action.endsWith('permission_denied') || action.endsWith('_denied');

export default function AdminAuditLogs() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Typing in a filter should not fire a request per keystroke.
  const debouncedSearch = useDebounce(search, 300);
  const debouncedActor = useDebounce(actor, 300);

  const { data, loading, error, refetch } = useFetch(
    () =>
      adminService.auditLogs({
        page,
        limit: 25,
        search: debouncedSearch || undefined,
        action: action || undefined,
        actor: debouncedActor || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
    [page, debouncedSearch, action, debouncedActor, dateFrom, dateTo]
  );

  const logs = data?.data ?? [];
  const hasFilters = Boolean(search || action || actor || dateFrom || dateTo);

  function resetFilters() {
    setSearch('');
    setAction('');
    setActor('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  // Any filter change starts again at the first page: page 3 of the old
  // result set is rarely page 3 of the new one.
  const onFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit Logs</h1>
          <p className="subtitle">
            Every administrator action, in the order it happened. Entries are written by the
            server and cannot be edited or removed from here.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <input
            className="input search"
            type="search"
            placeholder="Search action, entity or email…"
            value={search}
            onChange={(e) => onFilter(setSearch)(e.target.value)}
            aria-label="Search audit log"
          />

          <select
            className="select"
            value={action}
            onChange={(e) => onFilter(setAction)(e.target.value)}
            aria-label="Filter by action"
          >
            <option value="">All actions</option>
            {ACTION_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.actions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          <input
            className="input"
            type="search"
            placeholder="Actor email…"
            value={actor}
            onChange={(e) => onFilter(setActor)(e.target.value)}
            aria-label="Filter by actor email"
          />

          <input
            className="input"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(e) => onFilter(setDateFrom)(e.target.value)}
            aria-label="From date"
          />

          <input
            className="input"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => onFilter(setDateTo)(e.target.value)}
            aria-label="To date"
          />

          {hasFilters && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetFilters}>
              Clear
            </button>
          )}
        </div>

        {loading && logs.length === 0 ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={error} onRetry={refetch} />
        ) : logs.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No audit entries"
            message={
              hasFilters
                ? 'No entries match these filters.'
                : 'Administrator actions are recorded here.'
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Details</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="small nowrap" title={formatDateTime(log.created_at)}>
                        {timeAgo(log.created_at)}
                      </td>
                      <td className="small">{log.actor_email ?? 'system'}</td>
                      <td>
                        <span
                          className={`badge badge-${isDenial(log.action) ? 'danger' : 'neutral'} badge-plain`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="small muted">
                        {log.entity}
                        {log.entity_id ? (
                          <span className="mono"> · {String(log.entity_id).slice(0, 8)}</span>
                        ) : null}
                      </td>
                      <td className="small muted">
                        <AuditDetails details={log.details} />
                      </td>
                      <td className="small mono muted">{log.ip_address ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination pagination={data?.pagination} onPageChange={setPage} label="entries" />
          </>
        )}
      </div>
    </>
  );
}

/**
 * The details column holds whatever the action recorded, so it is rendered
 * as key/value pairs rather than raw JSON — readable at a glance, with the
 * full object on hover for the rare entry that carries more.
 */
function AuditDetails({ details }) {
  const entries = Object.entries(details ?? {});
  if (entries.length === 0) return <span>—</span>;

  const summary = entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${formatValue(value)}`)
    .join(' · ');

  return (
    <span title={JSON.stringify(details, null, 2)}>
      {summary}
      {entries.length > 3 ? ' …' : ''}
    </span>
  );
}

function formatValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return Array.isArray(value) ? `${value.length} items` : '{…}';
  return String(value);
}
