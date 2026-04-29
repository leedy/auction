// Wrap an async route handler so a thrown error or rejected promise is
// forwarded to Express's error middleware (errorHandler.mjs). Without this,
// async errors in Express 4 are silently dropped.

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
