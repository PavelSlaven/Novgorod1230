function cleanText(value) {
  return String(value ?? '').trim();
}

function isVisibleSceneEntity(entity = {}) {
  if (entity?.accessible === false) return false;

  const visibility = String(entity?.visibility ?? '').trim().toLowerCase();
  if (visibility === 'hidden' || visibility === 'unknown') return false;

  const discoverability = Number(entity?.discoverability);
  if (Number.isFinite(discoverability) && discoverability <= 1) return false;

  return true;
}

export function humanizeSceneAnchor(label, action) {
  const cleanLabel = String(label ?? '').trim();
  const cleanAction = String(action ?? '').trim().toLowerCase();
  if (!cleanLabel) return '';
  const readableAction = {
    talk: 'поговорить',
    speak: 'поговорить',
    inspect: 'осмотреть',
    look: 'осмотреть',
    move: 'перейти',
    go: 'перейти',
    enter: 'войти',
    exit: 'выйти',
    take: 'взять',
    use: 'использовать',
    wait: 'ждать'
  }[cleanAction];
  return readableAction ? `${readableAction}: ${cleanLabel}` : cleanLabel;
}

function buildSceneCommand(label, action) {
  const cleanLabel = String(label ?? '').trim();
  const cleanAction = String(action ?? '').trim().toLowerCase();
  if (!cleanLabel) return '';
  const verb = {
    talk: 'поговорить с',
    speak: 'поговорить с',
    inspect: 'осмотреть',
    look: 'осмотреть',
    move: 'идти к',
    go: 'идти к',
    enter: 'войти в',
    exit: 'выйти через',
    take: 'взять',
    use: 'использовать',
    wait: 'ждать возле'
  }[cleanAction] ?? 'осмотреть';
  return `${verb} ${cleanLabel}`.replace(/\s+/g, ' ').trim();
}

export function buildSceneActionHints(markup = {}) {
  const highlights = Array.isArray(markup?.highlights) ? markup.highlights : [];
  const visibleItems = highlights.length > 0
    ? highlights
    : (Array.isArray(markup?.entities) ? markup.entities : []).filter((entity) => isVisibleSceneEntity(entity));

  return visibleItems
    .slice(0, 5)
    .map((highlight) => {
      const label = cleanText(highlight?.label);
      if (!label) return null;
      const action = String(highlight?.action ?? '').trim();
      return {
        label: humanizeSceneAnchor(label, action),
        command: buildSceneCommand(label, action),
        action
      };
    })
    .filter(Boolean);
}
