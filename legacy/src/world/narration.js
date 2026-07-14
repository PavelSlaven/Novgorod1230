import { getCurrentLocation } from './location.js';
import { describeSocialState } from './social.js';
import { getActiveStateValue, mirrorBodyStateFields, upsertActiveState } from './profile-v2.js';

function joinList(value, separator = '; ', fallback = 'не предоставлено') {
  return Array.isArray(value) && value.length > 0 ? value.join(separator) : fallback;
}

export function renderOpeningScene(world) {
  return [
    'Мир загружен.',
    '',
    ...renderLayers(world),
    '',
    'Ввод только свободным текстом: описывай, кем ты хочешь быть, что делаешь и к чему стремишься. Я трактую это как намерение, а не как набор кнопок, меню или заранее заданных вариантов.'
  ].join('\n');
}

export function renderLayers(world) {
  const location = getCurrentLocation(world);
  return [
    `Исторический слой: ${world.history.era}, ${world.history.year}, ${world.history.season}.`,
    `Регион: ${world.region.name}.`,
    `Место: ${location?.name ?? world.place.name} (${location?.kind ?? world.place.kind}).`,
    world.microPlace?.name ? `Микролокация: ${world.microPlace.name} (${world.microPlace.kind}).` : null,
    world.microPlace?.doors?.length ? `Двери: ${formatLabels(world.microPlace.doors, '; ')}.` : null,
    world.microPlace?.containers?.length ? `Заметные контейнеры: ${formatLabels(world.microPlace.containers, '; ')}.` : null,
    `Сцена: ${world.scene.light}; ${world.scene.weather}.`,
    `Текущее давление мира: ${joinList(world.scene.pressure)}.`,
    `Социальный слой: ${describeSocialState(world)}`
  ];
}

export function buildObservation(world) {
  const location = getCurrentLocation(world);
  const traces = (Array.isArray(location?.recentTraces) ? location.recentTraces : []).slice(0, 3).map((trace) => trace.text);
  return [
    'Ты осматриваешься, и мир отвечает сразу несколькими слоями.',
    `Шире: ${joinList(world.history.macroForces)}.`,
    `Здесь: ${joinList(world.region.tensions)}.`,
    `Ориентиры места: ${joinList(location?.landmarks ?? world.place.landmarks)}.`,
    world.microPlace?.visibleObjects?.length ? `В поле зрения: ${joinList(world.microPlace.visibleObjects)}.` : null,
    world.microPlace?.traces?.length ? `Ближайшие следы: ${joinList(world.microPlace.traces.slice(0, 3))}.` : null,
    world.microPlace?.doors?.length ? `Переходы внутри: ${formatLabels(world.microPlace.doors, '; ')}.` : null,
    `Сейчас: ${joinList(location?.sounds ?? world.scene.sounds)}.`,
    traces.length > 0 ? `Свежие следы: ${joinList(traces)}.` : 'Свежих следов пока мало, но место не пустое.',
    world.memory.heardRumors.length ? `Слухи, которые уже держатся в памяти мира: ${joinList(world.memory.heardRumors.slice(0, 2))}.` : 'Слухи ещё не успели закрепиться.',
    describeSocialState(world)
  ].join(' ');
}

export function buildWaitResult(world) {
  const location = getCurrentLocation(world);
  return [
    'Ты ждёшь, и время не стоит на месте.',
    `Пока ты медлишь, ${advanceScenePressure(world)}.`,
    `В месте по-прежнему заметны: ${joinList(location?.occupants ?? world.place.occupants, ', ')}.`
  ].join(' ');
}

export function buildMoveResult(world, intent, travel = null) {
  const location = getCurrentLocation(world);
  const destination = intent.target ?? 'неизвестно куда';
  if (travel?.ok) {
    return [
      travel.text,
      `Новое место уже держит свои следы: ${joinList((location?.recentTraces ?? []).slice(0, 3).map((trace) => trace.text), '; ', 'пока следов немного')}.`,
      world.microPlace?.name ? `Текущая микролокация: ${world.microPlace.name}.` : null
    ].join(' ');
  }

  return [
    `Ты пытаешься двигаться ${destination}, но дорога здесь требует ясности и цены.`,
    'Если направление не подтверждено наблюдением или вопросом к людям, движение превращается в риск, а не в автоматический переход.',
    `Сейчас ближайший ориентир: ${formatLabels(world.place.exits, '; ')}.`
  ].join(' ');
}

