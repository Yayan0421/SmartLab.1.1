/**
 * Runs a Zod schema against part of the request and replaces it with the
 * parsed result, so controllers only ever see validated, coerced data.
 *
 *   router.post('/', validate(createBookingSchema), handler)
 */
export function validate(schema, source = 'body') {
  return function runValidation(req, _res, next) {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export default validate;
