import { labelOf, listItem, renderEmpty, renderItems } from '../panel-helpers.js';
export function renderJournalPanel(screen) {
  const panel = screen.panels?.journal;
  if (!panel?.visible) return renderEmpty('Летопись пока пуста.');
  const data = panel.data ?? {};
  const entries = data.entries ?? data.events ?? data.memories ?? data.notes ?? [];
  return renderItems(entries, {
    empty: 'Летопись пока пуста.',
    item: (entry) => listItem(labelOf(entry), labelOf(entry, ['time_label', 'place_label', 'date']))
  });
}
