const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Reads ?page= and ?limit= into the range bounds Supabase expects.
 * Limit is capped so a client cannot ask for thousands of rows at once.
 */
export function getPagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requested = Number.parseInt(query.limit, 10) || DEFAULT_LIMIT;
  const limit = Math.min(Math.max(1, requested), MAX_LIMIT);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return { page, limit, from, to };
}

/** Shapes a paginated list response identically across every endpoint. */
export function paginated(data, count, { page, limit }) {
  const total = count ?? 0;
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}

export { DEFAULT_LIMIT, MAX_LIMIT };
