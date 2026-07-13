function countVisibleExits(nextState = {}) {
  const exits = Array.isArray(nextState.place?.exits) ? nextState.place.exits : [];
  return exits.filter((exit) => Boolean(String(exit?.label ?? exit?.name ?? exit ?? '').trim())).length;
}

function countVisibleRoutes(nextState = {}) {
  const archive = Array.isArray(nextState.historical?.routeArchiveVisible)
    ? nextState.historical.routeArchiveVisible
    : [];
  return archive.filter((entry) => Boolean(String(entry?.summary ?? entry?.route?.label ?? entry?.route?.to_id ?? '').trim())).length;
}

function countKnowledgeNodes(nextState = {}) {
  const knowledge = nextState.knowledgeMap ?? {};
  const places = Array.isArray(knowledge.knownPlaces) ? knowledge.knownPlaces.length : 0;
  const routes = Array.isArray(knowledge.knownRoutes) ? knowledge.knownRoutes.length : 0;
  return places + routes;
}

export function buildMapPanelState(nextState = {}, panelOpen = false) {
  const visibleExits = countVisibleExits(nextState);
  const visibleRoutes = countVisibleRoutes(nextState);
  const knowledgeCount = countKnowledgeNodes(nextState);
  const visibleCount = Math.max(visibleExits, visibleRoutes);
  return {
    open: Boolean(panelOpen),
    visibleExits: visibleCount,
    shouldRenderGraph: Boolean(panelOpen),
    badgeText: visibleCount > 0 ? `${visibleCount} пути` : 'без путей',
    knowledgeCount,
    knowledgeText: knowledgeCount > 0 ? `знаний ${knowledgeCount}` : 'карта знаний пуста'
  };
}
