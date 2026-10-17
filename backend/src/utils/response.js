/**
 * Every successful response has the shape { success: true, data, meta? };
 * every error has { success: false, error: { code, message, details? } }.
 */
export function ok(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function created(res, data) {
  return ok(res, data, { status: 201 });
}
