import { escapeHtml } from '../../shared/escape-html.js';
import { validCurrentTask } from '../../shared/scene-affordances.js';

export function renderCurrentTask(screen) {
  const panel = screen.panels?.journal;
  const currentTask = panel?.data?.current_task;
  if (panel?.visible !== true || !validCurrentTask(currentTask)) return '';
  return `<section class="current-task" data-current-task><span>Текущая задача</span><p>${escapeHtml(currentTask.trim())}</p></section>`;
}
