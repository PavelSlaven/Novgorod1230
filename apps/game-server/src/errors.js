export class GameServerError extends Error {
  constructor(code, message, { status = 500, details = null } = {}) {
    super(message);
    this.name = 'GameServerError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function serverError(code, message, options) {
  return new GameServerError(code, message, options);
}
