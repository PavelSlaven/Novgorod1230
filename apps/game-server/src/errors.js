export class GameServerError extends Error {
  constructor(code, message, {
    status = 500, details = null, public_exposure = 'player'
  } = {}) {
    super(message);
    this.name = 'GameServerError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.public_exposure = public_exposure;
  }
}

export function serverError(code, message, options) {
  return new GameServerError(code, message, options);
}
