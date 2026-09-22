import { useCallback, useEffect, useRef, useState } from 'react';
import notificationService from '../services/notificationService.js';
import usePolling from '../hooks/usePolling.js';
import { formatDateTime, timeAgo } from '../utils/format.js';
import Modal from './Modal.jsx';

/**
 * Topbar notifications.
 *
 * Refreshes on a 60s visible-tab interval rather than a tight poll; the
 * unread count is returned by the same request that returns the list, so
 * one call keeps both in sync.
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const wrapRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await notificationService.list({ limit: 8 });
      setItems(res.data ?? []);
      setUnread(res.unread ?? 0);
    } catch {
      // A failed refresh should not interrupt whatever the user is doing.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  usePolling(load, 60_000);

  // Close when clicking outside the dropdown.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      await load();
      setLoading(false);
    }
  }

  async function markRead(item) {
    if (item.is_read) return;
    setItems((current) =>
      current.map((n) => (n.id === item.id ? { ...n, is_read: true } : n))
    );
    setUnread((count) => Math.max(0, count - 1));
    try {
      await notificationService.markRead(item.id);
    } catch {
      load();
    }
  }

  async function markAll() {
    setItems((current) => current.map((n) => ({ ...n, is_read: true })));
    setUnread(0);
    try {
      await notificationService.markAllRead();
    } catch {
      load();
    }
  }

  return (
    <div className="dropdown" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn"
        onClick={handleOpen}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
      >
        🔔
        {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="dropdown-panel">
          <div className="dropdown-head">
            <span>Notifications</span>
            {unread > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={markAll}>
                Mark all read
              </button>
            )}
          </div>

          {loading && items.length === 0 ? (
            <div className="state" style={{ padding: '2rem 1rem' }}>
              <div className="spinner" />
            </div>
          ) : items.length === 0 ? (
            <div className="state" style={{ padding: '2rem 1rem' }}>
              <div className="state-icon" aria-hidden="true">🔕</div>
              <div className="small">No notifications yet</div>
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`notif-item ${item.is_read ? '' : 'is-unread'}`}
                onClick={() => {
                  // The dropdown truncates; the dialog is where the whole
                  // message lives. Opening one is also reading it.
                  markRead(item);
                  setDetail({ ...item, is_read: true });
                  setOpen(false);
                }}
              >
                <div className="notif-title">{item.title}</div>
                {item.message && <div className="notif-msg">{item.message}</div>}
                <div className="notif-time">{timeAgo(item.created_at)}</div>
              </button>
            ))
          )}
        </div>
      )}

      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.title ?? 'Notification'}
        footer={
          <button type="button" className="btn btn-primary" onClick={() => setDetail(null)}>
            Close
          </button>
        }
      >
        {detail && (
          <div className="stack" style={{ gap: '0.75rem' }}>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              {detail.message || 'No further detail was recorded.'}
            </p>

            <div className="row-between">
              <span className="muted small">Received</span>
              <strong className="small">{formatDateTime(detail.created_at)}</strong>
            </div>

            <div className="row-between">
              <span className="muted small">Age</span>
              <strong className="small">{timeAgo(detail.created_at)}</strong>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
