import { initials } from '../utils/format.js';

/**
 * A user's picture, falling back to their initials.
 *
 * Used in the sidebar, the top bar and the profile, so a photo appears
 * everywhere the moment it is uploaded. If the image 404s — a deleted file,
 * a stale URL — the initials come back rather than a broken-image icon.
 */
export default function Avatar({ user, size = 34, className = '' }) {
  const style = { width: size, height: size, fontSize: Math.max(10, size * 0.38) };

  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt=""
        className={`avatar avatar-img ${className}`}
        style={style}
        onError={(event) => {
          event.currentTarget.replaceWith(
            Object.assign(document.createElement('span'), {
              className: `avatar ${className}`,
              textContent: initials(user?.full_name),
              style: `width:${size}px;height:${size}px;font-size:${style.fontSize}px`,
            })
          );
        }}
      />
    );
  }

  return (
    <span className={`avatar ${className}`} style={style} aria-hidden="true">
      {initials(user?.full_name)}
    </span>
  );
}
