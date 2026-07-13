export function ok(value, meta = undefined) {
  return Object.freeze({ ok: true, value, ...(meta === undefined ? {} : { meta }) });
}

export function err(code, message, details = undefined) {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code: String(code), message: String(message), ...(details === undefined ? {} : { details }) })
  });
}

export function unwrap(result) {
  if (!result?.ok) throw new KernelError(result?.error?.code ?? 'unknown_error', result?.error?.message ?? 'Operation failed', result?.error?.details);
  return result.value;
}

export class KernelError extends Error {
  constructor(code, message, details = undefined, options = undefined) {
    super(message, options);
    this.name = 'KernelError';
    this.code = String(code);
    this.details = details;
  }
}