export function buildTalkResult(world, intent) {
  if (intent.target) {
    const targetMatch = resolveTalkTarget(world, intent.target);
    const location = getCurrentLocation(world);

    if (targetMatch.npc) {
      const placeOccupants = Array.isArray(location?.occupants) ? location.occupants : (Array.isArray(world.place?.occupants) ? world.place.occupants : []);
      const isPresent = placeOccupants.includes(targetMatch.npc.name);
      const roleText = targetMatch.resolvedByRole ? `, ${targetMatch.npc.role}` : '';
      const leadText = targetMatch.resolvedByRole
        ? `Ты спрашиваешь о ${intent.target}, и здесь вместо точного старосты отвечает ${targetMatch.npc.name}${roleText}.`
        : `Ты обращаешься к ${targetMatch.npc.name}${roleText}, и ответ зависит от статуса, тона и правдоподобия твоих слов.`;
      return [
        isPresent
          ? leadText
          : targetMatch.resolvedByRole
            ? `${leadText} Он не обязан быть в центре двора, но для этого места он остаётся местным старшим.`
            : `${targetMatch.npc.name} сейчас не здесь, и попытка поговорить с ним остаётся обращением в пустоту.`,
        `${targetMatch.npc.name} выглядит так: ${targetMatch.npc.mood}.`,
        'Он отвечает только тем, что мог бы знать, видеть, помнить или социально произнести здесь и сейчас.',
        describeSocialState(world)
      ].join(' ');
    }
  }

  return [
    'Ты говоришь с людьми в дворе, но тебя не ведут к автоматическому согласию.',
    'Сначала важно, кто ты, с чем пришёл и почему тебе вообще должны отвечать.',
    `Здесь присутствуют: ${joinList((Array.isArray(world.npcs) ? world.npcs : []).map((npc) => npc.name), ', ')}.`
  ].join(' ');
}

function resolveTalkTarget(world, targetText) {
  const npcs = Array.isArray(world.npcs) ? world.npcs : [];
  const needle = normalizeTalkTerm(targetText);
  if (!needle) return { npc: null, resolvedByRole: false };

  const location = getCurrentLocation(world);
  const placeOccupants = new Set([
    ...(Array.isArray(location?.occupants) ? location.occupants : []),
    ...(Array.isArray(world.place?.occupants) ? world.place.occupants : [])
  ].map((item) => String(item ?? '').trim()).filter(Boolean));

  const exactMatch = npcs.find((item) => matchesTalkTerm(item.name, needle) || matchesTalkTerm(item.role, needle));
  if (exactMatch) {
    return { npc: exactMatch, resolvedByRole: false };
  }

  if (isAuthorityRequest(needle)) {
    const localAuthority = npcs.find((item) =>
      placeOccupants.has(item.name)
      && /хозяин|староста|чиновник|сторож|старш/i.test(normalizeTalkTerm(item.role))
    ) ?? npcs.find((item) =>
      /хозяин|староста|чиновник|сторож|старш/i.test(normalizeTalkTerm(item.role))
    );

    if (localAuthority) {
      return { npc: localAuthority, resolvedByRole: true };
    }
  }

  return { npc: null, resolvedByRole: false };
}

function isAuthorityRequest(term) {
  return /старост|хозяин|чиновник|сторож|старш/i.test(term);
}

function matchesTalkTerm(value, needle) {
  const haystack = normalizeTalkTerm(value);
  if (!haystack || !needle) return false;
  if (haystack === needle) return true;
  if (haystack.includes(needle) || needle.includes(haystack)) return true;
  return sharedStem(haystack, needle);
}

function sharedStem(left, right) {
  const minLength = Math.min(left.length, right.length);
  if (minLength < 4) return false;
  const prefixLength = Math.max(4, Math.floor(minLength * 0.7));
  return left.slice(0, prefixLength) === right.slice(0, prefixLength);
}

function normalizeTalkTerm(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/gu, 'е')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

export function buildRouteInquiryResult(world, intent, reconstruction = null) {
  return [
    'Ты спрашиваешь о дороге, и ответ здесь не абстрактный: он зависит от сезона, света, власти, слухов и того, кто вообще может поручиться за путь.',
    reconstruction?.summary ?? 'Историческая реконструкция маршрута пока не собрана полностью.',
    intent.target ? `Речь идёт о: ${intent.target}.` : 'Маршрут приходится выводить из контекста места и сезона.',
    reconstruction?.selected?.availability ? `Состояние: ${reconstruction.selected.availability}, риск: ${reconstruction.selected.risk}, время: ${reconstruction.selected.minutes} мин.` : null
  ].filter(Boolean).join(' ');
}

export function buildRestResult(world) {
  return [
    'Ты отдыхаешь или пытаешься спать, но это всё равно занимает время и происходит в реальной обстановке.',
    'Отдых может снизить усталость, но не отменяет голод, жажду и чужие взгляды.',
    'Пока ты лежишь, двор продолжает жить своим ходом.'
  ].join(' ');
}

export function buildTradeResult(world, intent) {
  const location = getCurrentLocation(world);
  return [
    'Торг возможен только если есть предмет, собеседник и причина, по которой тебя не прогонят.',
    intent.target
      ? `Ты пытаешься торговаться с ${intent.target}, но проверка доверия ещё впереди.`
      : 'Ты пока не назвал конкретного собеседника или товар.',
    `Нехватка, статус и правдоподобие важнее твоего желания обменяться. Здесь сейчас: ${(location?.occupants ?? world.place.occupants).join(', ')}.`,
    describeSocialState(world)
  ].join(' ');
}

