import { humanizePhysicalAccess } from '../world/item-access.js';

function cleanText(value) {
  return String(value ?? '').trim();
}

function uniqueStrings(values, limit = Infinity) {
  const result = [];
  const seen = new Set();

  for (const value of Array.isArray(values) ? values : []) {
    const text = cleanText(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }

  return result;
}

function getItemLabel(item) {
  if (item == null) return '';
  if (typeof item === 'string') return cleanText(item);
  if (typeof item !== 'object') return cleanText(item);
  return cleanText(item.name ?? item.label ?? item.title ?? item.id ?? '');
}

function collectLabels(items) {
  return uniqueStrings((Array.isArray(items) ? items : []).map(getItemLabel));
}

function summarizeLabels(items, limit = 2) {
  const labels = collectLabels(items);
  if (!labels.length) return 'пусто';
  if (labels.length <= limit) return labels.join(', ');
  return `${labels.slice(0, limit).join(', ')} и ещё ${labels.length - limit}`;
}

function formatCompactWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const rounded = Math.round(number * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0+$/, '');
}

function humanizeLoadCategory(value) {
  const map = {
    light: 'лёгкий',
    moderate: 'средний',
    heavy: 'тяжёлый',
    overloaded: 'сверх предела',
    unknown: 'неизвестно'
  };
  const text = cleanText(value).toLowerCase();
  return map[text] ?? (cleanText(value) || 'неизвестно');
}

function humanizeItemAccess(value) {
  const map = {
    immediate: 'можно использовать сразу',
    borrowed: 'одолжено',
    not_carried: 'нельзя использовать сейчас',
    held_for_others: 'на хранении',
    contained: 'нужно время на поиск',
    deep_bag: 'нужно время на поиск',
    top_bag: 'нужно короткое действие',
    closed_container: 'нужно открыть контейнер',
    restricted: 'доступ ограничен',
    quick: 'можно быстро достать'
  };
  return map[cleanText(value).toLowerCase()] ?? (cleanText(value) || 'доступ ограничен');
}

function humanizeVisibility(value) {
  const map = {
    visible: 'видимый',
    hidden: 'скрытый',
    partial: 'частично видимый',
    documented: 'известен по владению',
    restricted: 'виден не полностью'
  };
  return map[cleanText(value).toLowerCase()] ?? cleanText(value);
}

function humanizeDiscoverability(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric >= 5) return 'очевидный';
    if (numeric >= 4) return 'заметный';
    if (numeric >= 3) return 'требует осмотра';
    if (numeric >= 2) return 'скрытый';
    if (numeric >= 1) return 'очень скрытый';
    return 'неизвестный';
  }
  const map = {
    obvious: 'очевидный',
    visible: 'очевидный',
    documented: 'заметный',
    partial: 'требует осмотра',
    subtle: 'скрытый',
    hidden: 'скрытый',
    secret: 'очень скрытый',
    unknown: 'неизвестный'
  };
  return map[cleanText(value).toLowerCase()] ?? cleanText(value);
}

function humanizeLegalStatus(value) {
  const map = {
    ordinary: 'обычный',
    restricted: 'ограниченный',
    forbidden: 'запрещённый',
    stolen: 'краденый',
    disputed: 'оспариваемый'
  };
  return map[cleanText(value).toLowerCase()] ?? cleanText(value);
}

function humanizeRisk(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric <= 0) return 'низкий';
    if (numeric <= 2) return 'средний';
    if (numeric <= 4) return 'высокий';
    return 'крайний';
  }
  const map = {
    low: 'низкий',
    medium: 'средний',
    high: 'высокий',
    extreme: 'крайний'
  };
  return map[cleanText(value).toLowerCase()] ?? cleanText(value);
}

function humanizeValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const parts = [];
    const facets = [
      ['практичность', value.practical],
      ['обмен', value.exchange],
      ['статус', value.status],
      ['право', value.legal],
      ['личное', value.personal],
      ['символ', value.symbolic],
      ['риск', value.risk]
    ];
    for (const [label, facet] of facets) {
      if (facet == null) continue;
      parts.push(`${label} ${humanizeFacet(facet)}`);
    }
    return parts.length ? parts.join(', ') : 'без оценки';
  }
  return cleanText(value);
}

function humanizeFacet(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return `${Math.max(0, Math.min(5, Math.round(numeric)))}/5`;
  }
  return cleanText(value);
}

function humanizePlausibility(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return `${Math.max(0, Math.min(5, Math.round(numeric)))}/5`;
  }
  return cleanText(value);
}

function visibleContentsCount(item) {
  if (!item || typeof item !== 'object') return 0;
  if (!Array.isArray(item.contents) || item.contents.length === 0) return 0;
  const access = cleanText(item.access).toLowerCase();
  const visibility = cleanText(item.visibility).toLowerCase();
  if (access === 'closed_container' || visibility === 'hidden' || visibility === 'unknown') return 0;
  return item.contents.filter((child) => {
    const childVisibility = cleanText(child?.visibility).toLowerCase();
    return childVisibility !== 'hidden' && childVisibility !== 'unknown';
  }).length;
}

