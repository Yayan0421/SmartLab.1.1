export default function Spinner({ label = 'Loading…' }) {
  return (
    <div className="state">
      <div className="spinner" />
      <div className="small muted">{label}</div>
    </div>
  );
}
