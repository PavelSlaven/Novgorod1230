import { buildInventoryView } from './inventory-view.js';
import { buildPeopleView } from './people-view.js';
import { buildPropertyView } from './property-view.js';
import { buildSceneActionHints, humanizeSceneAnchor } from './scene-hints.js';
import { buildRouteStripText, buildRouteView } from './route-view.js';
import { getPlayerAlertTags, getPlayerVitals, summarizeNeedsText, summarizeStateBadgeText } from './vitals.js';
import { buildMapPanelState } from './map-panel.js';
import { buildKnowledgeGraph } from './knowledge-graph.js';
import { attachGraphViewport } from './graph-viewport.js';
import { resolveDiagnosticsVisible, shouldAutoOpenDiagnosticsDrawer } from './diagnostics-visibility.js';
import {
  JOURNAL_FILTERS,
  buildJournalDetailBlocks,
  buildJournalMessage,
  buildJournalSections,
  buildJournalTechParts,
  formatJournalValue,
  humanizeJournalKind,
  journalEntryHasDetails,
  journalFilterMatches,
  normalizeJournalKind,
  resolveDiagnosticJournal,
  shouldShowJournalRaw
} from './journal-render.js';

const boot = window.__INITIAL_STATE__ ?? { state: null, client: null, openingText: '', meta: {} };
const THEME_STORAGE_KEY = 'xiii-ui-theme';
let state = boot.state;
let clientControl = boot.client ?? {};
let activeOpeningText = boot.openingText ?? '';
let partyScreenPayload = boot.partyScreen ?? boot.party_screen ?? null;
let processSnapshot = {
  busy: false,
  phase: 'idle',
  label: 'Ожидание',
  message: 'Готов к действию.',
  progress: 0,
  items: [],
  diagnosticJournal: []
};
let processPollTimer = null;
let loadingVisible = false;
let currentRequestController = null;
let currentFlow = null;
let cancelRequested = false;
let journalActiveTab = 'events';
let actionHintsState = { source: 'fallback', hints: [], busy: false, token: 0 };
const debugVisible = Boolean(boot.meta?.debugVisible);
const apiAuth = boot.meta?.authRequired
  ? { csrfToken: boot.meta.csrfToken, apiToken: boot.meta.apiToken }
  : null;
const openDiagnosticDetails = new Set();
const journalFilters = new Map();
const journalToolbars = new WeakMap();

function applyServerPayload(payload) {
  if (payload?.state) {
    state = payload.state;
    actionHintsState = { source: 'fallback', hints: [], busy: false, token: actionHintsState.token + 1 };
  }
  if (payload?.client) clientControl = { ...clientControl, ...payload.client };
  if (payload?.openingText != null) activeOpeningText = payload.openingText;
  if (payload?.partyScreen || payload?.party_screen) {
    partyScreenPayload = payload.partyScreen ?? payload.party_screen;
    activeOpeningText = partyScreenPayload?.openingText ?? partyScreenPayload?.firstGameScreen?.main_prose ?? activeOpeningText;
  }
}

const JOURNAL_TABS = [
  { id: 'events', label: 'События', title: 'Журнал' },
  { id: 'memory', label: 'Память', title: 'Следы' },
  { id: 'obligations', label: 'Обязательства', title: 'Долги' },
  { id: 'people', label: 'Люди', title: 'НПС' },
  { id: 'places', label: 'Места', title: 'Карта' },
  { id: 'property', label: 'Имущество', title: 'Окно' },
  { id: 'rumorsHistory', label: 'Слухи/история', title: 'Фон' }
];

const GENERATION_STAGES = [
  { id: 'ng_stage_01', label: 'Заявка игрока', meta: 'Принимаю имя и стартовое описание.' },
  { id: 'ng_stage_02', label: 'Нормализация заявки', meta: 'Привожу ввод к контракту старта.' },
  { id: 'ng_stage_03', label: 'Историческая рамка', meta: 'Определяю год, сезон, регион и давление эпохи.' },
  { id: 'ng_stage_04', label: 'Региональный контекст', meta: 'Загружаю власть, дороги, хозяйство и источники.' },
  { id: 'ng_stage_05', label: 'Кандидаты G1-G4', meta: 'Собираю допустимые узлы стартовой сцены.' },
  { id: 'ng_stage_06', label: 'Шаблоны мест', meta: 'Подбираю place templates для кандидатов.' },
  { id: 'ng_stage_07', label: 'Кандидаты NPC', meta: 'Готовлю допустимых людей и роли.' },
  { id: 'ng_stage_08', label: 'Профили предметов', meta: 'Готовлю предметы, контейнеры и имущество.' },
  { id: 'ng_stage_09', label: 'Выбор стартового узла', meta: 'LLM выбирает только из candidate set.' },
  { id: 'ng_stage_10', label: 'Аудит места', meta: 'Проверяю выбранное место и источники.' },
  { id: 'ng_stage_11', label: 'Персонаж игрока', meta: 'Формирую стартовый профиль игрока.' },
  { id: 'ng_stage_12', label: 'Аудит персонажа', meta: 'Проверяю профиль на контракт и эпоху.' },
  { id: 'ng_stage_13', label: 'G5 materialization', meta: 'Материализую сцену уровня G5.' },
  { id: 'ng_stage_14', label: 'Аудит G5', meta: 'Проверяю G5 геометрию и связи.' },
  { id: 'ng_stage_15', label: 'Размещение NPC', meta: 'Размещаю NPC в стартовой сцене.' },
  { id: 'ng_stage_16', label: 'Размещение предметов', meta: 'Размещаю предметы и контейнеры.' },
  { id: 'ng_stage_17', label: 'Время и свет', meta: 'Проверяю сезон, время, погоду и освещение.' },
  { id: 'ng_stage_18', label: 'Знание карты', meta: 'Формирую карту, известную персонажу.' },
  { id: 'ng_stage_19', label: 'Скрытое состояние', meta: 'Фиксирую невидимые процессы мира.' },
  { id: 'ng_stage_20', label: 'Видимый контекст', meta: 'Собираю player-visible пакет.' },
  { id: 'ng_stage_21', label: 'Аудит видимого контекста', meta: 'Проверяю границу видимого и скрытого.' },
  { id: 'ng_stage_22', label: 'Стартовая проза', meta: 'Готовлю утверждённый narrator prose.' },
  { id: 'ng_stage_23', label: 'Аудит прозы', meta: 'Проверяю прозу и action options.' },
  { id: 'ng_stage_24', label: 'Write plan', meta: 'Формирую план записи в party DB.' },
  { id: 'ng_stage_25', label: 'Commit gate', meta: 'Проверяю и атомарно фиксирую party state.' },
  { id: 'ng_stage_26', label: 'Первый экран', meta: 'Собираю готовый screen payload для UI.' }
];

const NEW_GAME_PHASE_STAGE = new Map([
  ...GENERATION_STAGES.map((stage) => [stage.id, stage.id]),
  ['new_game', 'ng_stage_01'],
  ['new_game_local', 'ng_stage_01'],
  ['new_game_seed', 'ng_stage_01'],
  ['new_game_frame', 'ng_stage_03'],
  ['new_game_place', 'ng_stage_09'],
  ['new_game_social', 'ng_stage_04'],
  ['new_game_historical', 'ng_stage_03'],
  ['new_game_player', 'ng_stage_11'],
  ['new_game_profile', 'ng_stage_15'],
  ['new_game_location_profile', 'ng_stage_13'],
  ['new_game_scene', 'ng_stage_17'],
  ['new_game_memory', 'ng_stage_18'],
  ['new_game_impulse', 'ng_stage_11'],
  ['new_game_items', 'ng_stage_16'],
  ['new_game_routes', 'ng_stage_18'],
  ['new_game_hidden', 'ng_stage_19'],
  ['new_game_visible_state', 'ng_stage_20'],
  ['new_game_save', 'ng_stage_25'],
  ['commit_gate', 'ng_stage_25'],
  ['done', 'ng_stage_26'],
  ['error', 'ng_stage_23']
]);

const PROCESS_STATUS_LABELS = {
  idle: 'pending',
  pending: 'pending',
  active: 'running',
  running: 'running',
  done: 'done',
  warning: 'warning',
  warn: 'warning',
  failed: 'failed',
  error: 'failed',
  retrying: 'retrying',
  retry: 'retrying'
};

const PROCESS_STATUS_TEXT = {
  pending: 'pending',
  running: 'running',
  done: 'done',
  warning: 'warning',
  failed: 'failed',
  retrying: 'retrying'
};


const dom = {
  loadingOverlay: document.getElementById('loadingOverlay'),
  loadingMessage: document.getElementById('loadingMessage'),
  loadingState: document.getElementById('loadingState'),
  loadingPercent: document.getElementById('loadingPercent'),
  loadingProgressBar: document.getElementById('loadingProgressBar'),
  loadingList: document.getElementById('loadingList'),
  loadingJournal: document.getElementById('loadingJournal'),
  loadingError: document.getElementById('loadingError'),
  generationDiagnostics: document.getElementById('generationDiagnostics'),
  loadingDiagnosticSummary: document.getElementById('loadingDiagnosticSummary'),
  loadingCopyButton: document.getElementById('loadingCopyButton'),
  cancelLoadingButton: document.getElementById('cancelLoadingButton'),
  themeToggle: document.getElementById('themeToggle'),
  startOverlay: document.getElementById('startOverlay'),
  continueGameButton: document.getElementById('continueGameButton'),
  newGameButton: document.getElementById('newGameButton'),
  startStatus: document.getElementById('startStatus'),
  newGameOverlay: document.getElementById('newGameOverlay'),
  newGameText: document.getElementById('newGameText'),
  newGameStartButton: document.getElementById('newGameStartButton'),
  newGameCancelButton: document.getElementById('newGameCancelButton'),
  newGameStatus: document.getElementById('newGameStatus'),
  loadOverlay: document.getElementById('loadOverlay'),
  loadStatus: document.getElementById('loadStatus'),
  loadList: document.getElementById('loadList'),
  loadCloseButton: document.getElementById('loadCloseButton'),
  clockText: document.getElementById('clockText'),
  providerBadge: document.getElementById('providerBadge'),
  locationLabel: document.getElementById('locationLabel'),
  openingText: document.getElementById('openingText'),
  log: document.getElementById('log'),
  recentEventsHead: document.getElementById('recentEventsHead'),
  playerNameStrip: document.getElementById('playerNameStrip'),
  playerStatusStrip: document.getElementById('playerStatusStrip'),
  locationStrip: document.getElementById('locationStrip'),
  microLocationStrip: document.getElementById('microLocationStrip'),
  needsStrip: document.getElementById('needsStrip'),
  threatStrip: document.getElementById('threatStrip'),
  lawStrip: document.getElementById('lawStrip'),
  routeStrip: document.getElementById('routeStrip'),
  playerName: document.getElementById('playerName'),
  playerStatus: document.getElementById('playerStatus'),
  playerClass: document.getElementById('playerClass'),
  playerOrigin: document.getElementById('playerOrigin'),
  playerReason: document.getElementById('playerReason'),
  playerPanelTitle: document.getElementById('playerPanelTitle'),
  playerRole: document.getElementById('playerRole'),
  playerVitals: document.getElementById('playerVitals'),
  playerStatusCompact: document.getElementById('playerStatusCompact'),
  needsCompact: document.getElementById('needsCompact'),
  playerInventorySummary: document.getElementById('playerInventorySummary'),
  sceneContext: document.getElementById('sceneContext'),
  sceneMotivation: document.getElementById('sceneMotivation'),
  sceneBadge: document.getElementById('sceneBadge'),
  sceneDetails: document.getElementById('sceneDetails'),
  hintsRefreshButton: document.getElementById('hintsRefreshButton'),
  graphBadge: document.getElementById('graphBadge'),
  graphWrap: document.getElementById('graphWrap'),
  stateBadge: document.getElementById('stateBadge'),
  npcCount: document.getElementById('npcCount'),
  lawBadge: document.getElementById('lawBadge'),
  lawList: document.getElementById('lawList'),
  routeBadge: document.getElementById('routeBadge'),
  routeList: document.getElementById('routeList'),
  gameErrorAlert: document.getElementById('gameErrorAlert'),
  commandInput: document.getElementById('commandInput'),
  statusLine: document.getElementById('statusLine'),
  saveButton: document.getElementById('saveButton'),
  inventoryButton: document.getElementById('inventoryButton'),
  peopleButton: document.getElementById('peopleButton'),
  propertyButton: document.getElementById('propertyButton'),
  mapButton: document.getElementById('mapButton'),
  journalButton: document.getElementById('journalButton'),
  inventoryOverlay: document.getElementById('inventoryOverlay'),
  inventoryCloseButton: document.getElementById('inventoryCloseButton'),
  inventorySummary: document.getElementById('inventorySummary'),
  inventorySections: document.getElementById('inventorySections'),
  peopleOverlay: document.getElementById('peopleOverlay'),
  peopleCloseButton: document.getElementById('peopleCloseButton'),
  peopleSummary: document.getElementById('peopleSummary'),
  peopleHint: document.getElementById('peopleHint'),
  peopleSummaryOverlay: document.getElementById('peopleSummaryOverlay'),
  peopleSections: document.getElementById('peopleSections'),
  propertyOverlay: document.getElementById('propertyOverlay'),
  propertyCloseButton: document.getElementById('propertyCloseButton'),
  propertySummary: document.getElementById('propertySummary'),
  propertySections: document.getElementById('propertySections'),
  journalOverlay: document.getElementById('journalOverlay'),
  journalCloseButton: document.getElementById('journalCloseButton'),
  journalTabs: document.getElementById('journalTabs'),
  journalSections: document.getElementById('journalSections'),
  diagnosticsDrawer: document.getElementById('diagnosticsDrawer'),
  processState: document.getElementById('processState'),
  processErrorBadge: document.getElementById('processErrorBadge'),
  processMessage: document.getElementById('processMessage'),
  processProgressBar: document.getElementById('processProgressBar'),
  processSummary: document.getElementById('processSummary'),
  processCopyButton: document.getElementById('processCopyButton'),
  processList: document.getElementById('processList'),
  processJournal: document.getElementById('processJournal')
};

