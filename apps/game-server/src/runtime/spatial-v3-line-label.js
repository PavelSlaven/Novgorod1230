export function spatialV3LineLabel(name, discriminator) {
  if (typeof name !== 'string' || !name.trim()) return null;
  const lineName = name.trim();
  if (discriminator == null || discriminator === '') return lineName;
  if (typeof discriminator !== 'string' || !discriminator.trim()) return null;
  return `${lineName} · ${discriminator.trim()}`;
}
