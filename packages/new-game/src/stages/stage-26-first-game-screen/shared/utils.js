
export function withoutNullish(value) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child != null));
}

export function safeClone(value) {
  return value == null ? value : structuredClone(value);
}

export function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function array(value) {
  return Array.isArray(value) ? value : [];
}

export function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function getPath(value, path) {
  return path.split('.').reduce((current, part) => current?.[part], value);
}

export function passCheck(pass) {
  return { pass: pass === true };
}

export function optionalPublicText(value) {
  return text(value) || null;
}

export function publicTextList(value) {
  return array(value).map(optionalPublicText).filter(Boolean);
}
