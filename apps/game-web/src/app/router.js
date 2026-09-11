import { renderProse } from '../features/prose/render.js';
import { renderActions } from '../features/actions/render.js';
import { renderCharacterPanel } from '../features/character/render.js';
import { renderInventoryPanel } from '../features/inventory/render.js';
import { renderPeoplePanel } from '../features/people/render.js';
import { renderRoutesPanel } from '../features/routes/render.js';
import { renderMapPanel } from '../features/map/render.js';
import { renderJournalPanel } from '../features/journal/render.js';
import { renderDiagnostics } from '../features/diagnostics/render.js';
import { renderConversationPortrait } from
  '../features/conversation-portrait/render.js';
import { renderCurrentTask } from '../features/current-task/render.js';
import { renderChecks } from '../features/checks/render.js';
import { renderLandscape } from '../features/landscape/render.js';
import { escapeHtml } from '../shared/escape-html.js';

const PANEL_META = Object.freeze([
  ['character', 'Персонаж'], ['inventory', 'Ноша'], ['people', 'Люди'],
  ['route', 'Путь'], ['map', 'Карта'], ['journal', 'Летопись']
]);
const TURN_PROGRESS_LABELS = Object.freeze({
  accepted: 'Ход принят',
  understanding_action: 'Разбираем действие',
  resolving_world: 'Определяем последствия',
  saving_result: 'Сохраняем результат',
  preparing_screen: 'Готовим сцену',
  recovering_saved_result: 'Восстанавливаем сохранённый результат'
});

export function renderScreen(screen, options = {}) {
  if (!screen) return renderLanding(options);
  const openingReady = options.openingStatus !== 'pending'
    && options.openingStatus !== 'failed';
  const disabled = options.loading === true || !openingReady;
  const navigationDisabled = options.loading === true
    || options.openingStatus === 'pending';
  return `<div class="game-app"><header class="game-header"><button class="brand-button" type="button" data-return-start${navigationDisabled ? ' disabled' : ''}><span>Хроника</span><strong>Русь</strong></button><div class="header-actions"><button class="icon-button" type="button" data-llm-settings-open aria-label="Настройки LLM">⚙</button><button class="icon-button" type="button" data-theme-toggle aria-label="Сменить тему">${themeIcon(options.theme)}</button></div></header><main class="game-screen" data-screen-schema="${escapeHtml(screen.schema)}">${renderContext(screen)}${renderPanelNavigation(screen, options)}${renderSceneViewport(screen)}<section class="reader-column">${renderCurrentTask(screen)}${renderProse(screen)}${renderChecks(screen)}${renderOpeningState(options)}${renderActions(screen, { disabled, draft: options.turnDraft, pendingTurn: options.pendingTurn })}</section></main>${renderOverlay(screen, options)}</div>`;
}

export function renderAppState(state) {
  const options = {
    developerMode: state.developerMode,
    scenarios: state.scenarios,
    rememberedPartyId: state.rememberedPartyId,
    theme: state.theme,
    loading: state.status === 'loading',
    error: state.error,
    activeOverlay: state.activeOverlay,
    openingStatus: state.opening?.status,
    newGameDraft: state.newGameDraft,
    turnDraft: state.turnDraft,
    pendingTurn: state.pendingTurn,
    turnProgress: state.turnProgress,
    llmSettings: state.llmSettings,
    llmSettingsDraft: state.llmSettingsDraft,
    llmSettingsMessage: state.llmSettingsMessage
  };
  const content = state.view === 'new_game'
    ? renderNewGame(options)
    : state.view === 'game'
      ? renderScreen(state.screen, options)
      : renderLanding(options);
  return `${content}${state.view === 'game' ? '' : renderOverlay(state.screen, options)}${renderStatus(state)}`;
}

function renderLanding({ rememberedPartyId = null, theme = 'light',
  loading = false, llmSettings: settings = null } = {}) {
  const blocked = settings?.mode === 'local'
    && settings?.local_runtime?.ready === false;
  const disabled = loading || blocked ? ' disabled' : '';
  const diagnostic = blocked
    ? `<p class="error" role="alert">Локальная Gemma не может быть запущена на этом ПК: ${escapeHtml((settings.local_runtime.reasons ?? []).join(' '))} Выбери внешний OpenAI-compatible provider в настройках LLM.</p>` : '';
  return `<main class="start-screen"><div class="theme-corner"><button class="icon-button" type="button" data-llm-settings-open aria-label="Настройки LLM">⚙</button><button class="icon-button" type="button" data-theme-toggle aria-label="Сменить тему">${themeIcon(theme)}</button></div><section class="start-card" aria-labelledby="chronicle-title"><p class="eyebrow">Хроника</p><h1 id="chronicle-title">Русь, лета 6738</h1><p class="start-description">Текстовое путешествие по Руси XIII века. Ты ведёшь одного человека; мир ведёт себя сам.</p>${diagnostic}<div class="start-actions"><button class="button-primary" type="button" data-start-new-game${disabled}>Новая игра</button>${rememberedPartyId ? `<button class="button-secondary" type="button" data-continue-party${disabled}>Продолжить</button>` : ''}</div><button class="theme-text" type="button" data-theme-toggle>Сменить освещение</button></section></main>`;
}

