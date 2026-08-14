import { escapeHtml } from '../../shared/escape-html.js';
import { labelOf, listItem, renderEmpty, renderItems } from '../panel-helpers.js';
export function renderMapPanel(screen) {
  const panel = screen.panels?.map;
  if (!panel?.visible) return renderEmpty('Карта знаний пока недоступна.');
  const data = panel.data ?? {};
  const nodes = sortedDisplayNodes(
    data.scene_map?.nodes ?? data.known_nodes ?? []
  );
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
  return `${renderSceneMinimap(data.scene_map)}${places}${signals}`;
}

export function renderSceneMinimap(sceneMap) {
  if (!plain(sceneMap) || !Array.isArray(sceneMap.nodes)
      || !Array.isArray(sceneMap.links)) return '';
  const nodes = sortedNodes(sceneMap.nodes);
  if (nodes.length === 0 || nodes.length !== sceneMap.nodes.length
      || new Set(nodes.map(({ token }) => token)).size !== nodes.length) {
    return '';
  }
  const positions = new Map(nodes.map((node, index) => [node.token, {
    x: [18, 50, 82][index % 3], y: 18 + Math.floor(index / 3) * 30
  }]));
  const links = sceneMap.links.filter((link) => validLink(link)
    && positions.has(link.from_token) && positions.has(link.to_token))
    .sort((left, right) => `${left.from_token}\u0000${left.to_token}`
      .localeCompare(`${right.from_token}\u0000${right.to_token}`, 'en'));
  const rows = Math.ceil(nodes.length / 3);
  const height = Math.max(48, 36 + (rows - 1) * 30);
  const linkMarkup = links.map((link) => {
    const from = positions.get(link.from_token);
    const to = positions.get(link.to_token);
    return `<line data-map-link="${escapeHtml(link.from_token)}:${escapeHtml(link.to_token)}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>`;
  }).join('');
  const nodeMarkup = nodes.map((node, index) => {
    const point = positions.get(node.token);
    return `<g data-map-node="${escapeHtml(node.token)}" transform="translate(${point.x} ${point.y})"><circle r="7"></circle><text text-anchor="middle" dy=".35em">${index + 1}</text><title>${escapeHtml(node.label)}</title></g>`;
  }).join('');
  return `<figure class="scene-minimap" data-scene-minimap><svg viewBox="0 0 100 ${height}" role="img" aria-label="Условное расположение известных мест">${linkMarkup}${nodeMarkup}</svg><figcaption>Расположение условно</figcaption></figure>`;
}

function sortedNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : []).filter(validNode).sort(
    (left, right) => left.layout_order - right.layout_order
      || left.token.localeCompare(right.token, 'en')
  );
}

function sortedDisplayNodes(nodes) {
  return [...(Array.isArray(nodes) ? nodes : [])].sort((left, right) => {
    const leftOrder = Number.isSafeInteger(left?.layout_order)
      ? left.layout_order : Number.MAX_SAFE_INTEGER;
    const rightOrder = Number.isSafeInteger(right?.layout_order)
      ? right.layout_order : Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder
      || String(left?.token ?? labelOf(left) ?? '').localeCompare(
        String(right?.token ?? labelOf(right) ?? ''), 'en'
      );
  });
}

function validNode(node) {
  return plain(node) && text(node.token) && text(node.label)
    && Number.isSafeInteger(node.layout_order);
}

function validLink(link) {
  return plain(link) && text(link.from_token) && text(link.to_token);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
