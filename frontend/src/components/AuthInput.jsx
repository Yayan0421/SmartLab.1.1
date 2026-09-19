import { useState } from 'react';
import { CheckIcon, EyeIcon, EyeOffIcon } from './icons.jsx';

/**
 * The pill-shaped field used across all four sign-in screens: a leading
 * icon, and a trailing slot that shows either a password visibility toggle
 * or a tick once the value looks valid.
 *
 * One component so the four pages cannot drift apart visually.
 */
export default function AuthInput({
  id,
  type = 'text',
  icon: Icon,
  value,
  onChange,
  placeholder,
  autoComplete,
  disabled,
  error,
  valid = false,
  label,
  maxLength,
}) {
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword && revealed ? 'text' : type;

  return (
    <div className="af">
      {label && (
        <label className="af-label" htmlFor={id}>
          {label}
        </label>
      )}

      <div className={`af-shell ${error ? 'is-error' : ''} ${disabled ? 'is-disabled' : ''}`}>
        {Icon && (
          <span className="af-icon" aria-hidden="true">
            <Icon />
          </span>
        )}

        <input
          id={id}
          className="af-input"
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          maxLength={maxLength}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />

        {isPassword ? (
          <button
            type="button"
            className="af-toggle"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            tabIndex={-1}
            disabled={disabled}
          >
            {revealed ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        ) : (
          valid && (
            <span className="af-valid" aria-hidden="true">
              <CheckIcon width={14} height={14} />
            </span>
          )
        )}
      </div>

      {error && (
        <span className="af-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
