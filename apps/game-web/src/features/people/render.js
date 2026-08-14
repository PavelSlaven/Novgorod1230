import { labelOf, listItem, renderEmpty, renderItems } from '../panel-helpers.js';
export function renderPeoplePanel(screen) {
  const panel = screen.panels?.people;
  if (!panel?.visible) return renderEmpty();
  const data = panel.data ?? {};
  const people = data.people ?? data.visible_npcs ?? data.npcs ?? [];
  return renderItems(people, {
    empty: 'Рядом никого не видно.',
    item: (person) => listItem(
      labelOf(person),
      labelOf(person, ['role', 'activity', 'status', 'state', 'mood'])
    )
  });
}
