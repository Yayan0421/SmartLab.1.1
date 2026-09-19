import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Avatar from './Avatar.jsx';
import { ROLE_LABEL } from '../utils/format.js';

/**
 * The laboratory card: a scannable QR plus the details printed beside it.
 *
 * The QR encodes only the opaque card code (SL-XXXXXXXXXXXX) — never a name,
 * email or database id — so a photographed card gives away nothing on its
 * own. Resolving it to a person requires an administrator session.
 *
 * Rendered to a canvas, which is also what makes "Download" and "Print"
 * possible without a server round trip.
 */
export default function QrCard({ user, compact = false }) {
  const canvasRef = useRef(null);
  const [error, setError] = useState(null);
  const code = user?.qr_code;

  useEffect(() => {
    if (!code || !canvasRef.current) return;

    QRCode.toCanvas(
      canvasRef.current,
      code,
      {
        width: compact ? 150 : 220,
        margin: 1,
        // Highest correction level, so a scuffed or partly covered printed
        // card still scans.
        errorCorrectionLevel: 'H',
        color: { dark: '#4a0e17', light: '#ffffff' },
      },
      (err) => setError(err ? 'Could not render the QR code.' : null)
    );
  }, [code, compact]);

  if (!code) {
    return (
      <div className="qr-empty">
        <span aria-hidden="true">🪪</span>
        <div>
          <strong>No laboratory card</strong>
          <div className="small muted">
            Cards are issued to students and faculty. Ask an administrator if you need one.
          </div>
        </div>
      </div>
    );
  }

  function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    const safeName = (user.full_name || 'smartlab-card').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    link.download = `${safeName}-${code}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  /** Opens a minimal print sheet rather than printing the whole dashboard. */
  function print() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = canvas.toDataURL('image/png');
    const win = window.open('', '_blank', 'width=460,height=640');
    if (!win) return;

    win.document.write(`
      <!doctype html><html><head><title>SMARTLAB card — ${user.full_name}</title>
      <style>
        body { font-family: 'Segoe UI', system-ui, sans-serif; text-align: center;
               padding: 32px; color: #2b1f1c; }
        .card { display: inline-block; border: 2px solid #9b1d30; border-radius: 14px;
                padding: 22px 26px; }
        h1 { font-size: 15px; letter-spacing: .14em; text-transform: uppercase;
             color: #9b1d30; margin: 0 0 14px; }
        img { width: 220px; height: 220px; }
        .name { font-size: 17px; font-weight: 700; margin-top: 12px; }
        .meta { font-size: 12px; color: #6f5f5a; margin-top: 3px; }
        .code { font-family: Consolas, monospace; font-size: 13px; letter-spacing: .08em;
                margin-top: 10px; padding-top: 10px; border-top: 1px dashed #d4c4ab; }
      </style></head><body>
        <div class="card">
          <h1>SMARTLAB Laboratory Card</h1>
          <img src="${image}" alt="" />
          <div class="name">${user.full_name}</div>
          <div class="meta">${ROLE_LABEL[user.role] ?? user.role}${user.id_number ? ` · ${user.id_number}` : ''}</div>
          <div class="meta">${user.department ?? ''}</div>
          <div class="code">${code}</div>
        </div>
        <script>window.onload = function () { window.print(); };<\/script>
      </body></html>
    `);
    win.document.close();
  }

  return (
    <div className={`qr-card ${compact ? 'is-compact' : ''}`}>
      <div className="qr-canvas-wrap">
        <canvas ref={canvasRef} aria-label={`QR code for card ${code}`} />
      </div>

      <div className="qr-details">
        <div className="row" style={{ gap: '0.5rem', marginBottom: '0.15rem' }}>
          <Avatar user={user} size={34} />
          <div className="qr-name">{user.full_name}</div>
        </div>
        <div className="small muted">
          {ROLE_LABEL[user.role] ?? user.role}
          {user.id_number ? ` · ${user.id_number}` : ''}
        </div>
        {user.department && <div className="small muted">{user.department}</div>}

        <div className="qr-code-value" title="Your card code">{code}</div>

        {error && <div className="field-error">{error}</div>}

        {!compact && (
          <div className="row" style={{ gap: '0.4rem', marginTop: '0.7rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={download}>
              Download PNG
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={print}>
              Print card
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
