import {
  labelOf, listItem, renderEmpty, renderItems, renderRows, scalar, stateLabel
} from '../panel-helpers.js';

const KNOWLEDGE_LABELS = Object.freeze({
  known: 'известно', uncertain: 'сведения неточны'
});
const READINESS_LABELS = Object.freeze({
  ready: 'можно идти',
  requires_frontier_resolution: 'нужно уточнить путь',
  requires_preparation: 'нужна подготовка',
  temporarily_blocked: 'временно недоступно',
  data_gap: 'недостаточно сведений'
});

export function renderRoutesPanel(screen) {
  const panel = screen.panels?.route;
  if (!panel?.visible) return renderEmpty();
  const data = panel.data ?? {};
  const movement = data.movement ?? {};
  const rows = renderRows([
    ['Текущее место', data.current_place],
    ['Состояние пути', movement.message]
  ]);
  const options = renderItems(movement.options, {
    empty: rows ? 'Других известных направлений нет.' : 'Доступные направления не указаны.',
    item: (option) => listItem(labelOf(option), [
      detail('Знание', option.knowledge_state, KNOWLEDGE_LABELS),
      detail('Готовность', option.readiness, READINESS_LABELS),
      conditions(option.observed_conditions)
    ].filter(Boolean).join(' · '))
  });
  return `${rows}${options}`;
}

function detail(label, value, labels) {
  const display = stateLabel(value, labels);
  return display == null ? null : `${label}: ${display}`;
}
function conditions(values) {
  const visible = (Array.isArray(values) ? values : [])
    .map(scalar).filter(Boolean);
  return visible.length ? `Условия: ${visible.join(' · ')}` : null;
}
