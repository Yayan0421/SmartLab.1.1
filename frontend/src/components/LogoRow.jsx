import { useState } from 'react';

/**
 * The three marks this system belongs to, in the order they are cited:
 * the university, then the organisation, then the system itself.
 *
 * They travel together — on the kiosk screen and on the printed receipt —
 * so they live in one component. A ticket and the terminal that issued it
 * should not be able to disagree about whose laboratory this is.
 *
 * Each mark hides itself if its file is missing rather than leaving a
 * broken image behind: a logo is an asset somebody has to put in place,
 * and a header with a torn image in it looks worse than one with a gap.
 * The row as a whole survives losing any of them.
 */

const MARKS = [
  { src: '/assets/essu-logo.png', alt: 'Eastern Samar State University' },
  { src: '/assets/icpep-logo.png', alt: 'ICpEP' },
  { src: '/assets/smartlab-logo.png', alt: 'SMARTLAB' },
];

export default function LogoRow({ size = 46, className = '' }) {
  return (
    <div className={`logo-row ${className}`} style={{ '--logo-size': `${size}px` }}>
      {MARKS.map((mark) => (
        <Mark key={mark.src} {...mark} />
      ))}
    </div>
  );
}

function Mark({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <img
      className="logo-row-mark"
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
    />
  );
}
