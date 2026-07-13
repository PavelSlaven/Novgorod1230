import { escapeHtml } from '../../shared/escape-html.js';
export function renderProse(screen) { return `<article class="prose"><p>${escapeHtml(screen.main_prose ?? screen.prose ?? '')}</p></article>`; }
