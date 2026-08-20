// The repository boundary yields data, never executable descriptors.  This is
// intentionally specialized to the ordinary enablement hand-off rather than a
// shared serialization utility.
export function snapshotOrdinaryMaterializationEnablement(value) {
  const seen = new WeakSet();
  function copy(entry) {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean') return entry;
    if (typeof entry === 'number') return Number.isFinite(entry) ? entry : null;
    if (!entry || typeof entry !== 'object' || Object.getOwnPropertySymbols(entry).length) return null;
    const array = Array.isArray(entry);
    if ((array && Object.getPrototypeOf(entry) !== Array.prototype)
        || (!array && Object.getPrototypeOf(entry) !== Object.prototype) || seen.has(entry)) return null;
    seen.add(entry);
    const names = Object.getOwnPropertyNames(entry);
    if (array && (names.length !== entry.length + 1 || !names.includes('length'))) return null;
    const out = array ? [] : {};
    for (const name of names) {
      if (array && name === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(entry, name);
      if (!descriptor || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) return null;
      const child = copy(descriptor.value);
      if (child === null && descriptor.value !== null) return null;
      if (array) {
        if (name !== String(out.length)) return null;
        out.push(child);
      } else out[name] = child;
    }
    return out;
  }
  return copy(value);
}
