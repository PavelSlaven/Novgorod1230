import { escapeHtml } from '../shared/escape-html.js';

export function renderRows(rows = []) {
  const content = rows.map(([label, value]) => {
    const display = scalar(value);
    return display == null ? '' : `<div class="detail-row"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(display)}</dd></div>`;
  }).join('');
  return content ? `<dl class="detail-list">${content}</dl>` : '';
}

export function renderItems(items, { empty = 'Нет доступных сведений.', item = defaultItem } = {}) {
  const content = (Array.isArray(items) ? items : []).map(item).filter(Boolean).join('');
  return content ? `<ul class="text-list">${content}</ul>` : renderEmpty(empty);
}

export function renderEmpty(message = 'Нет доступных сведений.') {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

export function labelOf(value, keys = ['label', 'name', 'title', 'text', 'message']) {
  if (scalar(value) != null) return scalar(value);
  if (!plain(value)) return null;
  for (const key of keys) {
    const found = scalar(value[key]);
    if (found != null) return found;
  }
  return null;
}

export function scalar(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return null;
}

export function stateLabel(value, labels = {}) {
  const key = scalar(value);
  return key == null ? null : labels[key] ?? key;
}

export function listItem(primary, secondary = null) {
  const title = scalar(primary);
  if (!title) return '';
  const note = scalar(secondary);
  return `<li><span>${escapeHtml(title)}</span>${note ? `<small>${escapeHtml(note)}</small>` : ''}</li>`;
}

function defaultItem(value) { return listItem(labelOf(value)); }
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
