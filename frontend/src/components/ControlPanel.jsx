import { useState } from 'react';
import Modal, { ConfirmDialog } from './Modal.jsx';
import controlService from '../services/controlService.js';
import { useToast } from '../context/ToastContext.jsx';

/**
 * The control buttons for one workstation.
 *
 * Shutting down or locking a machine somebody is working at is disruptive,
 * so the destructive actions confirm first and every one of them is written
 * to the audit log with the administrator's name.
 */
export default function ControlPanel({ computer, onDone }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState('warning');

  async function send(action, body) {
    setBusy(action);
    try {
      const res = await controlService.send(computer.id, action, body);
      toast.success(res.message ?? 'Command sent.');
      setConfirm(null);
      setMessageOpen(false);
      setMessage('');
      onDone?.();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(null);
    }
  }

  const online = computer.is_online;

  return (
    <>
      <div className="control-row">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => send('screenshot')}
          disabled={!online || busy}
          title={online ? 'Capture the screen now' : 'The machine is offline'}
        >
          📷 Capture
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setMessageOpen(true)}
          disabled={!online || busy}
          title={online ? 'Show a message on this screen' : 'The machine is offline'}
        >
          ⚠ Warn
        </button>

        {computer.is_locked ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => send('unlock')}
            disabled={!online || busy}
          >
            🔓 Unfreeze
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setConfirm('lock')}
            disabled={!online || busy}
            title={online ? 'Lock the session' : 'The machine is offline'}
          >
            🔒 Freeze
          </button>
        )}

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setConfirm('restart')}
          disabled={!online || busy}
        >
          ↻ Restart
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ color: 'var(--danger)' }}
          onClick={() => setConfirm('shutdown')}
          disabled={!online || busy}
        >
          ⏻ Shut down
        </button>

        {/* Only useful when the machine is off — that is the point of it. */}
        {!online && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => send('wake')}
            disabled={busy}
            title="Send a Wake-on-LAN signal"
          >
            ⏻ Power on
          </button>
        )}
      </div>

      {/* --- warning message --- */}
      <Modal
        open={messageOpen}
        onClose={() => setMessageOpen(false)}
        title={`Send a message to ${computer.name}`}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setMessageOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => send('message', { message, level })}
              disabled={busy || message.trim().length < 2}
            >
              {busy ? 'Sending…' : 'Show on screen'}
            </button>
          </>
        }
      >
        <div className="stack">
          <div className="field">
            <label htmlFor="ctrl-level">Type</label>
            <select
              id="ctrl-level"
              className="select"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="warning">Warning — for misuse of the laboratory</option>
              <option value="info">Notice — a general message</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="ctrl-message">Message</label>
            <textarea
              id="ctrl-message"
              className="textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              placeholder="e.g. Gaming is not permitted in the laboratory. Please return to your activity."
            />
            <span className="small muted">
              This appears as a dialog on the workstation. If someone is booked on it, they also
              get a notification in SMARTLAB.
            </span>
          </div>
        </div>
      </Modal>

      {/* --- destructive actions --- */}
      <ConfirmDialog
        open={confirm === 'shutdown'}
        onClose={() => setConfirm(null)}
        onConfirm={() => send('shutdown')}
        busy={busy === 'shutdown'}
        title={`Shut down ${computer.name}?`}
        confirmLabel="Shut down"
        message={
          `The machine shuts down in 5 seconds and anything unsaved on it is lost.` +
          (computer.logged_in_user ? ` ${computer.logged_in_user} is signed in.` : '')
        }
      />

      <ConfirmDialog
        open={confirm === 'restart'}
        onClose={() => setConfirm(null)}
        onConfirm={() => send('restart')}
        busy={busy === 'restart'}
        title={`Restart ${computer.name}?`}
        confirmLabel="Restart"
        message={
          `The machine restarts in 5 seconds and anything unsaved on it is lost.` +
          (computer.logged_in_user ? ` ${computer.logged_in_user} is signed in.` : '')
        }
      />

      <ConfirmDialog
        open={confirm === 'lock'}
        onClose={() => setConfirm(null)}
        onConfirm={() => send('lock')}
        busy={busy === 'lock'}
        tone="primary"
        title={`Freeze ${computer.name}?`}
        confirmLabel="Freeze"
        message="The session locks immediately. Nothing is lost — the user signs back in as normal."
      />
    </>
  );
}
