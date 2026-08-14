import { labelOf, listItem, renderEmpty, renderItems, renderRows } from '../panel-helpers.js';
export function renderInventoryPanel(screen) {
  const panel = screen.panels?.inventory;
  if (!panel?.visible) return renderEmpty();
  const data = panel.data ?? {};
  const summary = data.summary ?? {};
  const rows = renderRows([
    ['Нагрузка', summary.load_category],
    ['Общая масса, г', summary.total_mass_grams],
    ['Рук занято', summary.hands_used],
    ['Рук свободно', summary.hands_free]
  ]);
  const zones = data.zones ?? {};
  const entries = [
    ['В руках', zones.hands], ['На теле', zones.worn_quick],
    ['Снаряжение', zones.equipped], ['Быстрые контейнеры', zones.quick_containers],
    ['Основной контейнер', zones.primary_container ? [zones.primary_container] : []],
    ['Внешний груз', zones.external_load], ['Вещи', data.items]
  ].flatMap(([zone, values]) => (Array.isArray(values) ? values : []).map((value) => ({ zone, value })));
  const items = renderItems(entries, {
    empty: rows ? 'Других доступных сведений о ноше нет.' : 'Сведения о ноше отсутствуют.',
    item: ({ zone, value }) => listItem(labelOf(value), zone)
  });
  const warnings = Array.isArray(data.warnings) && data.warnings.length
    ? renderItems(data.warnings, { empty: '', item: (warning) => listItem(labelOf(warning)) })
    : '';
  return `${rows}${items}${warnings}`;
}