const mapPanel = document.querySelector('.map-panel');
const gameShell = document.querySelector('.game-screen');
const themeToggles = Array.from(document.querySelectorAll('[data-theme-toggle]'));

applyTheme(loadThemePreference());
enterStartupMode();

dom.openingText.textContent = boot.openingText ?? '';
dom.loadingOverlay.hidden = true;
if (dom.loadingError) dom.loadingError.hidden = true;
dom.startOverlay.hidden = false;
if (dom.newGameOverlay) dom.newGameOverlay.hidden = true;
if (dom.loadOverlay) dom.loadOverlay.hidden = true;
if (dom.inventoryOverlay) dom.inventoryOverlay.hidden = true;
if (dom.peopleOverlay) dom.peopleOverlay.hidden = true;
if (dom.propertyOverlay) dom.propertyOverlay.hidden = true;
dom.continueGameButton.disabled = false;
dom.continueGameButton.hidden = false;
setStartStatus('Нажми "Загрузить", чтобы открыть список сохранений, или начни новую игру.');
setNewGameStatus('');
updateThemeToggleLabel();

render(state);
setCommandBusy(true, 'Сначала начни новую игру или загрузи сохранение.');
renderProcess({
  busy: false,
  phase: 'idle',
  label: 'Ожидание',
  message: 'Нужно выбрать стартовое действие.',
  progress: 0,
  items: [
    { label: 'Ожидание', meta: 'Нужно выбрать стартовое действие', state: 'active' },
    { label: 'Новая игра', meta: 'Создание мира и стартовой точки', state: 'idle' },
    { label: 'Ход мира', meta: 'Команды, сохранение и симуляция', state: 'idle' }
  ]
});

dom.continueGameButton.addEventListener('click', async () => {
  await openLoadOverlay();
});

if (dom.loadCloseButton) {
  dom.loadCloseButton.addEventListener('click', () => {
    closeLoadOverlay();
  });
}

if (dom.loadOverlay) {
  dom.loadOverlay.addEventListener('click', (event) => {
    if (event.target === dom.loadOverlay) {
      closeLoadOverlay();
    }
  });
}

dom.cancelLoadingButton.addEventListener('click', () => {
  cancelLoadingFlow();
});

if (dom.processCopyButton) {
  dom.processCopyButton.addEventListener('click', () => {
    copyDiagnostics(processSnapshot);
  });
}

if (dom.loadingCopyButton) {
  dom.loadingCopyButton.addEventListener('click', () => {
    copyDiagnostics(processSnapshot);
  });
}

if (dom.saveButton) {
  dom.saveButton.addEventListener('click', async () => {
    await saveGame();
  });
}

if (dom.inventoryButton) {
  dom.inventoryButton.addEventListener('click', () => {
    toggleInventoryOverlay();
  });
}

if (dom.peopleButton) {
  dom.peopleButton.addEventListener('click', () => {
    togglePeopleOverlay();
  });
}

if (dom.propertyButton) {
  dom.propertyButton.addEventListener('click', () => {
    togglePropertyOverlay();
  });
}

if (dom.mapButton) {
  dom.mapButton.addEventListener('click', () => {
    toggleMapPanel();
  });
}

if (mapPanel) {
  mapPanel.addEventListener('toggle', () => {
    renderGraph(state);
  });
}

if (dom.hintsRefreshButton) {
  dom.hintsRefreshButton.addEventListener('click', async () => {
    await refreshActionHints(true);
  });
}

dom.journalButton.addEventListener('click', () => {
  toggleJournalOverlay();
});

if (dom.inventoryCloseButton) {
  dom.inventoryCloseButton.addEventListener('click', () => {
    closeInventoryOverlay();
  });
}

dom.journalCloseButton.addEventListener('click', () => {
  closeJournalOverlay();
});

if (dom.inventoryOverlay) {
  dom.inventoryOverlay.addEventListener('click', (event) => {
    if (event.target === dom.inventoryOverlay) {
      closeInventoryOverlay();
    }
  });
}

if (dom.peopleCloseButton) {
  dom.peopleCloseButton.addEventListener('click', () => {
    closePeopleOverlay();
  });
}

if (dom.peopleOverlay) {
  dom.peopleOverlay.addEventListener('click', (event) => {
    if (event.target === dom.peopleOverlay) {
      closePeopleOverlay();
    }
  });
}

if (dom.propertyCloseButton) {
  dom.propertyCloseButton.addEventListener('click', () => {
    closePropertyOverlay();
  });
}

if (dom.propertyOverlay) {
  dom.propertyOverlay.addEventListener('click', (event) => {
    if (event.target === dom.propertyOverlay) {
      closePropertyOverlay();
    }
  });
}

dom.journalOverlay.addEventListener('click', (event) => {
  if (event.target === dom.journalOverlay) {
    closeJournalOverlay();
  }
});

dom.newGameButton.addEventListener('click', async () => {
  openNewGameOverlay();
});

if (dom.newGameCancelButton) {
  dom.newGameCancelButton.addEventListener('click', () => {
    closeNewGameOverlay();
  });
}

if (dom.newGameOverlay) {
  dom.newGameOverlay.addEventListener('click', (event) => {
    if (event.target === dom.newGameOverlay) {
      closeNewGameOverlay();
    }
  });
}

if (dom.newGameStartButton) {
  dom.newGameStartButton.addEventListener('click', async () => {
    await startNewGame();
  });
}

if (dom.newGameText) {
  dom.newGameText.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      await startNewGame();
    }
  });
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-theme-toggle]') : null;
  if (!target) return;
  event.preventDefault();
  toggleTheme();
});

dom.commandInput.addEventListener('keydown', async (event) => {
  if (dom.commandInput.disabled) return;
  if (event.key !== 'Enter' || event.shiftKey) return;
  event.preventDefault();
  const text = dom.commandInput.value.trim();
  if (!text) return;
  dom.commandInput.value = '';
  await sendCommand(text);
});

