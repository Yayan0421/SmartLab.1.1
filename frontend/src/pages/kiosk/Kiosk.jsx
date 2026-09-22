import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import kioskService, { rememberKioskKey } from '../../services/kioskService.js';
import Receipt from './Receipt.jsx';
import { formatTimeRange } from '../../utils/format.js';
import { labFormat } from '../../utils/labConstants.js';
import { printViaRawBT } from '../../utils/receiptText.js';

/**
 * Smart Computer Laboratory — self-service kiosk.
 *
 * A touchscreen station in the laboratory. A student presents their card,
 * the camera verifies who collected the machine, and the session starts.
 *
 * Two ways to scan, because laboratories have both kinds of hardware:
 *   - the camera, decoding the QR from the video frames
 *   - a handheld QR or RFID reader, which behaves as a keyboard and simply
 *     types the code followed by Enter
 *
 * Nothing here decides entitlement. The kiosk asks the server what a card
 * may do and the server re-checks every rule at check-in — a device sitting
 * unattended in a public room is not a thing to trust.
 */

const IDLE_RESET_MS = 25_000;

/**
 * Takes the device key out of the address bar and onto the device.
 *
 * The kiosk is set up once by opening /kiosk?key=… on the terminal. The
 * key is stored and the parameter removed from the URL immediately, so it
 * does not sit in the address bar of a machine standing in a public room,
 * and does not end up in a bookmark or a shoulder-surfed screenshot.
 */
function claimKeyFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('key');
  if (!key) return;

  rememberKioskKey(key);
  params.delete('key');
  const query = params.toString();
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${query ? `?${query}` : ''}`
  );
}

/**
 * Collapses a class booking into one entry.
 *
 * Rows sharing a batch_id were one decision — a member of staff reserving
 * a set of machines for a class — so the kiosk offers them as one thing to
 * choose, and checks them in together. Rows without a batch stand alone.
 *
 * Returns the first row of each group, carrying the group's machine names.
 */
function groupSessions(sessions) {
  const groups = new Map();

  for (const session of sessions) {
    const key = session.batch_id ?? `one:${session.id}`;
    const seen = groups.get(key);
    if (seen) seen.machines.push(session.computer?.name);
    else groups.set(key, { ...session, machines: [session.computer?.name] });
  }

  return [...groups.values()];
}

/**
 * How this terminal prints, remembered between restarts.
 *
 * Set once with ?print=rawbt (or ?print=intent, or ?print=browser to go
 * back) and the kiosk keeps it, so the shortcut on the terminal can be the
 * plain /kiosk address and nobody has to retype query strings after a
 * reboot. Paper width is remembered the same way: ?paper=58 or ?paper=80.
 */
function printSettings() {
  const params = new URLSearchParams(window.location.search);
  const read = (key, fallback) => {
    const given = params.get(key);
    try {
      if (given) {
        window.localStorage.setItem(`kiosk.${key}`, given);
        return given;
      }
      return window.localStorage.getItem(`kiosk.${key}`) ?? fallback;
    } catch {
      // Private mode, or storage switched off on the terminal. The query
      // string still works; only the memory of it is lost.
      return given ?? fallback;
    }
  };

  return {
    mode: read('print', 'browser'),
    width: Number(read('paper', '80')) === 58 ? 32 : 48,
  };
}

export default function Kiosk() {
  // Before any state, so the first request already carries the key.
  useState(() => {
    claimKeyFromUrl();
    return null;
  });

  const [stage, setStage] = useState('waiting'); // waiting | choosing | done | error
  const [scanned, setScanned] = useState(null);
  const [session, setSession] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [rearCamera, setRearCamera] = useState(true);
  const [clock, setClock] = useState(new Date());

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const keyBuffer = useRef({ text: '', last: 0 });
  const idleTimer = useRef(null);

  /* ---------------------------------------------------------------- */
  /* audio feedback — the speaker the kiosk brief calls for            */
  /* ---------------------------------------------------------------- */
  const beep = useCallback((kind) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      // A rising pair for success, a low buzz for a refusal: staff and
      // students learn the difference without reading the screen.
      const notes = kind === 'ok' ? [880, 1320] : [220, 180];
      osc.type = kind === 'ok' ? 'sine' : 'square';
      gain.gain.setValueAtTime(0.12, ctx.currentTime);

      osc.frequency.setValueAtTime(notes[0], ctx.currentTime);
      osc.frequency.setValueAtTime(notes[1], ctx.currentTime + 0.12);
      osc.start();
      osc.stop(ctx.currentTime + 0.26);
      osc.onended = () => ctx.close();
    } catch {
      /* audio is a nicety; never let it break the flow */
    }
  }, []);

  /**
   * Fully Kiosk Browser exposes a `fully` object to the page. Where it is
   * present its own text-to-speech is more reliable than the WebView's,
   * which is often silent on these boards.
   */
  const speak = useCallback((text) => {
    try {
      if (window.fully?.textToSpeech) {
        window.fully.textToSpeech(text);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.volume = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      /* speech is a nicety; never let it break the flow */
    }
  }, []);

  /* ---------------------------------------------------------------- */
  /* resetting back to the idle screen                                 */
  /* ---------------------------------------------------------------- */
  const reset = useCallback(() => {
    setStage('waiting');
    setScanned(null);
    setSession(null);
    setReceipt(null);
    setMessage(null);
    setBusy(false);
  }, []);

  const scheduleReset = useCallback(
    (ms = IDLE_RESET_MS) => {
      clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(reset, ms);
    },
    [reset]
  );

  useEffect(() => () => clearTimeout(idleTimer.current), []);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  /**
   * A kiosk should not go dark while somebody is standing at it. Fully
   * Kiosk can hold the screen on; on an ordinary browser we ask for a
   * wake lock, which does the same thing where it is supported.
   */
  useEffect(() => {
    let lock = null;

    try {
      window.fully?.turnScreenOn?.();
      window.fully?.setScreenBrightness?.(200);
    } catch {
      /* not running inside Fully Kiosk */
    }

    navigator.wakeLock
      ?.request('screen')
      .then((sentinel) => {
        lock = sentinel;
      })
      .catch(() => {
        /* wake lock is not available everywhere */
      });

    return () => lock?.release?.().catch(() => {});
  }, []);

  /* ---------------------------------------------------------------- */
  /* scanning                                                          */
  /* ---------------------------------------------------------------- */
  /**
   * Sends the receipt to the printer, best route first.
   *
   * RawBT prints with no dialog, which is the whole difference between a
   * kiosk and a web page somebody has to tap twice. Everything that fails
   * falls through to the ordinary print dialog, so a terminal that was set
   * up wrongly still produces a receipt rather than nothing at all.
   */
  const printReceipt = useCallback((issued) => {
    const { mode, width } = printSettings();

    if (mode !== 'browser' && issued && printViaRawBT(issued, width, mode)) return;

    try {
      if (typeof window.fully?.print === 'function') {
        window.fully.print();
        return;
      }
    } catch {
      /* fall through to the browser's own print */
    }

    window.print();
  }, []);

  /**
   * Checks in and prints, with nothing in between.
   *
   * A booking that spans several machines is checked in as a whole and
   * prints one receipt listing them all: a member of staff reserving a
   * class set arrived once, and should not be handed ten slips of paper.
   */
  const confirm = useCallback(
    async (booking) => {
      setBusy(true);
      setMessage(null);

      try {
        const res = await kioskService.checkIn(
          booking.batch_id
            ? { batch_id: booking.batch_id }
            : { booking_id: booking.id }
        );
        setSession(res.data);
        setReceipt(res.data.receipt);
        setStage('done');
        beep('ok');

        const names = res.data.receipt?.computers ?? [];
        speak(
          names.length > 1
            ? `Checked in at ${names.length} workstations. Take your receipt.`
            : `Checked in at ${names[0] ?? res.data.computer?.name}. Take your receipt.`
        );

        // Print as soon as the receipt is in the DOM. Two frames is enough
        // for React to commit it; any longer is a pause people notice.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => printReceipt(res.data.receipt))
        );
        scheduleReset(20_000);
      } catch (error) {
        beep('error');
        setMessage({ tone: 'error', text: error.message });
        setStage('error');
        speak(error.message);
        scheduleReset(8000);
      } finally {
        setBusy(false);
      }
    },
    [beep, speak, scheduleReset, printReceipt]
  );

  const handleCode = useCallback(
    async (code) => {
      if (busy || stage !== 'waiting') return;
      setBusy(true);
      try {
        const res = await kioskService.scan(code);
        setScanned(res.data);
        setStage('choosing');
        beep('ok');

        const ready = res.data.sessions.filter((s) => s.can_check_in);

        if (ready.length === 0) {
          const why = res.data.sessions[0]?.reason ?? 'You have no booking for today.';
          setMessage({ tone: 'warn', text: why });
          speak(why);
          scheduleReset(12_000);
          return;
        }

        // One obvious action: do it. Asking somebody to confirm the only
        // thing they could possibly want is a wasted tap at a kiosk with a
        // queue behind it. A class booking counts as one action however
        // many machines it holds, because it was one decision.
        if (groupSessions(ready).length === 1) {
          await confirm(ready[0]);
          return;
        }

        // Genuinely separate bookings today, so the choice is real.
        speak(`Welcome ${res.data.user.full_name.split(' ')[0]}. Choose your session.`);
        scheduleReset(40_000);
      } catch (error) {
        beep('error');
        setMessage({ tone: 'error', text: error.message });
        setStage('error');
        speak(error.message);
        scheduleReset(6000);
      } finally {
        setBusy(false);
      }
    },
    [busy, stage, beep, speak, scheduleReset, confirm]
  );

  /**
   * Handheld QR and RFID readers act as keyboards: they type the code fast
   * and finish with Enter. Collecting keystrokes globally means they work
   * with no driver and no focused input box.
   */
  useEffect(() => {
    function onKeyDown(event) {
      const now = Date.now();
      if (now - keyBuffer.current.last > 120) keyBuffer.current.text = '';
      keyBuffer.current.last = now;

      if (event.key === 'Enter') {
        const code = keyBuffer.current.text.trim();
        keyBuffer.current.text = '';
        if (code.length >= 6) handleCode(code);
        return;
      }
      if (event.key.length === 1) keyBuffer.current.text += event.key;
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCode]);

  /** Starts the camera and decodes QR codes out of the video frames. */
  const startCamera = useCallback(async () => {
    // Kiosk terminals have a dedicated scanner module rather than a camera
    // pointed at the customer. ?camera=off skips it entirely: no permission
    // prompt, no wasted battery, and the hardware scanner still works
    // because it types like a keyboard.
    if (new URLSearchParams(window.location.search).get('camera') === 'off') {
      setCameraOn(false);
      return;
    }

    try {
      /**
       * The rear camera by default.
       *
       * It is the better scanner: higher resolution, autofocus, and it is
       * the one people instinctively point at a card. The student holds
       * their card to the back of the phone while watching the screen.
       *
       * Append ?camera=front where the device is mounted facing the person
       * — that also makes the verification photo a picture of them rather
       * than of whatever the back of the phone is aimed at.
       */
      const useRear = new URLSearchParams(window.location.search).get('camera') !== 'front';

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: useRear ? 'environment' : 'user' },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });
      setRearCamera(useRear);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch (error) {
      setCameraOn(false);

      // On Android, Chrome refuses the camera on a plain http:// address.
      // Saying so is far more useful than "camera unavailable".
      const insecure =
        !window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname);

      setMessage({
        tone: 'warn',
        text: insecure
          ? 'This browser blocks the camera on an http:// address. Use a scanner, type the code below, or open the kiosk over https.'
          : error?.name === 'NotAllowedError'
            ? 'Camera permission was refused. Allow it in the browser, or type the code below.'
            : 'No camera was found. Use a scanner, or type the code below.',
      });
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => streamRef.current?.getTracks().forEach((track) => track.stop());
  }, [startCamera]);

  // Look for a QR code a few times a second while idle.
  useEffect(() => {
    if (!cameraOn || stage !== 'waiting') return undefined;

    const timer = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState !== 4) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(frame.data, frame.width, frame.height, {
        inversionAttempts: 'dontInvert',
      });

      if (found?.data) handleCode(found.data.trim());
    }, 350);

    return () => clearInterval(timer);
  }, [cameraOn, stage, handleCode]);

  /* ---------------------------------------------------------------- */
  /* check-in                                                          */
  /* ---------------------------------------------------------------- */

  /* ---------------------------------------------------------------- */
  /* screens                                                           */
  /* ---------------------------------------------------------------- */
  // Laboratory time, not the terminal's — the clock on screen has to agree
  // with the booking times beside it.
  const time = labFormat(clock, { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = labFormat(clock, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="kiosk">
      {/* The printed ticket lives outside the visible layout. */}
      {receipt && <Receipt receipt={receipt} />}

      <div className="kiosk-screen">
        <header className="kiosk-head">
          <div className="kiosk-brand">
            <span className="kiosk-mark">SL</span>
            <div>
              <div className="kiosk-title">Smart Computer Laboratory</div>
              <div className="kiosk-sub">Self-Service Kiosk</div>
            </div>
          </div>
          <div className="kiosk-clock">
            <div className="kiosk-time">{time}</div>
            <div className="kiosk-date">{date}</div>
          </div>
        </header>

        <main className="kiosk-body">
          {stage === 'waiting' && (
            <>
              {cameraOn ? (
                <div className={`kiosk-camera ${rearCamera ? 'is-rear' : ''}`}>
                  <video ref={videoRef} playsInline muted />
                  <div className="kiosk-reticle" />
                </div>
              ) : (
                /* No camera: show the scanner target instead, so the screen
                   still tells people where to hold their card. */
                <div className="kiosk-target" aria-hidden="true">
                  <span className="kiosk-target-icon">▤</span>
                  <span className="kiosk-target-beam" />
                </div>
              )}

              <h1 className="kiosk-h1">
                {busy ? 'Checking you in…' : 'Scan your laboratory card'}
              </h1>
              <p className="kiosk-p">
                {cameraOn
                  ? 'Hold the QR code up to the camera.'
                  : 'Hold the QR code under the scanner.'}
              </p>
              <ManualEntry onSubmit={handleCode} disabled={busy} />
            </>
          )}

          {stage === 'choosing' && scanned && (
            <>
              <div className="kiosk-person">
                {scanned.user.avatar_url ? (
                  <img src={scanned.user.avatar_url} alt="" className="kiosk-face" />
                ) : (
                  <span className="kiosk-face kiosk-face-text">
                    {scanned.user.full_name.slice(0, 1)}
                  </span>
                )}
                <div>
                  <h1 className="kiosk-h1">Hello, {scanned.user.full_name.split(' ')[0]}</h1>
                  <p className="kiosk-p">
                    {scanned.user.course || scanned.user.department || scanned.user.role}
                    {scanned.user.id_number ? ` · ${scanned.user.id_number}` : ''}
                  </p>
                </div>
              </div>

              {message && <div className={`kiosk-note is-${message.tone}`}>{message.text}</div>}

              <div className="kiosk-sessions">
                {scanned.sessions.length === 0 && (
                  <div className="kiosk-note is-warn">
                    You have no booking for today. Book a computer in SMARTLAB first.
                  </div>
                )}

                {groupSessions(scanned.sessions).map((booking) => (
                  <button
                    key={booking.batch_id ?? booking.id}
                    type="button"
                    className={`kiosk-session ${booking.can_check_in ? '' : 'is-blocked'}`}
                    onClick={() => booking.can_check_in && confirm(booking)}
                    disabled={!booking.can_check_in || busy}
                  >
                    <span className="kiosk-session-pc">
                      {booking.machines.length > 1
                        ? `${booking.machines.length} workstations`
                        : booking.computer?.name}
                    </span>
                    <span className="kiosk-session-meta">
                      {formatTimeRange(booking.start_time, booking.end_time)} · {booking.subject}
                      {booking.machines.length > 1 ? ` · ${booking.machines.join(', ')}` : ''}
                    </span>
                    <span className="kiosk-session-action">
                      {booking.can_check_in ? 'Tap to start →' : booking.reason}
                    </span>
                  </button>
                ))}
              </div>

              <button type="button" className="kiosk-cancel" onClick={reset}>
                Cancel
              </button>
            </>
          )}

          {stage === 'done' && session && (
            <>
              <div className="kiosk-tick" aria-hidden="true">✓</div>
              <h1 className="kiosk-h1">You are checked in</h1>
              <p className="kiosk-big">
                {receipt?.computers?.length > 1
                  ? `${receipt.computers.length} workstations`
                  : session.computer?.name}
              </p>
              {receipt?.computers?.length > 1 && (
                <p className="kiosk-p">{receipt.computers.join(', ')}</p>
              )}
              <p className="kiosk-p">
                Your session runs until {session.end_time?.slice(0, 5)}. Your receipt is printing.
              </p>
              <div className="kiosk-receipt-no">{session.receipt_no}</div>
              <button
                type="button"
                className="kiosk-again"
                onClick={() => printReceipt(receipt)}
              >
                Print again
              </button>
              <button type="button" className="kiosk-cancel" onClick={reset}>
                Done
              </button>
            </>
          )}

          {stage === 'error' && (
            <>
              <div className="kiosk-cross" aria-hidden="true">!</div>
              <h1 className="kiosk-h1">Sorry</h1>
              <p className="kiosk-p">{message?.text}</p>
              <button type="button" className="kiosk-again" onClick={reset}>
                Try again
              </button>
            </>
          )}
        </main>

        <footer className="kiosk-foot">
          Check in within {scanned?.grace_minutes ?? 30} minutes of your start time, or the
          booking is released.
        </footer>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}

/** Typing the code is the fallback when neither camera nor scanner works. */
function ManualEntry({ onSubmit, disabled }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');

  if (!open) {
    return (
      <button type="button" className="kiosk-cancel" onClick={() => setOpen(true)}>
        Enter code manually
      </button>
    );
  }

  return (
    <form
      className="kiosk-manual"
      onSubmit={(event) => {
        event.preventDefault();
        if (code.trim()) onSubmit(code.trim());
        setCode('');
        setOpen(false);
      }}
    >
      <input
        autoFocus
        className="kiosk-input"
        value={code}
        onChange={(event) => setCode(event.target.value.toUpperCase())}
        placeholder="SL-XXXXXXXXXXXX"
        maxLength={15}
        disabled={disabled}
      />
      <button type="submit" className="kiosk-go" disabled={disabled}>
        Go
      </button>
    </form>
  );
}