function renderNewGame({ scenarios = [], newGameDraft = '', theme = 'light',
  loading = false } = {}) {
  const scenarioButtons = scenarios.map((scenario) => {
    const unavailable = scenario.available === false;
    return `<article class="scenario-card"><div><h3>${escapeHtml(scenario.title)}</h3><p>${escapeHtml(scenario.description)}</p></div><button class="button-secondary" type="button" data-scenario-id="${escapeHtml(scenario.scenario_id)}"${unavailable || loading ? ' disabled' : ''}>Начать</button></article>`;
  }).join('');
  const disabled = loading ? ' disabled' : '';
  return `<div class="new-game-page"><header class="game-header"><button class="brand-button" type="button" data-return-start${disabled}><span>Хроника</span><strong>Русь</strong></button><div class="header-actions"><button class="icon-button" type="button" data-llm-settings-open aria-label="Настройки LLM">⚙</button><button class="icon-button" type="button" data-theme-toggle aria-label="Сменить тему">${themeIcon(theme)}</button></div></header><main class="new-game-screen" data-new-game-screen><section class="new-game-intro"><p class="eyebrow">Новая запись</p><h1>Кем ты окажешься?</h1><p>Опиши начало своими словами. Игра выберет ближайшую опубликованную историческую рамку; дальше ты действуешь свободно.</p></section><form class="new-game-form" data-new-game-form><label for="start-text">Начало истории</label><textarea id="start-text" name="start_text" required placeholder="Например: молодой приказчик приходит в себя после крушения…"${disabled}>${escapeHtml(newGameDraft)}</textarea><div class="form-actions"><button class="button-quiet" type="button" data-return-start${disabled}>Назад</button><button class="button-primary" type="submit"${disabled}>Начать историю</button></div></form><section class="scenario-section"><div class="section-heading"><p class="eyebrow">Готовые истории</p><h2>Сценарии</h2></div><div class="scenario-list">${scenarioButtons || '<p class="empty-state">Опубликованных сценариев сейчас нет.</p>'}</div></section></main></div>`;
}

