import { renderActions } from '../../apps/game-web/src/features/actions/render.js';
import { renderCharacterPanel } from '../../apps/game-web/src/features/character/render.js';
import { renderInventoryPanel } from '../../apps/game-web/src/features/inventory/render.js';
import { renderMapPanel } from '../../apps/game-web/src/features/map/render.js';
import { renderPeoplePanel } from '../../apps/game-web/src/features/people/render.js';
import { renderRoutesPanel } from '../../apps/game-web/src/features/routes/render.js';

const LABEL_KEYS = ['display_label', 'label', 'name', 'title', 'text'];
const LATIN = /[A-Za-z]/u;
const CYRILLIC = /[А-Яа-яЁё]/u;
const SPACE_MARKER = /(?:<\|[^|]+\|>|\\(?:n|r|t|s|u0020)|&(?:nbsp|ensp|emsp);|\[\s*(?:SPACE|TAB|NEWLINE|пробел|табуляция|перенос\s+строки)\s*\]|\u200b)/iu;
const SERVICE_TOKEN = /(?:<\|[^|]+\|>|\\(?:n|r|t|s)|&(?:nbsp|ensp|emsp);|\b[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+\b|\b[a-z][a-z0-9]{2,}\b|\b(?:id|ref|token|code)\s*[:=#]\s*[\w.-]+)/iu;

export function collectPlayerVisibility(screen, {
  openingInput = null, currentVisibleContext = null
} = {}) {
  const view = {
    places: [], exits: [], carried_items: [], scene_items: [], people: [],
    natural_objects: [], natural_facts: [], scene_facts: [],
    rendered_texts: [], synthetic_narration: []
  };
  const addText = (bucket, source, path, value) => {
    const text = scalar(value);
    if (text !== undefined) bucket.push({ source, path, text });
  };
  const addEntity = (bucket, source, path, kind, value, keys = LABEL_KEYS,
    { displayPeopleDetails = false } = {}) => {
    const label = labelOf(value, keys);
    const entry = { source, path, kind, label };
    if (displayPeopleDetails && value && typeof value === 'object'
        && !Array.isArray(value)) {
      const appearance = scalar(value.appearance);
      const status = scalar(value.role ?? value.activity ?? value.status
        ?? value.state ?? value.mood);
      if (appearance !== undefined) entry.appearance = appearance;
      if (status !== undefined) entry.status = status;
    }
    bucket.push(entry);
    addText(view.rendered_texts, source, `${path}.label`, label);
    if (entry.appearance !== undefined) addText(view.rendered_texts, source,
      `${path}.appearance`, entry.appearance);
    if (entry.status !== undefined) addText(view.rendered_texts, source,
      `${path}.status`, entry.status);
    return entry;
  };

  const visible = screen?.visible_context ?? {};
  const context = { ...visible, ...(screen?.presentation_context ?? {}) };
  const place = context.location_label ?? context.place;
  if (place !== undefined && place !== null) {
    addEntity(view.places, 'screen', 'presentation_context.place', 'place', place,
      ['location_label', 'label', 'name', 'title', 'place']);
  }

  const routePanel = screen?.panels?.route;
  const route = routePanel?.visible === true ? routePanel.data ?? {} : {};
  if (routePanel?.visible === true && route.current_place !== undefined) {
    addEntity(view.places, 'screen', 'panels.route.current_place', 'place',
      route.current_place);
  }
  const movement = route.movement ?? {};
  addText(view.rendered_texts, 'screen', 'panels.route.movement.message',
    movement.message);
  for (const [index, option] of (Array.isArray(movement.options)
    ? movement.options : []).entries()) {
    addEntity(view.exits, 'screen', `panels.route.movement.options[${index}]`,
      'exit', option, ['label']);
    for (const [conditionIndex, condition] of (Array.isArray(option?.observed_conditions)
      ? option.observed_conditions : []).entries()) {
      addText(view.rendered_texts, 'screen',
        `panels.route.movement.options[${index}].observed_conditions[${conditionIndex}]`,
        condition);
    }
  }

  const inventoryPanel = screen?.panels?.inventory;
  const inventory = inventoryPanel?.visible === true ? inventoryPanel.data ?? {} : {};
  const zones = inventory.zones ?? {};
  for (const zone of ['hands', 'worn_quick', 'equipped', 'quick_containers',
    'primary_container', 'external_load']) {
    const entries = Array.isArray(zones[zone]) ? zones[zone]
      : zone === 'primary_container' && zones[zone] ? [zones[zone]] : [];
    for (const [index, item] of entries.entries()) {
      addEntity(view.carried_items, 'screen', `panels.inventory.zones.${zone}[${index}]`,
        'item', item);
    }
  }
  for (const [index, item] of (Array.isArray(inventory.items) ? inventory.items : []).entries()) {
    addEntity(view.carried_items, 'screen', `panels.inventory.items[${index}]`,
      'item', item);
  }
  for (const [index, warning] of (Array.isArray(inventory.warnings)
    ? inventory.warnings : []).entries()) {
    addText(view.rendered_texts, 'screen', `panels.inventory.warnings[${index}]`,
      labelOf(warning));
  }

  const peoplePanel = screen?.panels?.people;
  const peopleData = peoplePanel?.visible === true ? peoplePanel.data ?? {} : {};
  const panelPeople = peopleData.people ?? peopleData.visible_npcs ?? peopleData.npcs ?? [];
  for (const [index, person] of (Array.isArray(panelPeople) ? panelPeople : []).entries()) {
    addEntity(view.people, 'screen', `panels.people.data.people[${index}]`, 'person',
      person, ['display_label', 'label', 'name', 'title'],
      { displayPeopleDetails: true });
  }

  for (const [panel, render] of [
    ['route', renderRoutesPanel], ['inventory', renderInventoryPanel],
    ['people', renderPeoplePanel], ['map', renderMapPanel],
    ['character', renderCharacterPanel]
  ]) {
    if (screen?.panels?.[panel]?.visible === true) {
      addText(view.rendered_texts, 'screen', `rendered.panels.${panel}`,
        htmlText(render(screen)));
    }
  }
  const actionMarkup = renderActions(screen ?? {});
  for (const [section, path] of [['suggested-actions', 'suggested_actions'],
    ['movement-shortcuts', 'movement_shortcuts']]) {
    const match = actionMarkup.match(new RegExp(
      `<div class="${section}"[^>]*>([\\s\\S]*?)<\\/div>`, 'u'));
    if (match) addText(view.rendered_texts, 'screen',
      `rendered.actions.${path}`, htmlText(match[1]));
  }

  const mapData = screen?.panels?.map?.visible === true
    ? screen.panels.map.data ?? {} : {};
  const mapPlaces = mapData.scene_map?.nodes ?? mapData.known_nodes ?? [];
  for (const [index, placeNode] of (Array.isArray(mapPlaces) ? mapPlaces : []).entries()) {
    addEntity(view.places, 'screen', `panels.map.nodes[${index}]`, 'known_place',
      placeNode);
  }

  collectVisibleContext(visible, 'screen', 'visible_context', view, addEntity, addText);
  if (currentVisibleContext && typeof currentVisibleContext === 'object') {
    collectVisibleContext(currentVisibleContext, 'current_perception',
      'current_visible_context', view, addEntity, addText);
  }

  const openingFacts = openingInput?.сцена?.факты;
  if (Array.isArray(openingFacts)) {
    for (const [index, fact] of openingFacts.entries()) {
      const text = typeof fact === 'string' ? fact : fact?.текст;
      if (typeof text !== 'string') continue;
      const carried = text.match(/^При вас:\s*(.+?)\.?$/iu);
      if (carried) {
        addEntity(view.carried_items, 'opening_input', `сцена.факты[${index}]`,
          'item', carried[1], ['label']);
      } else {
        addText(view.scene_facts, 'opening_input', `сцена.факты[${index}]`, text);
      }
    }
  }
  for (const [index, person] of (Array.isArray(openingInput?.сцена?.персонажи)
    ? openingInput.сцена.персонажи : []).entries()) {
    addEntity(view.people, 'opening_input', `сцена.персонажи[${index}]`,
      'person', person, ['имя']);
    for (const [factIndex, fact] of (Array.isArray(person?.факты)
      ? person.факты : []).entries()) {
      addText(view.scene_facts, 'opening_input',
        `сцена.персонажи[${index}].факты[${factIndex}]`,
        typeof fact === 'string' ? fact : fact?.текст);
    }
  }

  const prose = scalar(screen?.main_prose ?? screen?.prose);
  if (prose !== undefined) view.synthetic_narration.push({
    source: 'screen', synthetic: true, text: prose
  });
  return view;
}

function collectVisibleContext(context, source, root, view, addEntity, addText) {
  addText(view.natural_facts, source, `${root}.visible_scene`, context.visible_scene);
  for (const [index, fact] of (Array.isArray(context.sensory_details)
    ? context.sensory_details : []).entries()) {
    addText(view.natural_facts, source, `${root}.sensory_details[${index}]`, fact);
  }
  for (const [index, object] of (Array.isArray(context.visible_objects)
    ? context.visible_objects : []).entries()) {
    const kind = object?.entity_ref?.entity_kind;
    const bucket = kind === 'item' ? view.scene_items
      : ['scene_movement_edge', 'g4_directional_exit', 'g5_site_connection'].includes(kind)
        ? view.exits : view.natural_objects;
    addEntity(bucket, source, `${root}.visible_objects[${index}]`,
      kind === 'item' ? 'item'
        : ['scene_movement_edge', 'g4_directional_exit', 'g5_site_connection'].includes(kind)
          ? 'exit' : 'object', object, ['display_label', 'label', 'name', 'title']);
  }
  for (const [index, person] of (Array.isArray(context.visible_npc)
    ? context.visible_npc : []).entries()) {
    addEntity(view.people, source, `${root}.visible_npc[${index}]`, 'person', person,
      ['display_label', 'label', 'name', 'title']);
  }
}

export function visibilityViolations(view, { toponymRoots = [] } = {}) {
  const violations = [];
  const inspectText = (path, value, { label = false, item = false } = {}) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) {
      if (label) violations.push({ rule: 'D72', path, reason: 'пустая подпись' });
      return;
    }
    if ((label && !CYRILLIC.test(text)) || LATIN.test(text)
        || SPACE_MARKER.test(text) || serviceCode(text)) {
      violations.push({ rule: 'D72', path, reason: 'служебная или не русская подпись' });
    }
    if (item && /^(?:неизвестн\p{L}*\s+)?(?:предмет\p{L}*|вещ\p{L}*)[.!?…,:;\s]*$/iu.test(text)) {
      violations.push({ rule: 'D92', path, reason: 'родовое имя вещи' });
    }
    if (path.startsWith('places[') && genericPlace(text)) {
      violations.push({ rule: 'D72', path, reason: 'родовое название места' });
    }
    if (containsToponym(text, toponymRoots)) {
      violations.push({ rule: 'D106', path, reason: 'название места раскрывает топоним' });
    }
  };

  for (const key of ['places', 'exits', 'carried_items', 'scene_items',
    'people', 'natural_objects']) {
    for (const [index, entity] of (Array.isArray(view?.[key]) ? view[key] : []).entries()) {
      const path = `${key}[${index}]`;
      inspectText(`${path}.label`, entity?.label, {
        label: true, item: key === 'carried_items' || key === 'scene_items'
      });
      for (const field of ['appearance', 'status']) {
        if (entity?.[field] !== undefined) inspectText(`${path}.${field}`, entity[field]);
      }
    }
  }
  for (const key of ['natural_facts', 'scene_facts', 'rendered_texts']) {
    for (const entry of Array.isArray(view?.[key]) ? view[key] : []) {
      inspectText(entry.path, entry.text);
    }
  }
  return violations;
}

export function sanitizeVisibility(view) {
  const clean = (value) => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key,
        ['text', 'label', 'appearance', 'status'].includes(key)
          && typeof child === 'string' && (serviceCode(child) || LATIN.test(child))
          ? '[служебный текст скрыт]' : clean(child)]));
    }
    return value;
  };
  return clean(view);
}