async function startNewGame() {
  const text = dom.newGameText?.value.trim() ?? '';
  cancelRequested = false;
  currentFlow = 'new-game';
  closeStartOverlay();
  closeNewGameOverlay({ keepStartOverlayHidden: true });
  showLoadingOverlay();
  setCommandBusy(true, 'Создание новой игры...');
  renderProcess(buildNewGameProcessState(text));
  startProcessPolling();

  try {
    const response = await requestJson('/api/new-game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    }, null);

    const payload = response;
    applyServerPayload(payload);
    dom.openingText.textContent = activeOpeningText;
    enterGameMode();
    render(state);
    renderProcess(payload.process ? normalizeProcess(payload.process) : {
      busy: false,
      phase: 'done',
      label: 'Готово',
      message: 'Новая игра создана.',
      progress: 100,
      items: [
        { label: 'Проверка формы', meta: 'Завершена', state: 'done' },
        { label: 'Создание мира', meta: 'Завершено', state: 'done' },
        { label: 'Сохранение', meta: 'Мир сохранён и готов', state: 'done' }
      ]
    });
    hideLoadingOverlay();
    stopProcessPolling();
    setCommandBusy(false, 'Новая игра готова. Введи первое действие.');
    setNewGameStatus('Игра создана.');
    dom.commandInput.focus();
  } catch (error) {
    if (isAbortError(error) || cancelRequested) {
      cancelRequested = false;
      currentFlow = null;
      currentRequestController = null;
      hideLoadingOverlay();
      stopProcessPolling();
      setCommandBusy(false, 'Новая игра отменена. Можно начать заново.');
      setNewGameStatus('Отмена выполнена.');
      enterStartupMode();
      renderProcess({
        busy: false,
        phase: 'idle',
        label: 'Ожидание',
        message: 'Нужно выбрать стартовое действие.',
        progress: 0,
        items: [
          { label: 'Ожидание', meta: 'Нужно выбрать стартовое действие', state: 'active', progress: 100 },
          { label: 'Новая игра', meta: 'Создание мира и стартовой точки', state: 'idle', progress: 0 },
          { label: 'Ход мира', meta: 'Команды, сохранение и симуляция', state: 'idle', progress: 0 }
        ],
        diagnosticJournal: []
      });
      dom.startOverlay.hidden = false;
      setStartStatus('Отмена выполнена.');
      return;
    }
    const message = normalizeErrorMessage(error);
    dom.startOverlay.hidden = false;
    enterStartupMode();
    setStartStatus(message);
    renderProcess({
      busy: false,
      phase: 'error',
      label: 'Ошибка',
      message,
      progress: 100,
      items: [
        { label: 'Проверка формы', meta: 'Сделана', state: 'done' },
        { label: 'Создание мира', meta: message, state: 'failed' },
        { label: 'Сохранение', meta: 'Не выполнено', state: 'idle' }
      ]
    });
    hideLoadingOverlay();
    stopProcessPolling();
    currentFlow = null;
    currentRequestController = null;
    setNewGameStatus(message);
  }
}

function buildNewGameProcessState(text) {
  const hasText = Boolean(String(text ?? '').trim());
  return {
    busy: true,
    phase: 'new_game_local',
    label: 'Создание новой игры',
    message: hasText
      ? 'Разбираю свободное описание и собираю историческую рамку.'
      : 'Создаю историческую стартовую ситуацию без вводных от игрока.',
    progress: 12,
    items: [
      {
        label: 'Заявка игрока',
        meta: hasText ? 'Свободное описание получено' : 'Пустой ввод допустим',
        state: 'done'
      },
      {
        label: 'Историческая рамка',
        meta: 'Подбираю год, сезон, регион и место',
        state: 'active'
      },
      {
        label: 'Сохранение',
        meta: 'Запишу каталог и сессию после ответа',
        state: 'idle'
      }
    ]
  };
}

async function sendCommand(text) {
  setCommandBusy(true, 'Разбираем действие…');
  currentFlow = 'command';
  renderProcess({
    busy: true,
    phase: 'command_local',
    label: 'Разбираем действие',
    message: 'Проверяем последствия и готовим ответ мира.',
    progress: 10,
    items: [
      { label: 'Намерение игрока', meta: text, state: 'done' },
      { label: 'Проверка последствий', meta: 'Мир оценивает риск и результат', state: 'active' },
      { label: 'Обновление сцены', meta: 'Будет после ответа', state: 'idle' }
    ]
  });
  startProcessPolling();

  try {
    const response = await requestJson('/api/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    }, null);

    const payload = response;
    applyServerPayload(payload);
    render(state);
    renderProcess(payload.process ? normalizeProcess(payload.process) : {
      busy: false,
      phase: 'done',
      label: 'Готово',
      message: 'Ход применён.',
      progress: 100,
      items: [
        { label: 'Намерение игрока', meta: 'Принято', state: 'done' },
        { label: 'Проверка последствий', meta: 'Ответ получен', state: 'done' },
        { label: 'Обновление сцены', meta: 'Состояние мира обновлено', state: 'done' }
      ]
    });
    stopProcessPolling();
    setCommandBusy(false, `Готово • ${state.clockText}`);
    currentFlow = null;
    currentRequestController = null;
  } catch (error) {
    if (isAbortError(error)) {
      stopProcessPolling();
      setCommandBusy(false, 'Команда отменена.');
      renderProcess({
        busy: false,
        phase: 'idle',
        label: 'Ожидание',
        message: 'Готов к действию.',
        progress: 0,
        items: processSnapshot.items ?? [],
        diagnosticJournal: processSnapshot.diagnosticJournal ?? []
      });
      currentFlow = null;
      currentRequestController = null;
      return;
    }
    const message = normalizeErrorMessage(error);
    renderProcess({
      busy: false,
      phase: 'error',
      label: 'Ошибка',
      message,
      progress: 100,
      items: [
        { label: 'Намерение игрока', meta: 'Принято', state: 'done' },
        { label: 'Проверка последствий', meta: message, state: 'failed' },
        { label: 'Обновление сцены', meta: 'Не выполнено', state: 'idle' }
      ]
    });
    stopProcessPolling();
    setCommandBusy(false, message);
    currentFlow = null;
    currentRequestController = null;
  }
}

async function saveGame() {
  if (!state || dom.commandInput.disabled) return;
  setCommandBusy(true, 'Сохраняю игру…');

  try {
    const response = await requestJson('/api/save', {
      method: 'POST'
    }, null);

    const payload = response;
    applyServerPayload(payload);
    render(state);
    renderProcess(payload.process ? normalizeProcess(payload.process) : {
      busy: false,
      phase: 'done',
      label: 'Сохранение',
      message: payload.message ?? 'Игра сохранена.',
      progress: 100,
      items: [
        { label: 'Слот', meta: 'Записан', state: 'done' }
      ]
    });
    setCommandBusy(false, payload.message ?? 'Игра сохранена.');
    dom.commandInput.focus();
  } catch (error) {
    const message = normalizeErrorMessage(error);
    renderProcess({
      busy: false,
      phase: 'error',
      label: 'Ошибка',
      message,
      progress: 100,
      items: [
        { label: 'Сохранение', meta: message, state: 'failed' }
      ]
    });
    setCommandBusy(false, message);
  }
}

function render(nextState) {
  if (!nextState) return;

  dom.clockText.textContent = nextState.clockText ?? '';
  dom.clockText.hidden = !dom.clockText.textContent;
  const providerState = nextState.provider ?? nextState.debug?.provider ?? null;
  dom.providerBadge.textContent = providerState?.enabled
    ? `${providerState.provider ?? 'LLM'} · ${providerState.model ?? 'модель'}`
    : 'LLM не настроена';
  dom.providerBadge.hidden = !debugVisible;
  setTextOrHide(dom.locationLabel, buildLocationLabel(nextState));
  dom.playerNameStrip.textContent = nextState.player?.name ?? 'Безымянный';
  dom.playerStatusStrip.textContent = joinKnown([nextState.player?.role, nextState.player?.status], ' · ');
  if (dom.playerStatusCompact) dom.playerStatusCompact.textContent = summarizeStateBadgeText(nextState.player);
  dom.locationStrip.textContent = joinKnown([
    nextState.region?.name,
    nextState.place?.name
  ], ' · ') || 'место не определено';
  setTextOrHide(dom.microLocationStrip, joinKnown([nextState.microPlace?.name, nextState.visibleScene?.markup?.atmosphere?.orientation], ' · '));
  dom.needsStrip.textContent = summarizeNeedsText(nextState.player);
  if (dom.needsCompact) dom.needsCompact.textContent = summarizeStateBadgeText(nextState.player);
  dom.threatStrip.textContent = summarizeThreat(nextState);
  dom.lawStrip.textContent = `${(nextState.legal?.behavioralRules ?? []).length} правил`;
  setTextOrHide(dom.routeStrip, buildRouteStripText(nextState));

  dom.playerPanelTitle.textContent = nextState.player?.name ?? 'Безымянный';
  dom.playerRole.textContent = nextState.player?.role ?? 'без роли';
  setTextOrHide(dom.playerStatus, joinKnown([nextState.player?.status, nextState.player?.visibleStatus], ' · '));
  setTextOrHide(dom.playerClass, joinKnown([nextState.player?.socialClass], ' · '));
  setTextOrHide(dom.playerOrigin, uniqueTextParts([
    nextState.player?.origin,
    nextState.historicalFrame?.regionName ?? nextState.region?.name
  ]).join(' · '));
  setTextOrHide(dom.playerReason, uniqueTextParts([
    nextState.player?.reasonHere,
    nextState.player?.goals?.[0],
    nextState.player?.obligations?.[0]
  ]).join(' · '));
  const atmosphere = nextState.visibleScene?.markup?.atmosphere ?? {};
  setTextOrHide(dom.sceneContext, buildSceneContext(nextState));
  setTextOrHide(dom.sceneMotivation, buildSceneMotivation(nextState));
  setTextOrHide(dom.sceneBadge, buildOrientationBadge(nextState));
  dom.graphBadge.textContent = buildMapPanelState(nextState, isMapPanelOpen()).badgeText;
  dom.stateBadge.textContent = summarizeStateBadgeText(nextState.player);
  dom.npcCount.textContent = `${(nextState.visibleNpcs ?? []).length} рядом`;
  dom.lawBadge.textContent = buildLawBadge(nextState.legal);
  if (dom.routeBadge) {
    dom.routeBadge.textContent = '';
    dom.routeBadge.hidden = true;
  }

  renderPlayer(nextState.player);
  renderScene(nextState);
  renderGraph(nextState);
  renderPeoplePanel(nextState);
  renderLaw(nextState.legal);
  renderRoutes(nextState);
  renderLog(nextState.events ?? []);
  renderPeopleOverlay(nextState);
  renderPropertyOverlay(nextState);
  renderJournalOverlay(nextState);
  renderInventoryOverlay(nextState);
  if (!dom.commandInput.disabled) {
    void refreshActionHints(false);
  }
}

function renderPlayer(player) {
  if (!player) return;
  const vitals = getPlayerVitals(player);
  const inventoryView = buildInventoryView(player);
  const alertTags = getPlayerAlertTags(player);
  dom.playerVitals.innerHTML = '';

  const stats = [
    ['Здоровье', vitals.health],
    ['Сытость', vitals.satiety],
    ['Бодрость', vitals.vigor]
  ];

  for (const [label, value] of stats) {
    dom.playerVitals.append(makeMeter(label, Number(value ?? 0)));
  }

  if (alertTags.length) {
    dom.playerVitals.append(makeMiniLine(`Тревоги: ${alertTags.slice(0, 4).join(' · ')}`));
  }

  if (inventoryView.weightText) {
    dom.playerVitals.append(makeMiniLine(inventoryView.weightText));
  }

  const mechanicsText = player.mechanics?.summaryText ?? '';
  if (mechanicsText) {
    dom.playerVitals.append(makeMiniLine(mechanicsText));
  }

  if (dom.playerInventorySummary) {
    dom.playerInventorySummary.textContent = inventoryView.summaryText;
  }
}

function renderScene(nextState) {
  dom.openingText.textContent = buildSceneProse(nextState);
  dom.sceneDetails.innerHTML = '';

  const hints = actionHintsState.hints.length
    ? actionHintsState.hints
    : buildSceneActionHints(nextState.visibleScene?.markup ?? {}).map((hint) => ({
      text: hint.command,
      tone: null,
      risk_hint: null,
      action: hint.action ?? null,
      label: hint.label
    }));

  for (const item of hints) {
    dom.sceneDetails.append(makeSceneAction(item));
  }

  const details = buildSceneDetailNotes(nextState);
  for (const item of details.slice(0, 2)) {
    dom.sceneDetails.append(makeNote(item));
  }

  const sceneAnchorsWrap = dom.sceneDetails?.parentElement;
  if (sceneAnchorsWrap) {
    sceneAnchorsWrap.hidden = hints.length === 0 && details.length === 0;
  }
  if (dom.hintsRefreshButton) {
    dom.hintsRefreshButton.hidden = dom.commandInput.disabled;
    dom.hintsRefreshButton.disabled = actionHintsState.busy || dom.commandInput.disabled;
    dom.hintsRefreshButton.textContent = actionHintsState.busy ? 'Обновляю…' : 'Обновить';
  }

  if (dom.recentEventsHead) {
    dom.recentEventsHead.hidden = (nextState.events ?? []).length === 0;
  }
  if (dom.log) {
    dom.log.hidden = (nextState.events ?? []).length === 0;
  }
}

async function refreshActionHints(force = false) {
  if (!state || dom.commandInput.disabled) return;
  const token = actionHintsState.token + 1;
  actionHintsState = { ...actionHintsState, busy: true, token };
  renderScene(state);

  try {
    const payload = await requestJson('/api/action-hints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    }, 25000);
    if (token !== actionHintsState.token) return;
    actionHintsState = {
      source: payload.source ?? 'fallback',
      hints: Array.isArray(payload.hints) ? payload.hints : [],
      busy: false,
      token
    };
  } catch {
    if (token !== actionHintsState.token) return;
    actionHintsState = {
      source: 'fallback',
      hints: buildSceneActionHints(state.visibleScene?.markup ?? {}).map((hint) => ({
        text: hint.command,
        tone: null,
        risk_hint: null,
        action: hint.action ?? null,
        label: hint.label
      })),
      busy: false,
      token
    };
  }

  renderScene(state);
}

function renderGraph(nextState) {
  const mapPanelState = buildMapPanelState(nextState, isMapPanelOpen());
  if (!mapPanelState.shouldRenderGraph) {
    clearGraphPanel();
    return;
  }
  dom.graphWrap.innerHTML = '';
  dom.graphWrap.hidden = false;
  const graph = buildKnowledgeGraph(nextState);
  if (graph.nodes.length > 0) {
    const svg = buildGraphSvg(
      graph.nodes,
      graph.edges,
      nextState.currentPosition ?? nextState.orientation ?? nextState.place ?? null,
      nextState.currentMicroLocationId ?? nextState.orientation?.microLocationId ?? null
    );
    attachGraphViewport(dom.graphWrap, svg);
    const caption = document.createElement('div');
    caption.className = 'orientation-scheme';
    caption.append(
      makeOrientationItem(`Сейчас: ${cleanUiText(nextState.place?.name) || 'текущее место'}`),
      makeOrientationItem(mapPanelState.badgeText || 'без путей'),
      makeOrientationItem(mapPanelState.knowledgeText || 'карта знаний пуста')
    );
    dom.graphWrap.append(caption);
    return;
  }
  dom.graphWrap.append(makeEmptyState(mapPanelState.knowledgeText || 'Карта знаний пока пуста.'));
}

function clearGraphPanel() {
  if (!dom.graphWrap) return;
  dom.graphWrap.innerHTML = '';
  dom.graphWrap.hidden = true;
}

function isMapPanelOpen() {
  return Boolean(mapPanel?.open);
}

function toggleMapPanel() {
  if (!mapPanel) return;
  mapPanel.open = !mapPanel.open;
  renderGraph(state);
}

function renderPeoplePanel(nextState) {
  const view = buildPeopleView(nextState?.visibleNpcs ?? []);
  if (dom.peopleSummary) {
    dom.peopleSummary.textContent = view.summaryText;
  }
  if (dom.peopleHint) {
    dom.peopleHint.textContent = view.items.length
      ? 'Список открывается кнопкой «Люди рядом».'
      : 'Видимых людей нет.';
  }
}

function renderPeopleOverlay(nextState) {
  if (!dom.peopleOverlay || dom.peopleOverlay.hidden) return;
  if (!dom.peopleSections) return;

  const view = buildPeopleView(nextState?.visibleNpcs ?? []);
  dom.peopleSections.innerHTML = '';
  if (dom.peopleSummaryOverlay) {
    dom.peopleSummaryOverlay.textContent = view.summaryText;
  }

  if (!view.items.length) {
    dom.peopleSections.append(makeEmptyState('Видимых людей нет.'));
    return;
  }

  for (const item of view.items) {
    const card = document.createElement('article');
    card.className = 'npc-card';
    const npc = item.raw ?? {};
    const summary = [item.meta, ...item.lines.slice(0, 2)].filter(Boolean).join(' · ');

    card.append(makeCardTitle(item.name, summary || 'человек рядом'));

    if (item.lines.length) {
      card.append(makeMiniLine(item.lines.join(' · ')));
    }

    const lines = summarizeActorProfileLines(npc.observedActorProfile ?? npc.actorProfile, { npc: true }).slice(0, 4);
    if (lines.length) {
      const details = document.createElement('details');
      details.className = 'inline-details';
      const summaryEl = document.createElement('summary');
      summaryEl.textContent = 'Подробнее';
      details.append(summaryEl, makeList(lines, 'Профиль не заполнен'));
      card.append(details);
    }

    dom.peopleSections.append(card);
  }
}

function renderPropertyOverlay(nextState) {
  if (!dom.propertyOverlay || dom.propertyOverlay.hidden) return;
  if (!dom.propertySections) return;

  const view = nextState?.propertyView ?? buildPropertyView([]);
  dom.propertySections.innerHTML = '';
  if (dom.propertySummary) {
    dom.propertySummary.textContent = view.detailMetaText || view.summaryText;
  }

  if (!view.items.length) {
    dom.propertySections.append(makeEmptyState('Имущества нет.'));
    return;
  }

  for (const item of view.items) {
    const card = document.createElement('article');
    card.className = 'npc-card';
    const summary = [item.meta, ...item.lines.slice(0, 4)].filter(Boolean).join(' · ');

    card.append(makeCardTitle(item.label, summary || 'имущество'));

    if (item.lines.length) {
      card.append(makeMiniLine(item.lines.join(' · ')));
    }

    const detail = document.createElement('details');
    detail.className = 'inline-details';
    const summaryEl = document.createElement('summary');
    summaryEl.textContent = 'Карточка';
    detail.append(summaryEl, makeList([item.summary], 'Карточка не заполнена'));
    card.append(detail);

    dom.propertySections.append(card);
  }
}

function renderLaw(legal) {
  dom.lawList.innerHTML = '';
  const lines = summarizeLawForPlayer(legal);
  if (!lines.length) {
    dom.lawList.hidden = true;
    return;
  }
  dom.lawList.hidden = false;
  dom.lawList.append(makeList(lines, ''));
}

function renderRoutes(nextState) {
  if (!dom.routeList) return;
  const view = buildRouteView(
    nextState?.historical?.routeArchiveVisible ?? [],
    nextState?.currentPosition ?? nextState?.orientation ?? null
  );
  dom.routeList.innerHTML = '';
  dom.routeList.hidden = view.items.length === 0;

  const subheader = dom.routeList.previousElementSibling;
  if (subheader) {
    subheader.hidden = view.items.length === 0;
    const chip = subheader.querySelector('.chip');
    if (chip) {
      chip.textContent = view.items.length ? `${view.items.length} видим.` : '';
    }
  }

  if (!view.items.length) {
    dom.routeList.append(makeEmptyState('Маршрутов нет.'));
    return;
  }

  for (const item of view.items) {
    const card = document.createElement('article');
    card.className = 'panel journal-panel';
    card.append(makeCardTitle(item.title, item.meta || 'маршрут'));
    if (item.lines.length) {
      card.append(makeList(item.lines, 'Маршрут не описан', 6));
    }
    dom.routeList.append(card);
  }
}

function renderLog(events) {
  dom.log.innerHTML = '';
  const reversed = [...events].reverse().slice(0, 4);
  if (reversed.length === 0) {
    return;
  }

  for (const event of reversed) {
    const item = document.createElement('article');
    item.className = 'log-item';
    const checkText = event.check
      ? (event.check.required ? `Проверка: ${event.check.degree ?? 'результат учтён'}` : 'Проверка не требовалась')
      : 'Без явной проверки';
    item.append(
      makeCardTitle(event.input ?? 'Событие', event.intent ? humanizeIntent(event.intent) : 'последствие'),
      makeMiniLine(event.result ?? ''),
      makeMiniLine(checkText)
    );
    dom.log.append(item);
  }
}

function renderJournalOverlay(nextState) {
  if (!dom.journalOverlay || dom.journalOverlay.hidden) return;
  if (!dom.journalTabs || !dom.journalSections) return;

  const sections = nextState.journalSections ?? {};
  const events = [
    ...(sections.events ?? []),
    ...(sections.delayedEvents ?? [])
  ];
  const memory = [
    ...(sections.facts ?? []),
    ...(sections.assumptions ?? []),
    ...(sections.memory ?? [])
  ];
  const propertyView = nextState?.propertyView ?? buildPropertyView([]);
  const tabDefinitions = [
    {
      id: 'events',
      sections: [
        ['События', 'Журнал', events, 'Событий нет', 6]
      ]
    },
    {
      id: 'memory',
      sections: [
        ['Память', 'Следы', memory, 'Память пуста', 6]
      ]
    },
    {
      id: 'obligations',
      sections: [
        ['Обязательства', 'Долги', sections.obligations ?? [], 'Нет обязательств', 6]
      ]
    },
    {
      id: 'people',
      sections: [
        ['Люди', 'НПС', sections.people ?? [], 'Людей нет', 6]
      ]
    },
    {
      id: 'places',
      sections: [
        ['Места', 'Карта', sections.places ?? [], 'Мест нет', 6],
        ['Карта знаний', 'Память', sections.knowledgeMap ?? [], 'Карта знаний пуста', 6]
      ]
    },
    {
      id: 'property',
      sections: [
        [
          'Имущество',
          'Окно',
          [
            propertyView.detailMetaText || propertyView.summaryText,
            ...(sections.property ?? []),
            ...(sections.propertyClues ?? [])
          ].filter(Boolean),
          'Имущества нет',
          8
        ]
      ]
    },
    {
      id: 'rumorsHistory',
      sections: [
        ['Слухи/история', 'Фон', sections.rumorsHistory ?? [], 'Слухов нет', 6]
      ]
    }
  ];

  dom.journalTabs.innerHTML = '';
  dom.journalSections.innerHTML = '';

  for (const tab of tabDefinitions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `journal-tab${tab.id === journalActiveTab ? ' is-active' : ''}`;
    button.dataset.journalTab = tab.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', tab.id === journalActiveTab ? 'true' : 'false');
    button.textContent = JOURNAL_TABS.find((item) => item.id === tab.id)?.label ?? tab.id;
    button.addEventListener('click', () => {
      journalActiveTab = tab.id;
      renderJournalOverlay(nextState);
    });
    dom.journalTabs.append(button);

    const panel = document.createElement('section');
    panel.className = 'journal-panel';
    panel.dataset.journalTabPanel = tab.id;
    panel.hidden = tab.id !== journalActiveTab;
    for (const [title, chipText, items, emptyText, limit] of tab.sections) {
      renderJournalSection(panel, title, chipText, items, emptyText, limit);
    }
    dom.journalSections.append(panel);
  }
}

function renderInventoryOverlay(nextState) {
  if (!dom.inventoryOverlay || dom.inventoryOverlay.hidden) return;
  if (!dom.inventorySections) return;

  const view = buildInventoryView(nextState?.player ?? {});
  dom.inventorySections.innerHTML = '';
  if (dom.inventorySummary) {
    dom.inventorySummary.textContent = view.detailMetaText || view.summaryText;
  }

  for (const section of view.sections ?? []) {
    renderJournalSection(
      dom.inventorySections,
      section.title,
      section.chipText,
      section.lines ?? [],
      section.emptyText,
      8
    );
  }
}

function renderJournalSection(container, title, chipText, items, emptyText, limit = 4) {
  const section = document.createElement('section');
  section.className = 'panel journal-panel';

  const header = document.createElement('div');
  header.className = 'panel-header';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const chip = document.createElement('div');
  chip.className = 'chip';
  chip.textContent = chipText;
  header.append(heading, chip);

  section.append(header, makeList(Array.isArray(items) ? items.slice(0, limit) : [], emptyText, limit));
  container.append(section);
}

function toggleJournalOverlay() {
  if (!dom.journalOverlay) return;
  const shouldShow = dom.journalOverlay.hidden;
  if (shouldShow) {
    closePropertyOverlay();
    closePeopleOverlay();
    closeInventoryOverlay();
  }
  dom.journalOverlay.hidden = !shouldShow;
  if (shouldShow) {
    renderJournalOverlay(state);
  }
}

function closeJournalOverlay() {
  if (!dom.journalOverlay) return;
  dom.journalOverlay.hidden = true;
}

function toggleInventoryOverlay() {
  if (!dom.inventoryOverlay) return;
  const shouldShow = dom.inventoryOverlay.hidden;
  if (shouldShow) {
    closePropertyOverlay();
    closePeopleOverlay();
    closeJournalOverlay();
  }
  dom.inventoryOverlay.hidden = !shouldShow;
  if (shouldShow) {
    renderInventoryOverlay(state);
  }
}

function closeInventoryOverlay() {
  if (!dom.inventoryOverlay) return;
  dom.inventoryOverlay.hidden = true;
}

function togglePeopleOverlay() {
  if (!dom.peopleOverlay) return;
  const shouldShow = dom.peopleOverlay.hidden;
  if (shouldShow) {
    closePropertyOverlay();
    closeJournalOverlay();
    closeInventoryOverlay();
  }
  dom.peopleOverlay.hidden = !shouldShow;
  if (shouldShow) {
    renderPeopleOverlay(state);
  }
}

function closePeopleOverlay() {
  if (!dom.peopleOverlay) return;
  dom.peopleOverlay.hidden = true;
}

function togglePropertyOverlay() {
  if (!dom.propertyOverlay) return;
  const shouldShow = dom.propertyOverlay.hidden;
  if (shouldShow) {
    closePeopleOverlay();
    closeJournalOverlay();
    closeInventoryOverlay();
  }
  dom.propertyOverlay.hidden = !shouldShow;
  if (shouldShow) {
    renderPropertyOverlay(state);
  }
}

function closePropertyOverlay() {
  if (!dom.propertyOverlay) return;
  dom.propertyOverlay.hidden = true;
}

function buildSceneProse(nextState) {
  const prose = nextState.visibleScene?.prose
    || nextState.lastNarratorProse
    || activeOpeningText
    || '';
  return sanitizeNarrativeText(prose);
}

function buildSceneContext(nextState) {
  const region = cleanUiText(nextState?.historicalFrame?.regionName ?? nextState?.region?.name);
  const clock = cleanUiText(nextState?.clockText);
  const place = simplifyPlaceLabel(nextState?.place?.name);
  const microPlace = simplifyMicroPlaceLabel(nextState?.place?.name, nextState?.microPlace?.name);
  const atmosphere = nextState?.visibleScene?.markup?.atmosphere ?? {};
  return uniqueTextParts([
    region,
    clock,
    cleanUiText(atmosphere.weather),
    cleanUiText(atmosphere.light),
    place,
    microPlace && microPlace !== place ? microPlace : null
  ]).join(' · ');
}

function buildSceneMotivation(nextState) {
  const startScene = nextState?.player?.startScene ?? null;
  const parts = uniqueTextParts([
    cleanUiText(nextState?.player?.reasonHere),
    humanizePlayerGoal(nextState?.player?.goals?.[0]),
    humanizePlayerGoal(nextState?.player?.obligations?.[0]),
    cleanUiText(nextState?.visibleScene?.markup?.atmosphere?.mood),
    cleanUiText(startScene?.visibleSituation),
    cleanUiText(startScene?.immediateTension),
    cleanUiText(startScene?.introProse)
  ]);
  return parts.slice(0, 2).join(' · ');
}

function buildLocationLabel(nextState) {
  const place = simplifyPlaceLabel(nextState?.place?.name);
  const microPlace = simplifyMicroPlaceLabel(nextState?.place?.name, nextState?.microPlace?.name);
  return microPlace || place || 'место не определено';
}

function buildSceneDetailNotes(nextState) {
  const markup = nextState.visibleScene?.markup ?? {};
  return uniqueTextParts([
    ...(Array.isArray(markup.notes) ? markup.notes.map((note) => cleanUiText(note)) : []),
    ...(Array.isArray(markup.entities)
      ? markup.entities.slice(0, 4).map((item) => humanizeSceneAnchor(cleanUiText(item.label), item.action))
      : []),
    buildImportantSceneCue(nextState)
  ]).slice(0, 4);
}

function sceneActionIcon(action, label) {
  const text = `${action ?? ''} ${label ?? ''}`.toLowerCase();
  if (/talk|speak|говор|дворник|конюх|купец|знахар|человек|люд/i.test(text)) return '💬';
  if (/move|go|exit|enter|дорог|троп|ворот|двер|перех|вый/i.test(text)) return '↗';
  if (/take|взять|нож|предмет|вещ/i.test(text)) return '◈';
  if (/wait|жд/i.test(text)) return '◷';
  return '⌕';
}

function describeOrientationExits(nextState) {
  const exits = Array.isArray(nextState.place?.exits) ? nextState.place.exits : [];
  if (exits.length) {
    return exits.slice(0, 4).map((exit) => describeExitLabel(exit));
  }

  const access = nextState.visibleScene?.markup?.atmosphere?.access ?? '';
  if (!access) return [];
  return [describeExitLabel(access)];
}

function describeExitLabel(label) {
  const text = cleanUiText(label);
  if (!text) return 'непонятный проход';
  if (/выход|двер|проход|ворот|калит|ступени|лестн|троп|путь|брод/i.test(text)) {
    return text;
  }
  return text.length > 20 ? `${text.slice(0, 19)}…` : text;
}

function closeStartOverlay() {
  dom.startOverlay.hidden = true;
  setStartStatus('');
}

function enterStartupMode() {
  document.documentElement.classList.add('startup-mode');
  if (gameShell) {
    gameShell.hidden = false;
  }
}

function enterGameMode() {
  document.documentElement.classList.remove('startup-mode');
}

function openNewGameOverlay() {
  closeStartOverlay();
  if (dom.loadOverlay) dom.loadOverlay.hidden = true;
  if (dom.newGameOverlay) dom.newGameOverlay.hidden = false;
  setNewGameStatus('Опиши персонажа или ситуацию.');
  if (dom.newGameText) {
    dom.newGameText.focus();
  }
}

function closeNewGameOverlay(options = {}) {
  if (dom.newGameOverlay) dom.newGameOverlay.hidden = true;
  setNewGameStatus('');
  if (!options.keepStartOverlayHidden) {
    dom.startOverlay.hidden = false;
    enterStartupMode();
  }
}

async function openLoadOverlay() {
  closeStartOverlay();
  closeNewGameOverlay({ keepStartOverlayHidden: true });
  stopProcessPolling();
  currentFlow = 'load';
  setCommandBusy(true, 'Выбери сохранение или начни новую игру.');
  if (dom.loadOverlay) dom.loadOverlay.hidden = false;
  setLoadStatus('Ищу сохранённые игры…');
  renderSavedGames([], null);

  try {
    const payload = await requestJson('/api/saves', {
      method: 'GET'
    }, null);
    const saves = Array.isArray(payload.saves) ? payload.saves : [];
    renderSavedGames(saves, payload.currentWorldKey ?? null);
    setLoadStatus(saves.length ? 'Выбери сохранение из списка.' : 'Сохранений пока нет.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось получить список сохранений.';
    setLoadStatus(message);
    renderSavedGames([], null);
  } finally {
    currentFlow = null;
  }
}

function closeLoadOverlay() {
  if (dom.loadOverlay) dom.loadOverlay.hidden = true;
  dom.startOverlay.hidden = false;
  enterStartupMode();
  setStartStatus('Нажми "Загрузить", чтобы открыть список сохранений, или начни новую игру.');
  setCommandBusy(true, 'Сначала начни новую игру или загрузи сохранение.');
}

function showLoadingOverlay() {
  dom.startOverlay.hidden = true;
  loadingVisible = true;
  dom.loadingOverlay.hidden = false;
  dom.cancelLoadingButton.disabled = false;
}

function hideLoadingOverlay() {
  loadingVisible = false;
  dom.loadingOverlay.hidden = true;
  dom.cancelLoadingButton.disabled = false;
}

function setLoadStatus(text) {
  if (!dom.loadStatus) return;
  dom.loadStatus.textContent = text;
}

function renderSavedGames(saves, currentWorldKey = null) {
  if (!dom.loadList) return;
  dom.loadList.innerHTML = '';
  const list = Array.isArray(saves) ? saves : [];
  if (list.length === 0) {
    dom.loadList.append(makeEmptyState('Пока нет сохранённых игр.'));
    return;
  }

  for (const save of list) {
    dom.loadList.append(makeSaveCard(save, currentWorldKey));
  }
}

function makeSaveCard(save, currentWorldKey = null) {
  const item = document.createElement('article');
  item.className = 'save-item';
  if (currentWorldKey && save?.worldKey === currentWorldKey) {
    item.dataset.current = 'true';
  }

  const top = document.createElement('div');
  top.className = 'save-item-top';
  const main = document.createElement('div');
  main.className = 'save-item-main';
  const title = document.createElement('div');
  title.className = 'save-item-title';
  title.textContent = trimKnownText(save?.title) || trimKnownText(save?.player?.name) || trimKnownText(save?.place?.name) || 'Сохранение';
  const meta = document.createElement('div');
  meta.className = 'save-item-meta';
  meta.textContent = joinKnown([
    save?.clockText,
    save?.place?.name,
    save?.region?.name
  ], ' · ') || 'Нет описания';
  const info = document.createElement('div');
  info.className = 'save-item-info';
  info.textContent = joinKnown([
    save?.player?.role,
    save?.player?.status,
    save?.saveKindText,
    save?.worldKey,
    formatSaveTimestamp(save?.lastUpdatedAt)
  ], ' · ');
  main.append(title, meta, info);

  if (trimKnownText(save?.lastEventText)) {
    const event = document.createElement('div');
    event.className = 'save-item-event';
    event.textContent = `Последнее событие: ${trimKnownText(save.lastEventText)}`;
    main.append(event);
  }

  const actions = document.createElement('div');
  actions.className = 'save-item-actions';
  if (currentWorldKey && save?.worldKey === currentWorldKey) {
    const current = document.createElement('div');
    current.className = 'chip save-item-current';
    current.textContent = 'Текущий';
    actions.append(current);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost-button';
  button.textContent = 'Продолжить';
  button.addEventListener('click', async () => {
    await loadSelectedSave(save?.worldKey);
  });
  actions.append(button);

  top.append(main, actions);
  item.append(top);
  return item;
}

function formatSaveTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `последнее сохранение ${date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}`;
}

async function loadSelectedSave(worldKey) {
  const cleanKey = String(worldKey ?? '').trim();
  if (!cleanKey) return;
  setLoadStatus('Загружаю сохранение…');
  setCommandBusy(true, 'Загружаю сохранение…');
  currentFlow = 'load';

  try {
    const payload = await requestJson('/api/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ worldKey: cleanKey })
    }, null);

    applyServerPayload(payload);
    dom.openingText.textContent = activeOpeningText;
    enterGameMode();
    render(state);
    renderProcess(payload.process ? normalizeProcess(payload.process) : {
      busy: false,
      phase: 'done',
      label: 'Загрузка',
      message: payload.message ?? 'Сохранение загружено.',
      progress: 100,
      items: [
        { label: 'Слот', meta: 'Открыт', state: 'done' },
        { label: 'Мир', meta: 'Восстановлен', state: 'done' },
        { label: 'Сохранение', meta: 'Подключено', state: 'done' }
      ]
    });
    closeLoadOverlay();
    closeStartOverlay();
    setCommandBusy(false, 'Мир готов. Опиши действие.');
    dom.commandInput.focus();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось загрузить сохранение.';
    setLoadStatus(message);
    renderProcess({
      busy: false,
      phase: 'error',
      label: 'Ошибка',
      message,
      progress: 100,
      items: [
        { label: 'Слот', meta: cleanKey, state: 'done' },
        { label: 'Мир', meta: message, state: 'failed' },
        { label: 'Сохранение', meta: 'Не загружено', state: 'idle' }
      ]
    });
    setCommandBusy(true, 'Сначала выбери сохранение или начни новую игру.');
  } finally {
    currentFlow = null;
  }
}

function cancelLoadingFlow() {
  if (currentRequestController) {
    cancelRequested = true;
    currentRequestController.abort(new Error('Пользователь отменил загрузку'));
  }
  currentFlow = null;
  hideLoadingOverlay();
  stopProcessPolling();
  closeNewGameOverlay({ keepStartOverlayHidden: true });
  dom.startOverlay.hidden = false;
  enterStartupMode();
  setStartStatus('Загрузка отменена.');
  setCommandBusy(true, 'Сначала начни новую игру или загрузи сохранение.');
  renderProcess({
    busy: false,
    phase: 'idle',
    label: 'Ожидание',
    message: 'Нужно выбрать стартовое действие.',
    progress: 0,
    items: [
      { label: 'Ожидание', meta: 'Нужно выбрать стартовое действие', state: 'active', progress: 100 },
      { label: 'Новая игра', meta: 'Создание мира и стартовой точки', state: 'idle', progress: 0 },
      { label: 'Ход мира', meta: 'Команды, сохранение и симуляция', state: 'idle', progress: 0 }
    ],
    diagnosticJournal: []
  });
}

function setStartStatus(text) {
  dom.startStatus.textContent = text;
}

function setNewGameStatus(text) {
  if (!dom.newGameStatus) return;
  dom.newGameStatus.textContent = text;
}

function loadThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'day' || stored === 'night') return stored;
  } catch {
    // ignore storage failures
  }
  return window.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'day' : 'night';
}

