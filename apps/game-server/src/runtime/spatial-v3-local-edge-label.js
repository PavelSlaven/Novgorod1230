const positionRole = new Map([['arrival', 0], ['focus', 1], ['departure', 2]]);

export function spatialV3LocalEdgeLabel(positions, fromPositionId, toPositionId) {
  const slots = new Map(positions.map((row) => [row.id, row.template_slot_key]));
  const from = positionRole.get(slots.get(fromPositionId));
  const to = positionRole.get(slots.get(toPositionId));
  if (from == null || to == null || from === to) return null;
  return to > from ? 'Дальше' : 'Обратно';
}
