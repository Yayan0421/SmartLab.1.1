export default function EmptyState({ icon = '📭', title = 'Nothing here yet', message, action }) {
  return (
    <div className="state">
      <div className="state-icon" aria-hidden="true">{icon}</div>
      <div className="state-title">{title}</div>
      {message && <div className="small">{message}</div>}
      {action}
    </div>
  );
}
