export class GameWebError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'GameWebError';
    this.code = code;
    this.details = details;
  }
}
export function webError(code, message, details) { return new GameWebError(code, message, details); }
