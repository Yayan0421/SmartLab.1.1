import { useState } from 'react';

/**
 * The SMARTLAB mark.
 *
 * Renders the department logo from /img/smartlab-logo.png, falling back to
 * the lettered "SL" tile if the file is missing. The fallback is not
 * decoration: the logo is an asset somebody has to put in place, and a
 * header with a broken image in it is worse than one with no logo at all.
 *
 * `size` is in pixels and applies to both forms, so a caller never has to
 * know which one it got.
 */
export default function Logo({ size = 38, className = '', onClick }) {
  const [failed, setFailed] = useState(false);

  const shared = {
    className: `sl-logo ${className}`,
    style: { width: size, height: size },
    onClick,
    'aria-hidden': true,
  };

  if (failed) {
    return (
      <span {...shared} style={{ ...shared.style, fontSize: size * 0.32 }}>
        SL
      </span>
    );
  }

  return (
    <img
      {...shared}
      src="/img/smartlab-logo.png"
      alt=""
      onError={() => setFailed(true)}
    />
  );
}
