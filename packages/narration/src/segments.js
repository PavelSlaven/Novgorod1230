export function segmentProse(prose) {
  const chunks = String(prose).match(/[^.!?…]+(?:(?:[.!?…]+[»”’"'\)\]\}]*)+|$)(?:\s*)/g) ?? [String(prose)];
  return chunks.filter(Boolean).map((text, index) => ({ segment_id: `s${index + 1}`, prose: text }));
}