function applyTheme(theme) {
  const resolved = theme === 'day' ? 'day' : 'night';
  document.documentElement.dataset.theme = resolved;
  if (document.body) {
    document.body.dataset.theme = resolved;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, resolved);
  } catch {
    // ignore storage failures
  }
  updateThemeToggleLabel(resolved);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'day' ? 'night' : 'day';
  applyTheme(next);
}

function updateThemeToggleLabel(theme = document.documentElement.dataset.theme ?? 'night') {
  const label = theme === 'day' ? '☀' : '☾';
  const ariaLabel = theme === 'day'
    ? 'Переключить на ночную тему'
    : 'Переключить на дневную тему';
  for (const themeToggle of themeToggles) {
    themeToggle.textContent = label;
    themeToggle.setAttribute('aria-label', ariaLabel);
    themeToggle.setAttribute('title', ariaLabel);
    themeToggle.setAttribute('aria-pressed', theme === 'day' ? 'true' : 'false');
  }
}

function setCommandBusy(isBusy, text) {
  dom.statusLine.textContent = sanitizeStatusText(text);
  dom.commandInput.disabled = isBusy;
  if (dom.saveButton) dom.saveButton.disabled = isBusy;
}

function normalizeErrorMessage(error, fallback = 'Ошибка не указана') {
  if (error instanceof Error) {
    return error.message?.trim() || fallback;
  }
  if (typeof error === 'string') {
    return error.trim() || fallback;
  }
  if (error && typeof error === 'object' && typeof error.message === 'string') {
    return error.message.trim() || fallback;
  }
  return fallback;
}

