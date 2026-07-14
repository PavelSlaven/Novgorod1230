export function concern(code, message, extra = {}) {
  return { code, message, ...extra };
}
