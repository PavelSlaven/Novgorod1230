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

function formatCompactWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  const rounded = Math.round(number * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0+$/, '');
}

function sumPropertyWeight(items) {
  let total = 0;
  let hasWeight = false;

  for (const item of Array.isArray(items) ? items : []) {
    const weight = Number(item?.weight);
    if (!Number.isFinite(weight)) continue;
    total += weight;
    hasWeight = true;
  }

  return hasWeight ? total : null;
}

function pluralizeObjects(count) {
  const value = Math.abs(Number(count) || 0);
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return 'предмет';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'предмета';
  return 'предметов';
}

function getItemLabel(item) {
  if (item == null) return '';
  if (typeof item === 'string') return cleanText(item);
  if (typeof item !== 'object') return cleanText(item);
  return cleanText(item.label ?? item.name ?? item.title ?? item.id ?? '');
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

function humanizePlausibility(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return `${Math.max(0, Math.min(5, Math.round(numeric)))}/5`;
  }
  return cleanText(value);
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
      parts.push(`${label} ${humanizePlausibility(facet)}`);
    }
    return parts.length ? parts.join(', ') : 'без оценки';
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

function humanizeAccess(value) {
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
  return map[cleanText(value).toLowerCase()] ?? cleanText(value);
}

function describePropertyItem(item) {
  if (item == null) return 'неизвестно';
  if (typeof item === 'string') return cleanText(item);
  if (typeof item !== 'object') return cleanText(item);

  const owner = cleanText(item.ownerName ?? item.owner_id ?? item.ownerId);
  const holder = cleanText(item.holderName ?? item.holder_id ?? item.holderId);
  const rights = uniqueStrings(item.rights, 4);
  const contentsCount = visibleContentsCount(item);
  const parts = [
    getItemLabel(item) || 'вещь',
    item.type ? `класс ${cleanText(item.type)}` : null,
    item.material ? `материал ${cleanText(item.material)}` : null,
    item.condition ?? item.state ? `состояние ${cleanText(item.condition ?? item.state)}` : null,
    item.size ? `размер ${cleanText(item.size)}` : null,
    Number.isFinite(Number(item.weight)) ? `вес ${formatCompactWeight(item.weight)} кг` : null,
    item.locationId ? `место ${cleanText(item.locationId)}` : null,
    item.containerId ? `контейнер ${cleanText(item.containerId)}` : null,
    item.placement ? `размещение ${cleanText(item.placement)}` : null,
    (item.access || item.placement) ? `доступ ${humanizePhysicalAccess(item) || humanizeAccess(item.access)}` : null,
    item.legalStatus ? `правовой статус ${humanizeLegalStatus(item.legalStatus)}` : null,
    item.plausibility != null ? `правдоподобие ${humanizePlausibility(item.plausibility)}` : null,
    item.function ? `функция ${cleanText(item.function)}` : null,
    item.value ? `ценность ${humanizeValue(item.value)}` : null,
    item.risk ? `риск ${humanizeRisk(item.risk)}` : null,
    item.visibility ? `видимость ${humanizeVisibility(item.visibility)}` : null,
    item.discoverability != null ? `обнаружимость ${humanizeDiscoverability(item.discoverability)}` : null,
    rights.length ? `права ${rights.join(', ')}` : null,
    owner ? `владелец ${owner}` : null,
    holder && holder !== owner ? `держатель ${holder}` : null,
    contentsCount > 0 ? `содержит ${contentsCount}` : null
  ];

  return parts.filter(Boolean).join(' · ');
}

function buildPropertyView(ledger = []) {
  const list = Array.isArray(ledger) ? ledger : [];
  const totalWeight = sumPropertyWeight(list);
  const items = list.slice(0, 12).map((item) => {
    const label = getItemLabel(item) || 'вещь';
    const owner = cleanText(item?.ownerName ?? item?.owner_id ?? item?.ownerId);
    const holder = cleanText(item?.holderName ?? item?.holder_id ?? item?.holderId);
    const meta = [
      owner ? `владелец ${owner}` : null,
      holder && holder !== owner ? `держатель ${holder}` : null,
      item?.legalStatus ? `статус ${humanizeLegalStatus(item.legalStatus)}` : null,
      item?.risk ? `риск ${humanizeRisk(item.risk)}` : null
    ].filter(Boolean).join(' · ');
    const contentsCount = visibleContentsCount(item);
    const lines = [
      item?.locationId ? `место ${cleanText(item.locationId)}` : null,
      item?.containerId ? `контейнер ${cleanText(item.containerId)}` : null,
      item?.placement ? `размещение ${cleanText(item.placement)}` : null,
      item?.access ? `доступ ${humanizeAccess(item.access)}` : null,
      item?.legalStatus ? `правовой статус ${humanizeLegalStatus(item.legalStatus)}` : null,
      item?.plausibility != null ? `правдоподобие ${humanizePlausibility(item.plausibility)}` : null,
      item?.risk ? `риск ${humanizeRisk(item.risk)}` : null,
      item?.function ? `функция ${cleanText(item.function)}` : null,
      item?.value ? `ценность ${humanizeValue(item.value)}` : null,
      item?.visibility ? `видимость ${humanizeVisibility(item.visibility)}` : null,
      item?.discoverability != null ? `обнаружимость ${humanizeDiscoverability(item.discoverability)}` : null,
      item?.weight != null ? `вес ${formatCompactWeight(item.weight)} кг` : null,
      item?.type ? `класс ${cleanText(item.type)}` : null,
      item?.material ? `материал ${cleanText(item.material)}` : null,
      item?.condition ?? item?.state ? `состояние ${cleanText(item.condition ?? item.state)}` : null,
      Array.isArray(item?.rights) && item.rights.length > 0 ? `права ${uniqueStrings(item.rights, 4).join(', ')}` : null,
      contentsCount > 0 ? `содержит ${contentsCount}` : null
    ].filter(Boolean);

    return {
      raw: item,
      label,
      meta,
      lines,
      summary: describePropertyItem(item)
    };
  });

  const summaryParts = items.length > 0
    ? [`Имущество: ${items.length} ${pluralizeObjects(items.length)}`]
    : ['Имущества нет'];
  const totalWeightText = totalWeight !== null ? `Вес: ${formatCompactWeight(totalWeight)} кг` : '';
  if (totalWeightText) {
    summaryParts.push(totalWeightText);
  }
  if (items.length > 0) {
    summaryParts.push('открыть окно');
  }

  const summaryText = summaryParts.join(' · ');
  const detailMetaText = [
    totalWeightText || null,
    items.length > 0 ? `Предметов: ${items.length}` : null
  ].filter(Boolean).join(' · ');

  return {
    summaryText,
    detailMetaText,
    totalWeight,
    items
  };
}

export {
  buildPropertyView,
  describePropertyItem
};

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