function renderContext(screen) {
  const context = { ...screen.visible_context, ...screen.presentation_context };
  const character = screen.panels?.character?.visible === true
    ? screen.panels.character.data : null;
  const identity = scalar(character?.name) == null ? null
    : [scalar(character.name), scalar(character.role)].filter(Boolean).join(', ');
  const candidates = [
    ['Вы', identity],
    ['Место', context.location_label ?? context.place],
    ['Дата', context.date_label ?? context.calendar],
    ['Время', context.time_label ?? context.day_part_label],
    ['Ход занял', context.turn_elapsed_label],
    ['Погода', context.weather_label],
    ['Состояние', context.status_label]
  ];
  const entries = candidates.filter(([, value]) => scalar(value) != null)
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(scalar(value))}</dd></div>`).join('');
  return entries ? `<dl class="context-strip">${entries}</dl>` : '';
}

function renderPanelNavigation(screen, { developerMode = false } = {}) {
  const buttons = PANEL_META.map(([kind, label]) => {
    const available = screen.panels?.[kind]?.visible === true;
    return `<button type="button" data-overlay-open="${kind}"${available ? '' : ' disabled'}>${escapeHtml(label)}</button>`;
  }).join('');
  const diagnostic = developerMode && screen.panels?.diagnostic?.visible === true
    ? '<button type="button" data-overlay-open="diagnostic">Диагностика</button>' : '';
  return `<nav class="panel-navigation" aria-label="Разделы партии">${buttons}${diagnostic}</nav>`;
}

function renderSceneViewport(screen) {
  return `<div class="scene-viewport-shell">${renderLandscape(screen)}${renderConversationPortrait(screen)}<canvas data-scene-weather-canvas width="1280" height="720" aria-hidden="true"></canvas></div>`;
}

function renderOpeningState({ openingStatus, error } = {}) {
  if (openingStatus === 'pending') {
    return '<div class="opening-status" role="status">Подтверждаем вступление в историю…</div>';
  }
  if (openingStatus === 'failed') {
    return `<div class="opening-status opening-status-error"><p>${escapeHtml(error?.message ?? 'Не удалось подтвердить вступление.')}</p><button class="button-secondary" type="button" data-retry-opening-ack>Повторить</button></div>`;
  }
  return '';
}

function renderOverlay(screen, { activeOverlay, developerMode = false, llmSettings, llmSettingsDraft, llmSettingsMessage } = {}) {
  if (activeOverlay === 'llm_settings') return renderLlmSettingsOverlay(llmSettingsDraft ?? llmSettings, llmSettings, llmSettingsMessage);
  if (!activeOverlay || screen.panels?.[activeOverlay]?.visible !== true) return '';
  const title = activeOverlay === 'diagnostic'
    ? 'Диагностика'
    : PANEL_META.find(([kind]) => kind === activeOverlay)?.[1];
  if (!title) return '';
  const body = panelBody(activeOverlay, screen, { developerMode });
  return `<div class="overlay-backdrop" data-overlay-backdrop><section class="overlay-panel" data-overlay-panel role="dialog" aria-modal="true" aria-labelledby="overlay-title" tabindex="-1"><header><p class="eyebrow">Сведения партии</p><h2 id="overlay-title">${escapeHtml(title)}</h2><button class="overlay-close" type="button" data-overlay-close aria-label="Закрыть">×</button></header><div class="overlay-body">${body}</div></section></div>`;
}

function renderLlmSettingsOverlay(settings = {}, activeSettings = {}, message = null) {
  const mode = ['local', 'custom'].includes(settings?.mode)
    ? settings.mode : 'local';
  const configured = true;
  const baseUrl = escapeHtml(settings?.base_url ?? '');
  const model = escapeHtml(settings?.model ?? '');
  const disabled = configured ? '' : ' disabled';
  const note = message ? `<p class="llm-settings-message${message.kind === 'error' ? ' error' : ''}" role="${message.kind === 'error' ? 'alert' : 'status'}">${escapeHtml(message.text)}</p>` : '';
  return `<div class="overlay-backdrop" data-overlay-backdrop><section class="overlay-panel" data-overlay-panel role="dialog" aria-modal="true" aria-labelledby="overlay-title" tabindex="-1"><header><p class="eyebrow">Настройки</p><h2 id="overlay-title">LLM</h2><button class="overlay-close" type="button" data-overlay-close aria-label="Закрыть">×</button></header><div class="overlay-body"><form class="llm-settings-form" data-llm-settings-form><fieldset><legend>Режим</legend><label><input type="radio" name="mode" value="local"${mode === 'local' ? ' checked' : ''}> Локальная Gemma 4 (по умолчанию)</label><label><input type="radio" name="mode" value="custom"${mode === 'custom' ? ' checked' : ''}> Свой OpenAI-compatible endpoint</label></fieldset><label class="input-label">API base URL<input name="base_url" type="url" value="${baseUrl}" placeholder="http://127.0.0.1:8000/v1"${disabled}></label><label class="input-label">Model<input name="model" value="${model}"${disabled}></label><label class="input-label">API key <small>необязательно${activeSettings?.api_key_present ? ', ключ сохранён на этом ПК' : ''}</small><input name="api_key" type="password" autocomplete="off"${disabled}></label>${note}<div class="form-actions"><button class="button-secondary" type="submit" name="llm_action" value="test"${disabled}>Проверить</button><button class="button-primary" type="submit" name="llm_action" value="apply">Применить</button><button class="button-quiet" type="submit" name="llm_action" value="reset">Вернуть локальную Gemma</button></div></form></div></section></div>`;
}

function panelBody(kind, screen, options) {
  if (kind === 'character') return renderCharacterPanel(screen);
  if (kind === 'inventory') return renderInventoryPanel(screen);
  if (kind === 'people') return renderPeoplePanel(screen);
  if (kind === 'route') return renderRoutesPanel(screen);
  if (kind === 'map') return renderMapPanel(screen);
  if (kind === 'journal') return renderJournalPanel(screen);
  return renderDiagnostics(screen, options);
}

function renderStatus(state) {
  if (!state.error || state.opening?.status === 'failed') {
    if (state.status !== 'loading') return '';
    const progress = state.turnProgress;
    if (!progress) return '<div class="request-status" role="status">Загрузка…</div>';
    const seconds = Number.isInteger(progress.elapsed_seconds)
      ? progress.elapsed_seconds : 0;
    const phase = TURN_PROGRESS_LABELS[progress.phase] ?? 'Готовим ход';
    const label = progress.commit_state === 'committed'
      ? `Результат сохранён. ${phase}` : phase;
    const wait = seconds >= 30
      ? 'Дольше целевых 30 секунд; обработка продолжается. Точное время окончания неизвестно.'
      : 'Точное время окончания неизвестно.';
    return `<div class="request-status"><strong role="status" aria-live="polite" aria-atomic="true">${escapeHtml(label)}</strong><span aria-hidden="true">Прошло ${seconds} с</span><small>${escapeHtml(wait)}</small></div>`;
  }
  return `<div class="error error-toast" role="alert"><span>${escapeHtml(state.error.message)}</span><button type="button" data-dismiss-error aria-label="Закрыть">×</button></div>`;
}

function themeIcon(theme) { return theme === 'dark' ? '☀' : '☾'; }
function scalar(value) {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}
