import { Component } from 'react';

/**
 * Catches render-time crashes so a single broken page does not leave the
 * user staring at a blank screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[SMARTLAB] Unhandled UI error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: '2rem' }}>
        <div className="card" style={{ maxWidth: 460, width: '100%' }}>
          <div className="card-body center stack">
            <div style={{ fontSize: '2.5rem' }} aria-hidden="true">⚠️</div>
            <h1 style={{ fontSize: '1.25rem' }}>Something went wrong</h1>
            <p className="muted small">
              The page could not be displayed. Reloading usually clears this.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload SMARTLAB
            </button>
          </div>
        </div>
      </div>
    );
  }
}