function renderProcess(snapshot) {
  const normalized = normalizeProcess(snapshot);
  processSnapshot = normalized;
  const isError = isProcessError(normalized);
  const diagnosticsVisible = resolveDiagnosticsVisible(debugVisible, {
    processError: isError,
    diagnosticsVisible: normalized.diagnosticsVisible
  });
  const diagnosticJournal = normalized.diagnosticJournal ?? [];
  const journalOptions = {
    processError: isError,
    showFilterToolbar: diagnosticsVisible
  };
  const itemList = shouldUseGenerationStages(normalized) ? buildGenerationStageItems(normalized) : normalized.items;

  dom.processState.textContent = normalized.label ?? 'Ожидание';
  dom.processMessage.textContent = normalized.message ?? '';
  dom.processProgressBar.style.width = `${clampProgress(normalized.progress)}%`;
  const processListScrollTop = dom.processList.scrollTop;
  dom.processList.innerHTML = '';
  for (const [index, item] of (itemList ?? []).entries()) {
    dom.processList.append(makeProcessItem(item, `game-process:${index}`));
  }
  dom.processList.scrollTop = processListScrollTop;
  renderJournal(dom.processJournal, diagnosticJournal, 'diagnostic-journal', journalOptions);
  renderDiagnosticSummary(dom.processSummary, normalized);

  if (dom.processErrorBadge) dom.processErrorBadge.hidden = !isError;
  if (dom.diagnosticsDrawer) dom.diagnosticsDrawer.hidden = !diagnosticsVisible;
  if (dom.gameErrorAlert) {
    dom.gameErrorAlert.hidden = !isError;
    dom.gameErrorAlert.textContent = isError ? buildPlayerFacingError(normalized) : '';
  }
  if (shouldAutoOpenDiagnosticsDrawer(debugVisible, { processError: isError }) && dom.diagnosticsDrawer) {
    dom.diagnosticsDrawer.open = true;
  }

  dom.loadingState.textContent = normalized.label ?? 'Ожидание';
  dom.loadingMessage.textContent = normalized.message ?? '';
  dom.loadingPercent.textContent = `${Math.round(normalized.progress ?? 0)}%`;
  dom.loadingProgressBar.style.width = `${clampProgress(normalized.progress)}%`;
  const loadingListScrollTop = dom.loadingList.scrollTop;
  dom.loadingList.innerHTML = '';
  for (const [index, item] of buildGenerationStageItems(normalized).entries()) {
    dom.loadingList.append(makeProcessItem(item, `generation-stage:${index}`));
  }
  dom.loadingList.scrollTop = loadingListScrollTop;
  if (dom.generationDiagnostics) dom.generationDiagnostics.hidden = !diagnosticsVisible;
  renderJournal(dom.loadingJournal, diagnosticJournal, 'generation-journal', journalOptions);
  renderDiagnosticSummary(dom.loadingDiagnosticSummary, normalized);
  if (dom.loadingError) {
    dom.loadingError.hidden = !isError;
    dom.loadingError.textContent = isError ? buildPlayerFacingError(normalized) : '';
  }
}

