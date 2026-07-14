function cleanText(value) {
  return String(value ?? '').trim();
}

function humanizeRouteAvailability(value) {
  const map = {
    open: 'открыт',
    slow: 'замедлен',
    blocked: 'закрыт'
  };
  return map[cleanText(value).toLowerCase()] ?? cleanText(value);
}

function formatRouteTime(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  if (minutes < 60) return `${Math.round(minutes)} мин`;
  const hours = minutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded} ч` : `${String(rounded).replace(/\.0+$/, '')} ч`;
}

function pluralizeRoutes(count) {
  const value = Math.abs(Number(count) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'маршрут';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'маршрута';
  return 'маршрутов';
}

function describeRouteConstraint(route = {}, selected = {}) {
  const risk = cleanText(route.risk ?? selected.risk ?? '');
  const access = cleanText(route.access ?? selected.availability).toLowerCase();
  if (!risk) return '';
  if (access === 'blocked') return `причина ${risk}`;
  if (access === 'slow') return `помеха ${risk}`;
  return `риск ${risk}`;
}

function isVisibleRouteEntry(entry = {}) {
  const route = entry?.route ?? {};
  if (route.known_to_player === true || route.known_to_character === true) {
    return true;
  }

  const summary = cleanText(entry?.summary ?? '');
  return Boolean(summary);
}

function buildRouteView(routeArchive = [], currentPosition = null) {
  const currentLocationId = cleanText(
    currentPosition?.location_id
    ?? currentPosition?.place_id
    ?? null
  );
  const items = (Array.isArray(routeArchive) ? routeArchive : [])
    .filter((entry) => isVisibleRouteEntry(entry))
    .slice(0, 12)
    .map((entry) => {
      const route = entry?.route ?? {};
      const selected = entry?.selected ?? {};
      const title = cleanText(route.label ?? route.route ?? entry?.target ?? entry?.summary ?? 'маршрут');
      const availability = humanizeRouteAvailability(route.access ?? selected.availability);
      const timeText = formatRouteTime(route.base_time ?? selected.minutes);
      const fromText = cleanText(route.from_id ?? entry?.originLocationId);
      const toText = cleanText(route.to_id ?? route.destination ?? selected.destination);
      const summary = cleanText(entry?.summary ?? '');
      const constraintText = describeRouteConstraint(route, selected);
      const lines = [
        summary,
        constraintText,
        route.scale ? `масштаб ${cleanText(route.scale)}` : '',
        timeText ? `время ${timeText}` : '',
        fromText || toText ? `путь ${[fromText ? `из ${fromText}` : null, toText ? `в ${toText}` : null].filter(Boolean).join(' ')}` : '',
        route.last_used_at ? 'последний путь сохранён' : '',
        entry?.route?.known_to_player || entry?.route?.known_to_character ? 'известен персонажу' : '',
        currentLocationId && fromText === currentLocationId ? 'отсюда' : ''
      ].filter(Boolean);

      return {
        raw: entry,
        title,
        meta: [
          availability ? `доступ ${availability}` : '',
          route.type ? `тип ${cleanText(route.type)}` : ''
        ].filter(Boolean).join(' · '),
        lines
      };
    })
    .filter((item) => item.title || item.lines.length > 0 || item.meta);

  return {
    summaryText: items.length > 0
      ? `Маршруты: ${items.length} ${pluralizeRoutes(items.length)}`
      : 'Маршрутов нет',
    items
  };
}

function buildRouteStripText(nextState = {}) {
  const position = nextState?.current_position ?? nextState?.currentPosition ?? {};
  const lastRouteId = cleanText(
    nextState?.routeContext?.lastRouteId
    ?? position.last_route_id
    ?? ''
  );
  const routeLabel = resolveRouteLabel(nextState?.historical?.routeArchiveVisible ?? [], lastRouteId);
  const place = cleanText(nextState?.place?.name);
  const microPlace = cleanText(nextState?.microPlace?.name);
  const parts = [];

  if (place || microPlace) {
    parts.push([place, microPlace].filter(Boolean).join(' · '));
  }

  if (routeLabel) {
    parts.push(`последний путь ${routeLabel}`);
  } else if (lastRouteId) {
    parts.push('последний путь зафиксирован');
  }

  return parts.filter(Boolean).join(' · ');
}

function resolveRouteLabel(routeArchive = [], routeId = null) {
  const wantedId = cleanText(routeId);
  if (!wantedId) return '';

  for (const entry of Array.isArray(routeArchive) ? routeArchive : []) {
    const route = entry?.route ?? {};
    const candidateIds = [
      entry?.id,
      route?.id,
      entry?.selected?.id
    ].map(cleanText).filter(Boolean);
    if (!candidateIds.includes(wantedId)) continue;
    return cleanText(route.label ?? route.route ?? entry?.summary ?? wantedId);
  }

  return '';
}

export {
  buildRouteView,
  buildRouteStripText,
  formatRouteTime,
  humanizeRouteAvailability,
  isVisibleRouteEntry
};
