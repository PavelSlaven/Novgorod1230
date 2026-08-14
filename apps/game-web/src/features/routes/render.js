import { labelOf, listItem, renderEmpty, renderItems, renderRows } from '../panel-helpers.js';
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
    item: (option) => listItem(labelOf(option),
      Array.isArray(option.observed_conditions) ? option.observed_conditions.join(' · ') : null)
  });
  return `${rows}${options}`;
}