export function buildAttackResult(world) {
  const currentFear = getActiveStateValue(world.player, 'fear') ?? 0;
  upsertActiveState(world.player, 'fear', 'страх', Math.min(100, currentFear + 12), 'derived');
  mirrorBodyStateFields(world.player);
  return [
    'Попытка насилия мгновенно меняет сцену: шум, свидетели и последствия важнее удачи.',
    'Без преимущества, оружия, расстояния и повода это не героический ход, а ухудшение положения.',
    `Текущее напряжение двора: ${world.scene.attention}.`,
    describeInjuryStatus(world),
    describeSocialState(world)
  ].join(' ');
}

export function buildDefendResult(world, intent) {
  return [
    'Ты переходишь в оборону: дистанция, укрытие, оружие и выносливость теперь важнее намерения.',
    intent.target ? `Ты защищаешься от ${intent.target}.` : 'Ты защищаешься от прямой угрозы или давления.',
    `Окружающая сцена: ${world.scene.weather}, ${world.scene.light}.`,
    describeInjuryStatus(world),
    describeSocialState(world)
  ].join(' ');
}

export function buildFleeResult(world, intent) {
  return [
    'Побег тоже часть боя: время, пространство, свидетели и усталость решают исход не меньше, чем смелость.',
    intent.target ? `Ты пытаешься уйти от ${intent.target}.` : 'Ты пытаешься выйти из опасной сцены.',
    `Доступные пути: ${formatLabels(world.place?.exits, '; ') || 'нет'}.`,
    describeInjuryStatus(world),
    describeSocialState(world)
  ].join(' ');
}

export function buildTreatResult(world, intent) {
  const injuries = Array.isArray(world.player.injuries) ? world.player.injuries : [];
  const active = injuries.filter((item) => !item.treated && (item.severity ?? 0) > 0);
  return [
    'Лечение здесь понимается как перевязка, промывка, прижигание, отдых и поиск того, что реально доступно в XIII веке.',
    active.length > 0
      ? `Есть раны: ${active.map((item) => item.label).join('; ')}.`
      : 'Явных незалеченных ран нет, но осмотр всё равно может быть полезен.',
    intent.target
      ? `Ты стараешься обработать ${intent.target}.`
      : 'Ты пытаешься остановить кровь и снизить риск дальнейшего ухудшения.',
    describeInjuryStatus(world)
  ].join(' ');
}

export function buildClaimResult(world, intent) {
  world.player.claims.push(intent.raw);
  return [
    'Мир не принимает заявление за факт.',
    'Твоё утверждение сохранено как претензия, а не как подтверждённая реальность.',
    'Теперь оно может вызвать доверие, сомнение, проверку или прямой конфликт.',
    describeSocialState(world)
  ].join(' ');
}

export function buildStealResult(world, intent) {
  return [
    'Попытка присвоить чужую вещь упирается в право собственности, свидетелей и память хозяина.',
    intent.target
      ? `Целью выглядит ${intent.target}, но кража не становится незаметной только потому, что ты так решил.`
      : 'Ты не назвал, что именно хочешь взять, а мир не отдаёт вещи без цены.',
    'Если предмет известен хозяину, последствия обычно включают поиск, подозрение и возврат.',
    describeSocialState(world)
  ].join(' ');
}

export function buildAmbiguousResult(world) {
  const location = getCurrentLocation(world);
  return [
    'Намерение понятно не до конца, и это тоже часть симуляции.',
    'Я не превращаю туманную фразу в удобный успех.',
    `Если хочешь, уточни действие, адресата или цель. Текущее место: ${location?.name ?? world.place.name}.`
  ].join(' ');
}

function describeInjuryStatus(world) {
  const injuries = Array.isArray(world.player.injuries) ? world.player.injuries : [];
  const active = injuries.filter((item) => (item.severity ?? 0) > 0);
  const bleeding = world.player.bleeding ?? 0;
  const health = world.player.health ?? 100;

  if (active.length === 0 && bleeding <= 0) {
    return `Ранений нет, здоровье ${health}, кровотечение отсутствует.`;
  }

  const woundText = active.length > 0
    ? `Раны: ${active.map((item) => `${item.label}${item.treated ? ' (перевязана)' : ''}`).join('; ')}.`
    : 'Раны уже почти закрыты.';

  return `${woundText} Кровотечение: ${bleeding}. Здоровье: ${health}.`;
}

function advanceScenePressure(world) {
  const pressure = world.scene.pressure;
  const next = pressure[0] ?? '';
  world.scene.pressure = [pressure[1], pressure[2], next].filter((item) => item !== undefined);
  return `изменяется внимание людей: ${next}`;
}

function formatLabels(value, separator = '; ') {
  if (!Array.isArray(value) || value.length === 0) return '';
  return value
    .map((item) => String(item?.label ?? item?.name ?? item?.direction ?? item ?? '').trim())
    .filter(Boolean)
    .join(separator);
}
