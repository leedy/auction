// Throw HttpError(status, msg) inside an async route to short-circuit with a
// specific status. 4xx exposes the message to clients; 5xx hides it (the
// errorHandler returns a generic message + a request id for log correlation).

export class HttpError extends Error {
  constructor(status, message, { expose } = {}) {
    super(message);
    this.status = status;
    this.expose = expose ?? status < 500;
  }
}
