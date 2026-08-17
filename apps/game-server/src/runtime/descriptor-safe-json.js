export function descriptorSafeJsonSnapshot(value) {
  const seen = new WeakSet();
  const invalid = Object.freeze({});
  function visit(input) {
    if (input === null || typeof input === 'string'
        || typeof input === 'boolean') return input;
    if (typeof input === 'number') return Number.isFinite(input) ? input : invalid;
    if (!input || typeof input !== 'object' || seen.has(input)
        || Object.getOwnPropertySymbols(input).length > 0) return invalid;
    const array = Array.isArray(input);
    if (Object.getPrototypeOf(input)
        !== (array ? Array.prototype : Object.prototype)) return invalid;
    seen.add(input);
    const names = Object.getOwnPropertyNames(input);
    if (array && (names.length !== input.length + 1
        || !names.includes('length'))) return invalid;
    const output = array ? [] : {};
    for (const key of names) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(input,key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor,'value')) {
        return invalid;
      }
      if (array && key !== String(output.length)) return invalid;
      const child = visit(descriptor.value);
      if (child === invalid) return invalid;
      if (array) output.push(child); else output[key] = child;
    }
    return output;
  }
  const result = visit(value);
  return result === invalid ? null : result;
}
