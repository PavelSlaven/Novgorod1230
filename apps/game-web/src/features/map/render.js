import { labelOf, listItem, renderEmpty, renderItems } from '../panel-helpers.js';
export function renderMapPanel(screen) {
  const panel = screen.panels?.map;
  if (!panel?.visible) return renderEmpty('Карта знаний пока недоступна.');
  const data = panel.data ?? {};
  const nodes = data.scene_map?.nodes ?? data.known_nodes ?? [];
  const places = renderItems(nodes, {
    empty: 'Известные места не указаны.',
    item: (node) => listItem(labelOf(node), labelOf(node, ['certainty']))
  });
  const signals = Array.isArray(data.world_signals) && data.world_signals.length
    ? renderItems(data.world_signals, {
        empty: '',
        item: (signal) => listItem(
          labelOf(signal, ['approximate_area', 'label']),
          labelOf(signal, ['approximate_direction'])
        )
      })
    : '';
  return `${places}${signals}`;
}