function scalar(value) {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return undefined;
}

function labelOf(value, keys) {
  if (typeof value === 'string') return scalar(value) ?? null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  for (const key of keys) {
    const label = scalar(value[key]);
    if (label !== undefined) return label;
  }
  return null;
}

function serviceCode(text) {
  return SPACE_MARKER.test(text) || SERVICE_TOKEN.test(text);
}

function htmlText(markup) {
  return String(markup ?? '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/giu, ' ')
    .replace(/<!--[\s\S]*?-->/gu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&(#(?:x[\da-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/giu,
      (_, entity) => decodeEntity(entity))
    .replace(/\s+/gu, ' ').trim();
}

function decodeEntity(entity) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  if (Object.hasOwn(named, entity.toLowerCase())) return named[entity.toLowerCase()];
  const number = entity[0] === '#'
    ? Number.parseInt(entity[1]?.toLowerCase() === 'x' ? entity.slice(2) : entity.slice(1),
      entity[1]?.toLowerCase() === 'x' ? 16 : 10)
    : NaN;
  return Number.isFinite(number) && number >= 0 && number <= 0x10ffff
    ? String.fromCodePoint(number) : `&${entity};`;
}

function genericPlace(text) {
  return /^(?:(?:окрестност\p{L}*|мест\p{L}*|локаци\p{L}*|неизвестн\p{L}*\s+мест\p{L}*|безымянн\p{L}*\s+мест\p{L}*)[.!?…,:;\s]*)$/iu.test(text.trim());
}

function containsToponym(text, roots) {
  for (const rawRoot of roots) {
    const root = typeof rawRoot === 'string' ? rawRoot.trim() : '';
    if (!root || /^новгород$/iu.test(root)) continue;
    const escaped = root.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const expression = new RegExp(`(?:^|[^А-Яа-яЁё])${escaped}[А-Яа-яЁё]*(?=$|[^А-Яа-яЁё])`, 'iu');
    if (expression.test(text)) return true;
  }
  return false;
}
