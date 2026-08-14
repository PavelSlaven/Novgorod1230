import {
  labelOf, listItem, renderEmpty, renderItems, renderRows, stateLabel
} from '../panel-helpers.js';

const LOAD_LABELS = Object.freeze({
  light: 'Лёгкая', moderate: 'Умеренная', heavy: 'Тяжёлая',
  overloaded: 'Перегруз'
});
const CONDITION_LABELS = Object.freeze({
  sound: 'исправно', intact: 'целое', worn: 'изношено',
  damaged: 'повреждено', broken: 'сломано'
});
const ACCESS_LABELS = Object.freeze({
  immediate: 'сразу доступно', quick: 'быстрый доступ',
  contained: 'в контейнере', closed_container: 'нужно открыть контейнер',
  restricted: 'ограничен', not_carried: 'не при персонаже'
});
const CLOSURE_LABELS = Object.freeze({
  open: 'открыто', closed: 'закрыто', tied: 'завязано',
  locked: 'заперто', sealed: 'опечатано'
});

export function renderInventoryPanel(screen) {
  const panel = screen.panels?.inventory;
  if (!panel?.visible) return renderEmpty();
  const data = panel.data ?? {};
  const summary = data.summary ?? {};
  const rows = renderRows([
    ['Нагрузка', stateLabel(summary.load_category, LOAD_LABELS)],
    ['Общая масса, г', summary.total_mass_grams],
    ['На пределе нагрузки', summary.at_limit],
    ['Рук занято', summary.hands_used],
    ['Рук всего', summary.hands_total],
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
    item: ({ zone, value }) => listItem(labelOf(value), [
      zone,
      detail('Состояние', value?.condition, CONDITION_LABELS),
      detail('Доступ', value?.access, ACCESS_LABELS),
      detail('Закрытие', value?.closure_state, CLOSURE_LABELS)
    ].filter(Boolean).join(' · '))
  });
  const warnings = Array.isArray(data.warnings) && data.warnings.length
    ? renderItems(data.warnings, { empty: '', item: (warning) => listItem(labelOf(warning)) })
    : '';
  return `${rows}${items}${warnings}`;
}

function detail(label, value, labels) {
  const display = stateLabel(value, labels);
  return display == null ? null : `${label}: ${display}`;
}
