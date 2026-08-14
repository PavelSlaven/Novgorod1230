import { renderEmpty, renderRows } from '../panel-helpers.js';
export function renderCharacterPanel(screen) {
  const panel = screen.panels?.character;
  if (!panel?.visible) return renderEmpty();
  const data = panel.data ?? {};
  return renderRows([
    ['Имя', data.name], ['Роль', data.role], ['Здоровье', data.health],
    ['Бодрость', data.energy], ['Сытость', data.satiety],
    ['Состояние', data.status]
  ]) || renderEmpty();
}
