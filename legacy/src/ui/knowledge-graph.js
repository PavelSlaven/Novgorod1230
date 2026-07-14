function cleanText(value) {
  return String(value ?? '').trim();
}

function cleanUiText(value) {
  const text = cleanText(value);
  if (!text || text === 'неизвестно') return '';
  return text;
}

function slugGraphSegment(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'x';
}

function addGraphNode(nodes, seenNodes, id, type, label) {
  const cleanId = cleanText(id);
  if (!cleanId || seenNodes.has(cleanId)) return;
  seenNodes.add(cleanId);
  nodes.push({
    id: cleanId,
    type,
    label: cleanUiText(label) || cleanId
  });
}

export function buildKnowledgeGraph(nextState) {
  const nodes = [];
  const edges = [];
  const seenNodes = new Set();
  const currentLocationId = cleanText(
    nextState?.currentPosition?.location_id
    ?? nextState?.orientation?.locationId
    ?? nextState?.currentLocationId
    ?? nextState?.place?.id
    ?? nextState?.place?.location_id
    ?? 'current'
  );
  const currentLocationLabel = cleanUiText(nextState?.place?.name) || 'текущее место';

  addGraphNode(nodes, seenNodes, `location:${currentLocationId}`, 'current_location', currentLocationLabel);

  const routes = Array.isArray(nextState?.historical?.routeArchiveVisible)
    ? nextState.historical.routeArchiveVisible.slice(0, 12)
    : [];

  for (const entry of routes) {
    const route = entry?.route ?? {};
    const fromId = cleanText(route.from_id ?? currentLocationId);
    const toId = cleanText(route.to_id ?? entry?.target ?? route.destination ?? '');
    if (!toId) continue;

    const fromNodeId = `location:${fromId}`;
    const toNodeId = `location:${toId}`;
    const fromLabel = fromId === currentLocationId
      ? currentLocationLabel
      : cleanUiText(route.from_label ?? route.from ?? fromId);
    const toLabel = cleanUiText(route.label ?? entry?.summary ?? route.destination_label ?? toId);
    const edgeType = cleanText(route.access ?? route.type ?? route.certainty ?? 'known_route') || 'known_route';

    addGraphNode(nodes, seenNodes, fromNodeId, 'known_place', fromLabel);
    addGraphNode(nodes, seenNodes, toNodeId, 'known_place', toLabel);
    edges.push({
      from: fromNodeId,
      to: toNodeId,
      type: edgeType
    });
  }

  const exits = Array.isArray(nextState?.place?.exits) ? nextState.place.exits.slice(0, 6) : [];
  exits.forEach((exit, index) => {
    const label = cleanUiText(exit?.label ?? exit?.name ?? exit?.direction ?? exit ?? '');
    if (!label) return;
    const certainty = cleanText(exit?.certainty ?? '').toLowerCase();
    const edgeType = certainty.includes('слух') || certainty.includes('rumor')
      ? 'route_rumor'
      : certainty.includes('сомн') || certainty.includes('uncertain')
        ? 'uncertain_direction'
        : 'known_direction';
    const nodeId = `direction:${index}:${slugGraphSegment(label)}`;
    addGraphNode(nodes, seenNodes, nodeId, edgeType, label);
    edges.push({
      from: `location:${currentLocationId}`,
      to: nodeId,
      type: edgeType
    });
  });

  const knowledgeMap = nextState?.knowledgeMap ?? {};
  const knownPlaces = Array.isArray(knowledgeMap.knownPlaces) ? knowledgeMap.knownPlaces.slice(0, 8) : [];
  const knownRoutes = Array.isArray(knowledgeMap.knownRoutes) ? knowledgeMap.knownRoutes.slice(0, 8) : [];

  for (const place of knownPlaces) {
    const placeId = cleanText(place?.id ?? place?.label ?? '');
    if (!placeId) continue;
    addGraphNode(
      nodes,
      seenNodes,
      `knowledge:place:${slugGraphSegment(placeId)}`,
      'known_place',
      cleanUiText(place?.label ?? place?.summaryText ?? placeId)
    );
  }
  for (const route of knownRoutes) {
    const routeLabel = cleanUiText(route?.label ?? route?.summaryText ?? route?.id ?? '');
    if (!routeLabel) continue;
    addGraphNode(
      nodes,
      seenNodes,
      `knowledge:route:${slugGraphSegment(routeLabel)}`,
      'known_route',
      routeLabel
    );
  }

  return { nodes, edges };
}
