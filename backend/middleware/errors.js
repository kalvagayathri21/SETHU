export class HttpError extends Error {
  constructor(status, message, code = "REQUEST_ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error?.code === "23505") {
    return res.status(409).json({ error: "That record already exists.", code: "CONFLICT" });
  }
  if (error?.code === "23P01" || error?.code === "23514" || error?.code === "23503") {
    return res.status(409).json({ error: "This operation conflicts with existing data.", code: "CONFLICT" });
  }
  if (error?.name === "ZodError") {
    return res.status(400).json({
      error: "Please check the submitted information.",
      code: "VALIDATION_ERROR",
      details: error.issues.map(({ path, message }) => ({ field: path.join("."), message }))
    });
  }
  const status = Number.isInteger(error?.status) ? error.status : 500;
  if (status >= 500) console.error("API error", { path: req.originalUrl, message: error.message });
  return res.status(status).json({
    error: status >= 500 ? "An unexpected server error occurred." : error.message,
    code: error?.code || "INTERNAL_ERROR"
  });
}
