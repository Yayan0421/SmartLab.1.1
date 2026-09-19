/**
 * Server-side pagination control. The list endpoints cap `limit`, so the
 * browser only ever holds one page of rows regardless of table size.
 */
export default function Pagination({ pagination, onPageChange, label = 'records' }) {
  if (!pagination) return null;

  const { page, limit, total, totalPages, hasNext, hasPrev } = pagination;
  if (!total) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  // A compact window of page numbers around the current page.
  const pages = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  for (let i = start; i <= end; i += 1) pages.push(i);

  return (
    <div className="pagination">
      <span>
        Showing <strong>{first.toLocaleString()}</strong>–<strong>{last.toLocaleString()}</strong> of{' '}
        <strong>{total.toLocaleString()}</strong> {label}
      </span>

      <div className="pagination-controls">
        <button
          type="button"
          className="page-btn"
          onClick={() => onPageChange(page - 1)}
          disabled={!hasPrev}
          aria-label="Previous page"
        >
          ‹
        </button>

        {start > 1 && (
          <>
            <button type="button" className="page-btn" onClick={() => onPageChange(1)}>
              1
            </button>
            {start > 2 && <span className="subtle">…</span>}
          </>
        )}

        {pages.map((number) => (
          <button
            key={number}
            type="button"
            className={`page-btn ${number === page ? 'is-active' : ''}`}
            onClick={() => onPageChange(number)}
            aria-current={number === page ? 'page' : undefined}
          >
            {number}
          </button>
        ))}

        {end < totalPages && (
          <>
            {end < totalPages - 1 && <span className="subtle">…</span>}
            <button type="button" className="page-btn" onClick={() => onPageChange(totalPages)}>
              {totalPages}
            </button>
          </>
        )}

        <button
          type="button"
          className="page-btn"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNext}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}