function makeProcessItem(item, keyPrefix = 'process') {
  const status = normalizeProcessStatus(item.state ?? item.status);
  const row = document.createElement('div');
  row.className = `process-item ${status}`;

  const head = document.createElement('div');
  head.className = 'process-item-head';
  const label = document.createElement('div');
  label.className = 'process-label';
  label.textContent = item.label ?? 'Этап';
  const badge = document.createElement('div');
  badge.className = 'process-status';
  badge.textContent = PROCESS_STATUS_TEXT[status] ?? status;
  head.append(label, badge);

  const meta = document.createElement('div');
  meta.className = 'process-meta';
  meta.textContent = item.meta ?? item.message ?? '';

  const tech = document.createElement('div');
  tech.className = 'process-tech';
  const techParts = [
    item.alias ? `alias: ${item.alias}` : null,
    item.phase ? `phase: ${item.phase}` : null,
    item.attempt ? `attempt: ${item.attempt}${item.maxAttempts ? `/${item.maxAttempts}` : ''}` : null,
    item.durationMs ? `duration: ${item.durationMs} ms` : null
  ].filter(Boolean);
  tech.textContent = techParts.join(' · ');

  const progress = document.createElement('div');
  progress.className = 'process-item-progress';
  const bar = document.createElement('span');
  bar.style.width = `${clampProgress(resolveItemProgress({ ...item, state: status }))}%`;
  progress.append(bar);
  row.append(head, meta);
  if (techParts.length) row.append(tech);
  row.append(progress);

  if (item.error || item.details) {
    const details = document.createElement('details');
    details.className = 'inline-details';
    bindPersistentDetails(details, buildDetailsKey(keyPrefix, item, 'process-detail'));
    const summary = document.createElement('summary');
    summary.textContent = item.error ? 'Ошибка' : 'Технические детали';
    const body = document.createElement('pre');
    body.className = 'journal-block-body';
    body.textContent = String(item.error ?? item.details ?? '');
    details.append(summary, body);
    row.append(details);
  }

  return row;
}

function normalizeProcess(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      busy: false,
      phase: 'idle',
      label: 'Ожидание',
      message: 'Готов к действию.',
      progress: 0,
      items: [],
      diagnosticJournal: []
    };
  }

  return {
    busy: Boolean(snapshot.busy),
    phase: snapshot.phase ?? 'idle',
    label: snapshot.label ?? 'Ожидание',
    message: snapshot.message ?? '',
    progress: Number.isFinite(snapshot.progress) ? snapshot.progress : 0,
    items: Array.isArray(snapshot.items) ? snapshot.items : [],
    diagnosticJournal: resolveDiagnosticJournal(snapshot),
    diagnosticsVisible: Boolean(snapshot.diagnosticsVisible),
    updatedAt: snapshot.updatedAt ?? null
  };
}

async function refreshProcessView() {
  try {
    const response = await fetch('/api/process', { cache: 'no-store' });
    const payload = await response.json();
    if (response.ok && payload.ok) {
      renderProcess(payload.process);
      return payload.process;
    }
  } catch {
    // ignore polling errors while the server is busy
  }
  return processSnapshot;
}

function startProcessPolling() {
  if (processPollTimer) return;
  processPollTimer = setInterval(async () => {
    if (!loadingVisible && !dom.commandInput.disabled) return;
    await refreshProcessView();
  }, 350);
  void refreshProcessView();
}

function stopProcessPolling() {
  if (processPollTimer) {
    clearInterval(processPollTimer);
    processPollTimer = null;
  }
}

async function requestJson(url, options, timeoutMs) {
  const controller = new AbortController();
  currentRequestController = controller;
  const hasTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
  const timer = hasTimeout
    ? setTimeout(() => controller.abort(new Error('Превышено время ожидания ответа')), timeoutMs)
    : null;
  try {
    const headers = { ...(options?.headers ?? {}) };
    if (apiAuth) {
      headers['X-UI-Token'] = apiAuth.apiToken;
      headers['X-CSRF-Token'] = apiAuth.csrfToken;
    }
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Запрос не выполнен');
    }
    return payload;
  } finally {
    if (timer) clearTimeout(timer);
    if (currentRequestController === controller) {
      currentRequestController = null;
    }
  }
}

function renderJournal(container, journal, keyPrefix = 'journal', options = {}) {
  if (!container) return;
  const scrollTop = container.scrollTop;
  const processError = Boolean(options.processError);
  const activeFilter = journalFilters.get(keyPrefix) ?? 'all';
  ensureJournalToolbar(container, keyPrefix, activeFilter, options);
  container.innerHTML = '';
  const entries = (Array.isArray(journal) ? journal : [])
    .filter((entry) => journalFilterMatches(activeFilter, entry))
    .slice(0, 12);
  if (entries.length === 0) {
    container.append(makeEmptyState(activeFilter === 'all' ? 'Журнал пока пуст' : 'Нет событий для фильтра'));
    container.scrollTop = scrollTop;
    return;
  }

  for (const entry of entries) {
    container.append(makeJournalItem(entry, keyPrefix, { processError }));
  }
  container.scrollTop = scrollTop;
}

function ensureJournalToolbar(container, keyPrefix, activeFilter, options = {}) {
  const showToolbar = Boolean(options.showFilterToolbar);
  let toolbar = journalToolbars.get(container);
  if (!showToolbar) {
    if (toolbar) toolbar.hidden = true;
    return;
  }
  if (!container) return;
  if (!toolbar) {
    toolbar = document.createElement('div');
    toolbar.className = 'journal-toolbar';
    toolbar.dataset.journalPrefix = keyPrefix;
    const filters = document.createElement('div');
    filters.className = 'journal-filters';
    for (const filter of JOURNAL_FILTERS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `journal-filter${filter === activeFilter ? ' is-active' : ''}`;
      button.dataset.journalFilter = filter;
      button.textContent = filter;
      button.addEventListener('click', () => {
        journalFilters.set(keyPrefix, filter);
        renderJournal(container, processSnapshot.diagnosticJournal ?? [], keyPrefix, {
          processError: isProcessError(processSnapshot),
          showFilterToolbar: resolveDiagnosticsVisible(debugVisible, {
            processError: isProcessError(processSnapshot),
            diagnosticsVisible: processSnapshot.diagnosticsVisible
          })
        });
      });
      filters.append(button);
    }
    toolbar.append(filters);
    container.parentElement?.insertBefore(toolbar, container);
    journalToolbars.set(container, toolbar);
  } else {
    toolbar.hidden = false;
  }
  for (const button of toolbar.querySelectorAll('[data-journal-filter]')) {
    button.classList.toggle('is-active', button.dataset.journalFilter === activeFilter);
  }
}

function makeJournalItem(entry, keyPrefix = 'journal-item', options = {}) {
  const processError = Boolean(options.processError);
  const kind = normalizeJournalKind(entry.kind ?? entry.phase);
  const showRaw = shouldShowJournalRaw(entry, processError);
  const row = document.createElement('div');
  row.className = `journal-item ${kind}`;
  row.dataset.kind = kind;
  const top = document.createElement('div');
  top.className = 'journal-top';
  const kindEl = document.createElement('div');
  kindEl.className = 'journal-kind';
  kindEl.textContent = humanizeJournalKind(kind);
  const time = document.createElement('div');
  time.className = 'journal-time';
  time.textContent = formatTime(entry.at);
  top.append(kindEl, time);
  const message = document.createElement('div');
  message.className = 'journal-message';
  message.textContent = buildJournalMessage(entry);
  row.append(top, message);

  const techParts = buildJournalTechParts(entry);
  if (techParts.length) {
    const tech = document.createElement('div');
    tech.className = 'process-tech';
    tech.textContent = techParts.join(' · ');
    row.append(tech);
  }

  if (entry.error) {
    const errorEl = document.createElement('div');
    errorEl.className = 'journal-inline-error';
    errorEl.textContent = String(entry.error);
    row.append(errorEl);
  }

  if (journalEntryHasDetails(entry, showRaw)) {
    const detailsWrap = document.createElement('details');
    detailsWrap.className = 'inline-details';
    bindPersistentDetails(detailsWrap, buildDetailsKey(keyPrefix, entry, 'journal-detail'));
    const detailsSummary = document.createElement('summary');
    detailsSummary.textContent = 'Технические детали';
    const detail = document.createElement('div');
    detail.className = 'journal-detail';
    for (const section of buildJournalSections(entry)) {
      detail.append(makeJournalSection(section.prefix, section.title, section.lines));
    }
    for (const block of buildJournalDetailBlocks(entry, showRaw)) {
      detail.append(makeJournalBlock(block.label, block.text));
    }
    detailsWrap.append(detailsSummary, detail);
    row.append(detailsWrap);
  }
  return row;
}

function bindPersistentDetails(detailsEl, key) {
  if (!detailsEl || !key) return;
  detailsEl.open = openDiagnosticDetails.has(key);
  detailsEl.dataset.detailsKey = key;
  detailsEl.addEventListener('toggle', () => {
    if (detailsEl.open) {
      openDiagnosticDetails.add(key);
    } else {
      openDiagnosticDetails.delete(key);
    }
  });
}

function buildDetailsKey(prefix, source, fallback) {
  const stableParts = [
    prefix,
    fallback,
    source?.id,
    source?.at,
    source?.kind,
    source?.phase,
    source?.alias,
    source?.label,
    source?.message,
    source?.attempt,
    source?.maxAttempts
  ].filter((part) => part !== undefined && part !== null && part !== '');
  return stableParts.join('|');
}

function makeJournalBlock(label, text) {
  const wrap = document.createElement('div');
  wrap.className = 'journal-block';
  const title = document.createElement('div');
  title.className = 'journal-block-title';
  title.textContent = label;
  const body = document.createElement('pre');
  body.className = 'journal-block-body';
  body.textContent = formatJournalValue(text);
  wrap.append(title, body);
  return wrap;
}

function makeJournalSection(prefix, title, lines) {
  const wrap = document.createElement('div');
  wrap.className = 'journal-block journal-block-section';
  const heading = document.createElement('div');
  heading.className = 'journal-block-title';
  heading.textContent = `${prefix}: ${title}`;
  const list = document.createElement('div');
  list.className = 'journal-block-list';
  for (const line of Array.isArray(lines) ? lines : []) {
    const item = document.createElement('div');
    item.className = 'journal-block-line';
    item.textContent = String(line);
    list.append(item);
  }
  wrap.append(heading, list);
  return wrap;
}

