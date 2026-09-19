export default function ErrorState({ message = 'Something went wrong. Please try again.', onRetry }) {
  return (
    <div className="state">
      <div className="state-icon" aria-hidden="true">⚠️</div>
      <div className="state-title">Could not load this</div>
      <div className="small">{message}</div>
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}
