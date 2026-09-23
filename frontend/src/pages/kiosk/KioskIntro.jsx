import { useEffect, useRef } from 'react';
import LogoRow from '../../components/LogoRow.jsx';

/**
 * The opening title, shown once when the kiosk starts.
 *
 * A terminal standing in a laboratory is switched on in the morning and
 * left alone all day. This is what it does in the first few seconds: says
 * whose system it is, then gets out of the way.
 *
 * Three rules it must never break, because it sits in front of the only
 * thing the kiosk is for:
 *
 *   - it never blocks a scan. The card reader and the camera are live
 *     underneath it from the moment the page loads, so somebody who walks
 *     up mid-animation and presents a card is checked in as usual.
 *   - any touch or keypress ends it at once.
 *   - it plays once, on load — not after every check-in. A student
 *     waiting behind somebody else should see the scan screen, not a
 *     title sequence.
 *
 * `?intro=off` skips it entirely, for a terminal that reboots often.
 */
export default function KioskIntro({ onDone }) {
  // Held in a ref so the listeners below always call the current one
  // without being torn down and rebuilt on every render.
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    // No timer: the loop runs until somebody is actually there. A kiosk
    // that dismissed itself would spend the day showing a scan prompt to
    // an empty room, which is what the loop exists to avoid.
    const finish = () => done.current();

    window.addEventListener('keydown', finish);
    window.addEventListener('pointerdown', finish);

    return () => {
      window.removeEventListener('keydown', finish);
      window.removeEventListener('pointerdown', finish);
    };
  }, []);

  return (
    <div className="kiosk-intro" role="presentation">
      <div className="kiosk-intro-seal">
        <span className="kiosk-intro-ring" />
        <img src="/assets/smartlab-logo.png" alt="" />
        {/* The sweep: the kiosk's one job, drawn once over its own mark. */}
        <span className="kiosk-intro-scan" />
      </div>

      <h1 className="kiosk-intro-name">SMARTLAB</h1>
      <p className="kiosk-intro-sub">Smart Computer Laboratory</p>

      <div className="kiosk-intro-marks">
        <LogoRow size={34} />
      </div>

      <p className="kiosk-intro-hint">Self-Service Kiosk</p>

      {/* The affordance. It waits indefinitely now, so it has to say what
          it is waiting for - and that a card alone is enough. */}
      <p className="kiosk-intro-touch">Touch to begin, or scan your card</p>
    </div>
  );
}