function resolveItemProgress(item) {
  if (Number.isFinite(item?.progress)) return item.progress;
  switch (normalizeProcessStatus(item?.state ?? item?.status)) {
    case 'done':
      return 100;
    case 'running':
      return 60;
    case 'retrying':
      return 70;
    case 'warning':
      return 85;
    case 'failed':
      return 100;
    default:
      return 0;
  }
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function isAbortError(error) {
  return Boolean(error && (error.name === 'AbortError' || /отмен/i.test(String(error.message ?? ''))));
}

function shouldUseGenerationStages(snapshot) {
  const phase = String(snapshot?.phase ?? '');
  return currentFlow === 'new-game' || loadingVisible || phase.startsWith('new_game') || phase.startsWith('ng_stage_');
}

function buildGenerationStageItems(snapshot) {
  const phase = snapshot?.phase ?? 'idle';
  const currentId = NEW_GAME_PHASE_STAGE.get(phase) ?? inferStageFromItems(snapshot?.items) ?? 'request';
  const currentIndex = GENERATION_STAGES.findIndex((stage) => stage.id === currentId);
  const hasError = isProcessError(snapshot);
  const sourceItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const sourceText = `${snapshot?.label ?? ''} ${snapshot?.message ?? ''}`.trim();

  return GENERATION_STAGES.map((stage, index) => {
    const source = findMatchingProcessItem(stage, sourceItems);
    const isCurrent = index === currentIndex;
    let state = 'pending';
    if (index < currentIndex || phase === 'done') state = 'done';
    if (isCurrent && snapshot?.busy) state = 'running';
    if (isCurrent && hasError) state = 'failed';
    if (phase === 'done' && index <= currentIndex) state = 'done';
    return {
      ...stage,
      meta: source?.meta ?? source?.message ?? (isCurrent && sourceText ? sourceText : stage.meta),
      state,
      phase: isCurrent ? phase : undefined,
      alias: source?.alias ?? source?.label,
      attempt: source?.attempt ?? latestAttempt(snapshot?.diagnosticJournal),
      maxAttempts: source?.maxAttempts ?? undefined,
      error: state === 'failed' ? snapshot?.message : source?.error,
      progress: state === 'done' ? 100 : isCurrent ? snapshot?.progress : 0
    };
  });
}

function inferStageFromItems(items) {
  const active = (Array.isArray(items) ? items : []).find((item) => ['active', 'running', 'failed', 'error', 'retrying'].includes(String(item?.state ?? item?.status ?? '').toLowerCase()));
  const text = `${active?.label ?? ''} ${active?.meta ?? ''}`.toLowerCase();
  if (/истор|времен|рамк/.test(text)) return 'ng_stage_03';
  if (/социаль|регион|контекст/.test(text)) return 'ng_stage_04';
  if (/кандидат|g1|g2|g3|g4|граф/.test(text)) return 'ng_stage_05';
  if (/геро|игрок|персонаж/.test(text)) return 'ng_stage_11';
  if (/мест|локац/.test(text)) return 'ng_stage_09';
  if (/минилокац|якор|точк сцены|точка сцены|ориентир|g5/.test(text)) return 'ng_stage_13';
  if (/памят|знани|слышал|ошибк|осведомл|маршрут|путь|дорог|route|map|карт/.test(text)) return 'ng_stage_18';
  if (/импульс|нужд|страх|долг|давлен/.test(text)) return 'ng_stage_11';
  if (/npc|нпс|профил|люд/.test(text)) return 'ng_stage_15';
  if (/предмет|контейнер|инвентар|имуществ|ownership|holder/.test(text)) return 'ng_stage_16';
  if (/скрыт|hidden|technical|внутренн/.test(text)) return 'ng_stage_19';
  if (/сцен|первый экран|ui/.test(text)) return 'ng_stage_26';
  if (/проз|рассказч/.test(text)) return 'ng_stage_22';
  if (/сохран|commit|запис/.test(text)) return 'ng_stage_25';
  if (/видим|visible state/.test(text)) return 'ng_stage_20';
  return null;
}

function findMatchingProcessItem(stage, items) {
  const label = stage.label.toLowerCase();
  return items.find((item) => {
    const text = `${item?.label ?? ''} ${item?.meta ?? ''}`.toLowerCase();
    return label.includes(text) || text.includes(stage.id) || text.includes(stage.label.toLowerCase().split(' ')[0]);
  });
}

function latestAttempt(journal) {
  const entry = (Array.isArray(journal) ? journal : []).find((item) => item?.attempt);
  return entry?.attempt ?? null;
}

function normalizeProcessStatus(value) {
  const key = String(value ?? 'pending').toLowerCase();
  return PROCESS_STATUS_LABELS[key] ?? 'pending';
}

function isProcessError(snapshot) {
  const phase = String(snapshot?.phase ?? '').toLowerCase();
  const label = String(snapshot?.label ?? '').toLowerCase();
  const message = String(snapshot?.message ?? '').toLowerCase();
  return phase.includes('error') || label.includes('ошибка') || /ошиб|failed|validation|валид/.test(message);
}

function buildPlayerFacingError(snapshot) {
  const message = String(snapshot?.message ?? '').trim();
  if (!message) return 'Не удалось завершить текущий этап. Подробности сохранены в диагностике ниже.';
  if (String(snapshot?.phase ?? '').startsWith('new_game')) {
    return `Не удалось завершить создание сцены: ${message}`;
  }
  return `Не удалось завершить ход: ${message}`;
}

function renderDiagnosticSummary(container, snapshot) {
  if (!container) return;
  container.innerHTML = '';
  const journal = snapshot?.diagnosticJournal ?? [];
  const lastJournal = Array.isArray(journal) ? journal[0] : null;
  const lastError = findLastDiagnostic(snapshot, /error|fail|ошиб|validation|валид/i);
  const lastLlm = findLastDiagnostic(snapshot, /llm|request|response|call/i);
  const providerState = state?.provider ?? state?.debug?.provider ?? null;
  const providerText = providerState?.enabled
    ? `${providerState.provider ?? 'LLM'} / ${providerState.model ?? 'модель'}`
    : 'нет данных';
  const items = [
    ['LLM / модель', providerText],
    ['Последний этап', snapshot?.label ?? 'Ожидание'],
    ['Последняя ошибка', lastError?.message ?? (isProcessError(snapshot) ? snapshot?.message : 'нет')],
    ['Последний LLM-вызов', lastLlm ? `${lastLlm.label ?? lastLlm.phase ?? 'LLM'}${lastLlm.attempt !== null && lastLlm.attempt !== undefined ? ` · попытка ${lastLlm.attempt}` : ''}${lastLlm.durationMs !== null && lastLlm.durationMs !== undefined ? ` · ${lastLlm.durationMs} ms` : ''}` : 'нет данных'],
    ['Последнее событие', lastJournal ? `${humanizeJournalKind(lastJournal.kind)} · ${formatTime(lastJournal.at)}` : 'нет событий']
  ];

  for (const [label, value] of items) {
    const el = document.createElement('div');
    el.className = 'diagnostic-summary-item';
    const strong = document.createElement('strong');
    strong.textContent = label;
    const span = document.createElement('span');
    span.textContent = String(value ?? '—');
    el.append(strong, span);
    container.append(el);
  }
}

function findLastDiagnostic(snapshot, pattern) {
  return (Array.isArray(snapshot?.diagnosticJournal) ? snapshot.diagnosticJournal : []).find((entry) => {
    const text = `${entry?.kind ?? ''} ${entry?.phase ?? ''} ${entry?.label ?? ''} ${entry?.message ?? ''}`;
    return pattern.test(text);
  }) ?? null;
}

function clampProgress(value) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

async function copyDiagnostics(snapshot) {
  const text = formatProcessForClipboard(snapshot);
  try {
    await navigator.clipboard.writeText(text);
    setCommandBusy(dom.commandInput.disabled, 'Диагностика скопирована.');
  } catch {
    setCommandBusy(dom.commandInput.disabled, 'Не удалось скопировать диагностику.');
  }
}

function formatProcessForClipboard(snapshot) {
  const normalized = normalizeProcess(snapshot);
  const lines = [
    `phase: ${normalized.phase}`,
    `label: ${normalized.label}`,
    `message: ${normalized.message}`,
    `progress: ${normalized.progress}`,
    '',
    'items:'
  ];
  for (const item of normalized.items ?? []) {
    lines.push(`- [${normalizeProcessStatus(item.state ?? item.status)}] ${item.label ?? 'stage'} — ${item.meta ?? item.message ?? ''}`);
  }
  lines.push('', 'diagnosticJournal:');
  for (const entry of normalized.diagnosticJournal ?? []) {
    lines.push(`- ${entry.at ?? ''} ${entry.kind ?? ''} ${entry.label ?? ''}: ${entry.message ?? ''}`);
  }
  return lines.join('\n');
}

function humanizeIntent(intent) {
  const text = String(intent ?? '').trim();
  if (!text) return 'последствие';
  const map = {
    move: 'движение',
    talk: 'разговор',
    inspect: 'осмотр',
    take: 'взять',
    use: 'действие',
    attack: 'опасное действие',
    wait: 'ожидание'
  };
  return map[text] ?? text;
}

function makeOrientationScheme(nextState) {
  const wrap = document.createElement('div');
  wrap.className = 'orientation-scheme';
  const current = cleanUiText(nextState.microPlace?.name || nextState.place?.name) || 'текущее место';
  wrap.append(makeOrientationItem(`Сейчас: ${current}`));
  const exits = describeOrientationExits(nextState);
  if (exits.length) {
    for (const exit of exits.slice(0, 5)) wrap.append(makeOrientationItem(`Можно пройти: ${exit}`));
  } else {
    wrap.append(makeOrientationItem('Явные переходы пока не описаны'));
  }
  return wrap;
}

function makeOrientationItem(text) {
  const item = document.createElement('div');
  item.className = 'orientation-item';
  item.textContent = text;
  return item;
}

function makeMeter(label, value) {
  const normalized = Math.max(0, Math.min(100, Number(value ?? 0)));
  const wrap = document.createElement('div');
  wrap.className = 'meter';
  wrap.dataset.stat = label.toLowerCase();
  wrap.dataset.level = getValueLevel(normalized);

  const top = document.createElement('div');
  top.className = 'meter-top';
  const name = document.createElement('span');
  name.className = 'meter-label';
  name.textContent = label;
  const number = document.createElement('strong');
  number.className = 'meter-value';
  number.textContent = String(Math.round(normalized));
  top.append(name, number);

  wrap.append(top);
  return wrap;
}

function makeField(label, value) {
  const row = document.createElement('div');
  row.className = 'field';
  const key = document.createElement('div');
  key.className = 'field-key';
  key.textContent = label;
  const val = document.createElement('div');
  val.className = 'field-value';
  val.textContent = Array.isArray(value) ? joinInline(value) : String(value ?? '—');
  row.append(key, val);
  return row;
}

function makeSectionTitle(text) {
  const el = document.createElement('div');
  el.className = 'section-title';
  el.textContent = text;
  return el;
}

function makeCardTitle(title, meta) {
  const wrap = document.createElement('div');
  wrap.className = 'card-title';
  const main = document.createElement('div');
  main.className = 'card-title-main';
  main.textContent = title || 'Без названия';
  const sub = document.createElement('div');
  sub.className = 'card-title-sub';
  sub.textContent = meta || '';
  wrap.append(main, sub);
  return wrap;
}

function makeMiniLine(text) {
  const el = document.createElement('div');
  el.className = 'mini-line';
  el.textContent = text || '';
  return el;
}

function makeSceneAction(item) {
  const data = typeof item === 'object' && item !== null ? item : { label: String(item ?? ''), command: String(item ?? ''), action: 'inspect' };
  const command = data.command || data.text || data.label || '';
  const label = data.label || data.text || data.command || 'Действие';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'note action-chip';
  button.dataset.icon = sceneActionIcon(data.action, label);
  const tone = cleanUiText(data.tone);
  const risk = cleanUiText(data.risk_hint);
  button.textContent = tone || risk ? `${label} · ${[tone, risk].filter(Boolean).join(' / ')}` : label;
  button.title = [label, tone, risk].filter(Boolean).join(' · ');
  button.addEventListener('click', () => {
    if (!command || !dom.commandInput) return;
    dom.commandInput.value = command;
    dom.commandInput.focus();
    dom.commandInput.setSelectionRange(command.length, command.length);
  });
  return button;
}

function makeNote(text) {
  const el = document.createElement('div');
  el.className = 'note';
  el.textContent = text;
  return el;
}

function makeList(items, emptyText, limit = 4) {
  const wrap = document.createElement('div');
  wrap.className = 'stack-list';
  const list = Array.isArray(items) ? items : [];
  const maxItems = Number.isFinite(limit) && limit > 0 ? limit : 4;
  if (list.length === 0) {
    if (emptyText) {
      wrap.append(makeEmptyState(emptyText));
    }
    return wrap;
  }

  for (const item of list.slice(0, maxItems)) {
    const row = document.createElement('div');
    row.className = 'stack-item';
    row.textContent = typeof item === 'string' ? item : JSON.stringify(item);
    wrap.append(row);
  }

  if (list.length > maxItems) {
    const more = document.createElement('div');
    more.className = 'stack-item stack-item-more';
    more.textContent = `Ещё ${list.length - maxItems}`;
    wrap.append(more);
  }
  return wrap;
}

function summarizeActorProfileLines(profile, options = {}) {
  if (!profile || typeof profile !== 'object') {
    return [];
  }

  const identity = profile.identity ?? {};
  const kinship = profile.kinship ?? {};
  const property = profile.property ?? {};
  const work = profile.work ?? {};
  const body = profile.body ?? {};
  const mind = profile.mind ?? {};
  const lines = [];

  pushKnownLine(lines, 'Кто он', identity.worldPosition, identity.socialPosition, work.occupation);
  pushKnownLine(lines, 'Почему здесь', identity.reasonHere, work.currentActivity, work.nextTask);
  pushKnownLine(lines, 'Что заметно', identity.visibleStatus, body.bodyState, body.clothing);
  pushKnownLine(lines, 'С кем связан', kinship.answerableTo, work.dutyTo, kinship.responsibleFor);
  pushKnownLine(lines, 'Что скрывает', mind.hidden, mind.misunderstood);
  pushKnownLine(lines, 'Чего боится', mind.fears);
  pushKnownLine(lines, 'Чего хочет', mind.goals);

  const cleaned = lines.map((line) => cleanUiText(line)).filter(Boolean);
  return options?.npc ? cleaned.slice(0, 4) : cleaned;
}

function formatProfileValue(value) {
  return trimKnownText(value);
}

function formatObservedOwnership(value) {
  if (!value) return 'неизвестно';
  if (typeof value === 'string') return value;
  const owner = value.name ?? value.ownerName ?? 'неизвестно';
  const kind = value.kind ? ` (${value.kind})` : '';
  return `${owner}${kind}`;
}

function makeEmptyState(text) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.textContent = text;
  return el;
}