function formatInventoryItemLine(item) {
  if (item == null) return 'неизвестно';
  if (typeof item === 'string') return cleanText(item);
  if (typeof item !== 'object') return cleanText(item);

  const label = getItemLabel(item) || 'неизвестно';
  const owner = cleanText(item.ownerName ?? item.owner_id ?? item.ownerId);
  const holder = cleanText(item.holderName ?? item.holder_id ?? item.holderId);
  const rights = Array.isArray(item.rights) ? uniqueStrings(item.rights, 4) : [];
  const condition = cleanText(item.condition ?? item.state);
  const contentsCount = visibleContentsCount(item);
  const parts = [
    label,
    item.type ? `тип ${cleanText(item.type)}` : null,
    item.material ? `материал ${cleanText(item.material)}` : null,
    condition ? `состояние ${condition}` : null,
    item.size ? `размер ${cleanText(item.size)}` : null,
    Number.isFinite(Number(item.weight)) ? `вес ${formatCompactWeight(item.weight)} кг` : null,
    item.placement ? `размещение ${cleanText(item.placement)}` : null,
    item.containerLabel || item.container_id || item.containerId ? `контейнер ${cleanText(item.containerLabel ?? item.container_id ?? item.containerId)}` : null,
    (item.access || item.placement) ? `доступ ${humanizePhysicalAccess(item) || humanizeItemAccess(item.access)}` : null,
    item.visibility ? `видимость ${humanizeVisibility(item.visibility)}` : null,
    item.discoverability != null ? `обнаружимость ${humanizeDiscoverability(item.discoverability)}` : null,
    item.legalStatus ? `правовой статус ${humanizeLegalStatus(item.legalStatus)}` : null,
    item.plausibility != null ? `правдоподобие ${humanizePlausibility(item.plausibility)}` : null,
    item.function ? `функция ${cleanText(item.function)}` : null,
    item.value ? `ценность ${humanizeValue(item.value)}` : null,
    item.risk ? `риск ${humanizeRisk(item.risk)}` : null,
    rights.length ? `права ${rights.join(', ')}` : null,
    contentsCount > 0 ? `содержит ${contentsCount}` : null,
    owner ? `владелец ${owner}` : null,
    holder && holder !== owner ? `держит ${holder}` : null
  ];

  return parts.filter(Boolean).join(' · ');
}

function formatInventoryLines(items) {
  return (Array.isArray(items) ? items : []).map((item) => formatInventoryItemLine(item)).filter(Boolean);
}

function normalizeItemBlock(value) {
  return Array.isArray(value) ? value : [];
}

function resolveInventoryItems(bundle, key) {
  if (bundle && Object.prototype.hasOwnProperty.call(bundle, key)) {
    return normalizeItemBlock(bundle[key]);
  }
  return [];
}

function buildInventoryView(player) {
  const bundle = player?.items && typeof player.items === 'object' ? player.items : {};
  const carriedItems = resolveInventoryItems(bundle, 'carried_items');
  const weapons = resolveInventoryItems(bundle, 'weapons');
  const armor = resolveInventoryItems(bundle, 'armor');
  const equipment = resolveInventoryItems(bundle, 'equipment');
  const clothing = cleanText(player?.body?.clothing ?? player?.clothing ?? '');
  const bodyItems = [...armor, ...equipment];
  if (clothing) {
    bodyItems.push(clothing);
  }

  const usedIds = new Set([...weapons, ...armor, ...equipment].map((item) => item?.id).filter(Boolean));
  const looseCarried = carriedItems.filter((item) => !usedIds.has(item?.id));
  const loadCategory = bundle.load_category ?? player?.load_category ?? null;
  const loadRatio = Number.isFinite(Number(bundle.load_ratio)) ? Number(bundle.load_ratio) : null;
  const totalWeight = Number.isFinite(Number(bundle.total_weight)) ? Number(bundle.total_weight) : null;
  const summaryText = `В руках: ${summarizeLabels(weapons, 2)} · На теле: ${summarizeLabels(bodyItems, 3)} · Груз: ${humanizeLoadCategory(loadCategory)}`;
  const detailMetaText = [
    totalWeight !== null ? `Вес: ${formatCompactWeight(totalWeight)} кг` : null,
    loadCategory ? `Нагрузка: ${humanizeLoadCategory(loadCategory)}` : null,
    loadRatio !== null ? `Коэф.: ${formatCompactWeight(loadRatio)}` : null
  ].filter(Boolean).join(' · ');

  return {
    summaryText,
    detailMetaText,
    totalWeight,
    loadCategory,
    sections: [
      {
        key: 'hands',
        title: 'В руках',
        chipText: 'Оружие',
        lines: formatInventoryLines(weapons),
        emptyText: 'В руках ничего нет'
      },
      {
        key: 'body',
        title: 'На теле',
        chipText: 'Снаряжение',
        lines: formatInventoryLines(bodyItems),
        emptyText: 'На теле ничего нет'
      },
      {
        key: 'carried',
        title: 'При себе',
        chipText: 'Носимое',
        lines: formatInventoryLines(looseCarried),
        emptyText: 'При себе ничего нет'
      }
    ]
  };
}

export {
  buildInventoryView,
  formatInventoryItemLine,
  humanizeLoadCategory
};