function sanitizeNarrativeText(value) {
  const raw = String(value ?? '').replace(/\r/g, '');
  if (!raw.trim()) return '';

  const cleanedLines = raw
    .split('\n')
    .map((line) => cleanNarrativeLine(line))
    .filter(Boolean);

  const prose = collapseRepeatedSegments(cleanedLines.join('\n\n'))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return prose;
}

function cleanNarrativeLine(value) {
  const text = trimKnownText(value);
  if (!text) return '';
  if (looksTechnical(text)) return '';

  return collapseRepeatedSegments(text)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanUiText(value) {
  const text = trimKnownText(value);
  if (!text) return '';

  const compact = collapseRepeatedSegments(text)
    .replace(/\s*[·•]\s*/g, ' · ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!compact) return '';
  if (looksTechnical(compact)) return '';
  return compact;
}

function looksTechnical(text) {
  const lower = String(text ?? '').toLowerCase().trim();
  if (!lower) return true;
  if (/(^|[\s:])seed([-\s:]|$)/i.test(lower)) return true;
  if (/^загружено:/i.test(lower)) return true;
  if (/^summary:/i.test(lower)) return true;
  if (/^stage:/i.test(lower)) return true;
  if (/^debug/i.test(lower)) return true;
  if (/diagnostic|pipeline|json|internal|raw|service|provider|llm/i.test(lower)) return true;
  if (/new_game|time_place|historical_frame|regional_context|coherence/i.test(lower)) return true;
  if (/оказал(?:ся|ась|ись)\s+в\s+месте\s+[a-z0-9:_-]+/i.test(lower)) return true;
  if (/^[\w-]+\s*:\s*[\[{]/.test(lower)) return true;
  return false;
}

function collapseRepeatedSegments(text) {
  const parts = String(text ?? '')
    .split(/\s+·\s+|\s+\-\s+|\s+–\s+/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return String(text ?? '').trim();
  }

  const unique = [];
  for (const part of parts) {
    const prev = unique[unique.length - 1];
    if (prev && prev.toLowerCase() === part.toLowerCase()) continue;
    unique.push(part);
  }
  return unique.join(' · ');
}

function uniqueTextParts(parts) {
  const result = [];
  const seen = new Set();
  for (const part of parts) {
    const clean = cleanUiText(part);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

function buildImportantSceneCue(nextState) {
  const atmosphere = nextState.visibleScene?.markup?.atmosphere ?? {};
  const parts = uniqueTextParts([
    atmosphere.mood,
    atmosphere.access,
    atmosphere.currentPeriod
  ]);
  if (!parts.length) return '';
  return parts.join(' · ');
}

function buildNpcSummary(npc) {
  return uniqueTextParts([
    npc.mood,
    npc.status,
    npc.visibleStatus,
    npc.relationshipToScene
  ]).slice(0, 2).join(' · ');
}

function summarizeLawForPlayer(legal) {
  const rules = (legal?.behavioralRules ?? []).map((item) => cleanUiText(item)).filter(Boolean);
  const punishments = (legal?.punishments ?? []).map((item) => cleanUiText(item)).filter(Boolean);
  const statusRules = (legal?.statusRules ?? []).map((item) => cleanUiText(item)).filter(Boolean);

  return uniqueTextParts([
    punishments[0] ? `Грозит: ${punishments[0]}` : null,
    rules[0] ? `Опасно: ${rules[0]}` : null,
    statusRules[0] ? `Защитить может: ${statusRules[0]}` : null
  ]).slice(0, 4);
}

function buildLawBadge(legal) {
  const punishments = (legal?.punishments ?? []).length;
  if (punishments > 0) return `${punishments} угрозы`;
  const rules = (legal?.behavioralRules ?? []).length;
  return rules ? `${rules} правила` : 'тихо';
}

function humanizeRoute(value) {
  const text = cleanUiText(value);
  if (!text) return '';
  if (/^переход:/i.test(text)) return text.replace(/^переход:\s*/i, '');
  return text;
}

function buildOrientationBadge(nextState) {
  const current = simplifyMicroPlaceLabel(nextState?.place?.name, nextState?.microPlace?.name)
    || simplifyPlaceLabel(nextState?.place?.name);
  return current ? `Сейчас: ${current}` : '';
}

function getValueLevel(value) {
  if (value <= 20) return 'low';
  if (value <= 70) return 'mid';
  return 'high';
}

function simplifyPlaceLabel(value) {
  return cleanUiText(value);
}

function simplifyMicroPlaceLabel(placeValue, microValue) {
  const place = cleanUiText(placeValue);
  const micro = cleanUiText(microValue);
  if (!micro) return '';
  if (!place) return micro;

  const placeLower = place.toLowerCase();
  const microLower = micro.toLowerCase();
  if (microLower === placeLower) return '';

  const prefixPatterns = [
    new RegExp(`^${escapeRegExp(place)}\\s+[·\\-–—:]\\s+`, 'iu'),
    new RegExp(`^${escapeRegExp(place)}\\s+`, 'iu')
  ];

  let simplified = micro;
  for (const pattern of prefixPatterns) {
    simplified = simplified.replace(pattern, '').trim();
  }

  simplified = simplified.replace(/^(у|в|на)\s+/iu, '').trim();
  return cleanUiText(simplified) || micro;
}

function humanizePlayerGoal(value) {
  const text = cleanUiText(value);
  if (!text) return '';
  if (/^выплатить выход$/i.test(text)) return '';
  return text;
}

function sanitizeStatusText(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/^загружено:/i.test(text)) return 'Мир готов. Опиши действие.';
  return text;
}

function escapeRegExp(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function summarizeThreat(nextState) {
  const trace = String(nextState.socialTrace ?? '').trim();
  const suspicion = nextState.socialSummary?.suspicion ?? 0;
  const witnesses = nextState.socialSummary?.recentWitnesses ?? 0;
  const bleeding = nextState.player?.bleeding ?? 0;
  const base = `Подозрение ${suspicion} · Свидетели ${witnesses} · Кровь ${bleeding}`;
  if (!trace) return `Как о тебе помнят здесь: ${base}`;
  return `Как о тебе помнят здесь: ${trace} · ${base}`;
}

function joinInline(values) {
  return joinKnown(values, ' / ');
}

function joinKnown(values, separator = ' / ') {
  const list = Array.isArray(values) ? values : [values];
  return list
    .flatMap((item) => (Array.isArray(item) ? item : [item]))
    .map((item) => trimKnownText(item))
    .filter(Boolean)
    .join(separator);
}

function trimKnownText(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const normalized = text.toLowerCase();
  const emptyValues = new Set([
    '—',
    '-',
    'неизвестно',
    'неизвестный',
    'неизвестная',
    'неизвестные',
    'не предоставлено',
    'нет данных',
    'без роли',
    'без статуса',
    'без микролокации'
  ]);
  if (emptyValues.has(normalized)) return '';
  return text;
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function pushKnownLine(lines, label, ...values) {
  const text = joinKnown(values, ' · ');
  if (!text) return;
  lines.push(`${label}: ${text}`);
}

function setTextOrHide(element, value) {
  if (!element) return;
  const text = trimKnownText(value);
  element.textContent = text;
  element.hidden = !text;
}

function countCurrentGraphNodes(nextState) {
  const graph = nextState.debug?.cluster?.graph;
  if (!graph?.nodes) return 0;
  const currentLocationId = nextState.currentPosition?.location_id ?? nextState.currentLocationId ?? '';
  return graph.nodes.filter((node) => node.id.includes(currentLocationId)).length;
}

function buildGraphSvg(nodes, edges, currentPositionOrLocation, currentMicroLocationId) {
  const currentLocationId = currentPositionOrLocation?.location_id
    ?? currentPositionOrLocation?.place_id
    ?? currentPositionOrLocation
    ?? '';
  const width = 560;
  const height = 360;
  const cx = width / 2;
  const cy = height / 2;
  const radius = 110;
  const microNodes = nodes.filter((node) => node.id.startsWith(`micro:${currentLocationId}`));
  const parentNode = nodes.find((node) => node.id === `location:${currentLocationId}`);
  const positions = new Map();

  if (parentNode) {
    positions.set(parentNode.id, { x: cx, y: cy });
  }

  microNodes.forEach((node, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(1, microNodes.length);
    positions.set(node.id, {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius
    });
  });

  for (const node of nodes) {
    if (positions.has(node.id)) continue;
    const parent = findParentPosition(node, positions, currentLocationId, cx, cy);
    const offset = hashString(node.id) % 3;
    positions.set(node.id, {
      x: parent.x + (offset === 0 ? -36 : offset === 1 ? 0 : 36),
      y: parent.y + (offset === 0 ? -28 : offset === 1 ? 28 : 0)
    });
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'graph-svg');

  for (const edge of edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', from.x);
    line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x);
    line.setAttribute('y2', to.y);
    line.setAttribute('class', `graph-edge graph-edge-${edge.type ?? 'link'}`);
    svg.append(line);
  }

  for (const node of nodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', node.id === `location:${currentLocationId}` ? 18 : node.id === currentMicroLocationId ? 13 : 10);
    circle.setAttribute('class', `graph-node graph-node-${node.type ?? 'item'}${node.id === `location:${currentLocationId}` ? ' is-current' : ''}${node.id === currentMicroLocationId || node.id === `micro:${currentLocationId}:${currentMicroLocationId}` ? ' is-active' : ''}`);
    group.append(circle);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', pos.x);
    label.setAttribute('y', pos.y + 24);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('class', 'graph-label');
    label.textContent = trimLabel(node.label ?? node.id);
    group.append(label);
    svg.append(group);
  }

  return svg;
}

function findParentPosition(node, positions, currentLocationId, cx, cy) {
  if (node.id.startsWith(`door:${currentLocationId}`) || node.id.startsWith(`container:${currentLocationId}`) || node.id.startsWith(`entry:${currentLocationId}`)) {
    const locationPos = positions.get(`location:${currentLocationId}`);
    return locationPos ?? { x: cx, y: cy };
  }

  if (node.id.startsWith(`micro:${currentLocationId}`)) {
    const locationPos = positions.get(`location:${currentLocationId}`);
    return locationPos ?? { x: cx, y: cy };
  }

  const locationPos = positions.get(`location:${currentLocationId}`);
  return locationPos ?? { x: cx, y: cy };
}

function hashString(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function trimLabel(text) {
  const value = String(text ?? '');
  return value.length > 18 ? `${value.slice(0, 17)}…` : value;
}
