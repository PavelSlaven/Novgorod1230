// Scripted legs of the D49 slice (start → walk out → meet → talk → take → make) over the public API.
// Pure of I/O: `api` (HTTP client) and `sql` (snapshot reader) are injected, so unit tests use fakes.
// A turn that fails is data (fail with the API error code), not an exception.

import { openingAttemptFromNewGame, partyIdFromNewGameRequestId } from './v17-slice-opening-trace.js';

export const RESERVE_MAKE_TURNS = 3;
const LOOK = 'Осматриваюсь вокруг.';
const MAKE_PHRASES = Object.freeze([
  'Оторву полосу от подола рубахи.',
  'Оторву лоскут от нижней рубахи.',
  'Отрежу кусок от штанов на повязку.'
]);
const TAKE_PHRASES = Object.freeze([
  { match: /deadwood/u, texts: ['Беру валежник.', 'Поднимаю с земли валежину.'] },
  { match: /driftwood/u, texts: ['Беру плавник.', 'Поднимаю с земли плавник.'] },
  { match: /.*/u, texts: ['Беру то, что лежит рядом.'] }
]);
const OPENING_REJECTED = 'AUTHORED_OPENING_AUDIT_REJECTED';
const PRESENTATION_PENDING = 'committed_presentation_pending';

class Blocked extends Error {}

const labelOf = (entry) => entry?.display_label ?? entry?.label ?? entry?.name ?? entry?.title ?? null;
export function capturePeoplePanel(screen, snap = null) {
  const panel = screen?.panels?.people;
  const data = panel?.data ?? {};
  return {
    panel_exists: panel != null,
    visible: panel?.visible ?? null,
    visible_npcs_count: Array.isArray(data.visible_npcs) ? data.visible_npcs.length : 0,
    people_count: Array.isArray(data.people) ? data.people.length : 0,
    active_interlocutor_exists: data.active_interlocutor != null,
    placement_npc_ids: (snap?.placements_here ?? []).filter((row) => row.entity_kind === 'npc')
      .map((row) => row.entity_id).filter((id) => id != null),
    visible_context_npc_ids: (screen?.visible_context?.visible_npc ?? [])
      .map((row) => row?.entity_ref?.entity_id).filter((id) => id != null)
  };
}
const peopleOf = (screen) => {
  const panel = screen?.panels?.people;
  if (!panel?.visible) return [];
  const data = panel.data ?? {};
  return (data.people ?? data.visible_npcs ?? data.npcs ?? []).map(labelOf).filter(Boolean);
};
const siteKey = (snap) => String(snap?.position?.site_id ?? '?');
export const positionProgressed = (before, after) => {
  const left = before?.position;
  const right = after?.position;
  if (!left?.site_id || !right?.site_id) return false;
  return left.site_id !== right.site_id
    || String(left.slot ?? '') !== String(right.slot ?? '');
};
const npcsHere = (snap) => (snap?.placements_here ?? []).filter((row) => row.entity_kind === 'npc');
const liveNodes = (snap) => (snap?.resource_nodes ?? []).filter((row) => Number(row.quantity_numerator) > 0);
const liveNodesHere = (snap) => liveNodes(snap).filter((row) => row.site_id === snap?.position?.site_id);
const heldItems = (snap) => (snap?.items ?? []).filter((row) => row.holder != null);
const placeName = (snap) => snap?.position?.canonical_g5?.replace(/^.*_r2_/u, '') ?? snap?.position?.generated_template ?? snap?.position?.site_id ?? '?';

/**
 * @param {object} p
 * @param {{ newGame, ack, screen, turn, recover }} p.api  each returns { status, ok, data, error }
 * @param {{ snapshot(partyId): Promise<object> }} p.sql
 * @param {(screen) => string[]} p.routeLabels
 * @param {{ count(): number }} p.llm  running LLM call counter
 * @param {() => number} [p.now]
 * @param {(state) => void} [p.persist]  called after every turn (partial evidence survives a kill)
 */
export async function runLegs({
  api, sql, routeLabels, llm, scenarioId, runId, maxTurns = 24, reserveMake = RESERVE_MAKE_TURNS,
  deadlineAt = Infinity, now = Date.now, persist = () => {},
  sceneProjectionDiagnostics = () => []
}) {
  const legs = Object.fromEntries(['start', 'walk', 'meet', 'talk', 'take', 'make'].map((id) => [id,
    { id, status: 'blocked', reason: 'не достигнута', detail: null }]));
  const state = { legs, turns: [], opening: null, party_id: null, final_snapshot: null,
    transport_errors: [],
    presentation_recovery: { attempts: 0, recovered: 0, still_pending: 0 } };
  const set = (id, status, reason, detail = null) => { Object.assign(legs[id], { status, reason, detail }); };
  const blockRest = (from, reason) => {
    for (const leg of Object.values(legs)) if (leg.status === 'blocked' && leg.reason === 'не достигнута' && from.includes(leg.id)) leg.reason = reason;
  };
  const result = () => ({ ...state, legs: Object.values(legs) });
  let partyId = null;
  let last = null; // { screen, snap }
  let turnNo = 0;
  const apiCall = async (method, phase, leg, ...args) => {
    try { return await api[method](...args); }
    catch (error) {
      if (error?.transport) state.transport_errors.push({ ...error.transport,
        phase, turn: turnNo || null, leg: leg ?? null });
      throw error;
    }
  };

  const total = () => state.turns.length;
  const exploreBudget = () => maxTurns - reserveMake - total();

  async function refresh(phase = 'screen_refresh', leg = null) {
    const screen = await apiCall('screen', phase, leg, partyId);
    const snap = await sql.snapshot(partyId);
    last = { screen: screen.data?.screen ?? null, snap };
    state.final_snapshot = snap;
    return last;
  }

  const recordPresentationRecovery = (attempts, outcome) => {
    if (attempts > 0) state.presentation_recovery.attempts += attempts;
    if (outcome === 'recovered') state.presentation_recovery.recovered += 1;
    if (outcome === 'still_pending') state.presentation_recovery.still_pending += 1;
  };

  async function recoverPendingPresentation(phase, leg, requestId) {
    const recoverResponse = await apiCall('recover', 'presentation_recovery', leg, partyId,
      { request_id: requestId });
    const view = await refresh(phase, leg);
    const screen = recoverResponse.data?.screen ?? view.screen;
    const stillPending = screen?.screen_status === PRESENTATION_PENDING;
    return { view: { screen, snap: view.snap }, stillPending };
  }

  /** One player turn: budget/deadline guard, snapshots around it, presentation recovery when pending or prose missing. */
  async function play(leg, text, { reserved = false } = {}) {
    if (now() >= deadlineAt) throw new Blocked('дедлайн прогона');
    if (reserved ? total() >= maxTurns : exploreBudget() <= 0) throw new Blocked('бюджет ходов исчерпан');
    const n = ++turnNo;
    const requestId = `slice-${runId}-${n}`;
    const before = last?.snap ?? await sql.snapshot(partyId);
    const visibleContextBefore = structuredClone(
      last?.screen?.visible_context ?? null);
    const started = now();
    const calls = llm.count();
    const roleCalls = llm.roleCalls?.length ?? 0;
    const errorsBefore = llm.serverErrorCount?.() ?? 0;
    let presentationRecoveryAttempts = 0;
    let presentationRecoveryOutcome = null;
    if (last?.screen?.screen_status === PRESENTATION_PENDING) {
      const priorRequestId = state.turns.at(-1)?.request_id;
      if (!priorRequestId) throw new Blocked('доставка прозы не завершена: pending без request_id');
      const { view: cleared, stillPending } = await recoverPendingPresentation(
        'screen_before_turn', leg, priorRequestId);
      last = { screen: cleared.screen, snap: cleared.snap };
      presentationRecoveryAttempts += 1;
      if (stillPending) {
        recordPresentationRecovery(presentationRecoveryAttempts, 'still_pending');
        throw new Blocked('доставка прозы не завершена: committed_presentation_pending до хода');
      }
      presentationRecoveryOutcome = 'recovered';
    }
    const response = await apiCall('turn', 'turn', leg, partyId,
      { raw_text: text, request_id: requestId });
    let recovered = presentationRecoveryOutcome === 'recovered';
    let view = await refresh('screen_after_turn', leg);
    let prose = view.screen?.main_prose ?? response.data?.screen?.main_prose ?? '';
    const committed = Number(view.snap?.state_version) > Number(before?.state_version);
    const responsePending = response.data?.screen?.screen_status === PRESENTATION_PENDING
      || view.screen?.screen_status === PRESENTATION_PENDING;
    if (responsePending || (committed && !String(prose).trim())) {
      const { view: recoveredView, stillPending } = await recoverPendingPresentation(
        'screen_after_recovery', leg, requestId);
      presentationRecoveryAttempts += 1;
      view = recoveredView;
      prose = view.screen?.main_prose ?? '';
      recovered = !stillPending;
      presentationRecoveryOutcome = stillPending ? 'still_pending' : 'recovered';
      if (stillPending) {
        recordPresentationRecovery(presentationRecoveryAttempts, presentationRecoveryOutcome);
        commitTurn({
          recovered: false,
          delivery_failed: true,
          prose: '',
          error: { code: 'PRESENTATION_PENDING',
            message: 'Факты хода сохранены; экран ещё готовится.' }
        });
        throw new Blocked('доставка прозы не завершена: committed_presentation_pending после presentation-recovery');
      }
    }
    if (presentationRecoveryAttempts > 0) {
      recordPresentationRecovery(presentationRecoveryAttempts, presentationRecoveryOutcome ?? 'recovered');
    }
    return commitTurn();

    function commitTurn(overrides = {}) {
      const turn = {
        n, leg, input: text, request_id: requestId, http_status: response.status,
        error: overrides.error ?? (response.ok ? null : response.error),
        committed, recovered: overrides.recovered ?? recovered,
        delivery_failed: overrides.delivery_failed === true,
        presentation_recovery_attempts: presentationRecoveryAttempts,
        presentation_recovery_outcome: presentationRecoveryOutcome,
        prose: String(overrides.prose ?? prose ?? ''), before,
        after: overrides.after ?? view.snap, ms: now() - started,
        llm_calls: llm.count() - calls,
        llm_role_calls: (llm.roleCalls ?? []).slice(roleCalls).map(({ role_id, ms, status }) => ({ role_id, ms, status })),
        people_panel: capturePeoplePanel(view.screen, view.snap),
        current_visible_context: {
          before: visibleContextBefore,
          response: structuredClone(response.data?.screen?.visible_context ?? null),
          after: structuredClone(view.screen?.visible_context ?? null)
        },
        npc_scene_projection_diagnostics: sceneProjectionDiagnostics()
          .filter((event) => event?.request_id === requestId),
        server_errors: llm.serverErrorsSince?.(errorsBefore) ?? [],
        route_labels: routeLabels(view.screen), people_labels: peopleOf(view.screen)
      };
      state.turns.push(turn);
      persist(result());
      return turn;
    }
  }

  // --- start ---
  try {
    let attempts = 0;
    let rejections = 0;
    let opening = null;
    const openingAttempts = [];
    const requestId = `slice-${runId}-start`;
    while (attempts < 3 && opening == null) {
      attempts += 1;
      const response = await apiCall('newGame', 'new_game', 'start',
        { scenario_id: scenarioId, request_id: requestId });
      let devReport = null;
      if (api.llmTurnReport) {
        try {
          const report = await api.llmTurnReport(
            partyIdFromNewGameRequestId(requestId), requestId);
          devReport = report.ok ? report.data ?? null : null;
        } catch { /* diagnostic fetch must not change opening retry semantics */ }
      }
      const attemptRecord = openingAttemptFromNewGame({ n: attempts, ok: response.ok,
        data: response.data, error: response.error, devReport });
      if (attemptRecord) openingAttempts.push(attemptRecord);
      if (response.ok) opening = response.data;
      else if (response.error?.code === OPENING_REJECTED) rejections += 1;
      else { state.opening = { attempts, rejections, opening_attempts: openingAttempts,
        party_id: null, prose: '' }; throw new Error(response.error?.code ?? `HTTP ${response.status}`); }
    }
    state.opening = { attempts, rejections, opening_attempts: openingAttempts,
      party_id: opening?.party_id ?? null, prose: opening?.screen?.main_prose ?? '',
      route_labels: routeLabels(opening?.screen), people_panel_initial: capturePeoplePanel(opening?.screen) };
    if (opening == null) throw new Error(`${OPENING_REJECTED} ×${rejections}`);
    partyId = opening.party_id;
    state.party_id = partyId;
    const ack = await apiCall('ack', 'opening_ack', 'start', partyId,
      { client_ack_id: `slice-${runId}-ack` });
    if (!ack.ok) throw new Error(`opening-ack: ${ack.error?.code ?? ack.status}`);
    await refresh('screen_after_ack', 'start');
    state.opening.people_panel_after_ack = capturePeoplePanel(last.screen, last.snap);
    const prose = String(last.screen?.main_prose ?? state.opening.prose ?? '').trim();
    if (!prose) set('start', 'fail', 'после открытия на экране нет текста');
    else if (!last.snap?.position?.canonical_g5) set('start', 'fail', `позиция не прочитана из SQL (${last.snap?.error ?? 'нет position'})`);
    else set('start', 'pass', `партия ${partyId}, место ${placeName(last.snap)}`, rejections > 0 ? `отказов открытия до успеха: ${rejections}` : null);
  } catch (error) {
    set('start', 'fail', error.message);
  }
  if (legs.start.status !== 'pass') {
    blockRest(['walk', 'meet', 'talk', 'take', 'make'], 'нет партии: start не пройден');
    return result();
  }

  // --- explore: walk out, meeting, talk, take ---
  const visited = new Map(); // site_id -> place name
  const tried = new Map(); // site_id -> Map(label -> count)
  const progressedLabels = new Map(); // site_id -> Set(label) that ever moved slot or site
  const looked = new Map(); // site_id -> looks done; a second look is cheap and shows whether the first was a fluke
  const seen = { npc: null, hiddenNpc: null };
  const placesAfterTalk = new Map();
  let stuck = 0;
  let walksAtSite = 0;
  let continueWalkLabel = null;
  let walkChainSlots = [];
  let startSiteId = null;
  let walkedOut = false;
  const exploreEnd = { reason: null };

  const noteHere = () => {
    const snap = last.snap;
    if (snap?.position?.site_id) visited.set(snap.position.site_id, placeName(snap));
    if (snap?.position?.site_id && startSiteId != null && snap.position.site_id !== startSiteId) walkedOut = true;
    if (!walkedOut) return;
    const people = npcsHere(snap);
    const visiblePeople = peopleOf(last.screen);
    if (seen.npc == null && visiblePeople.length > 0) {
      seen.npc = { place: placeName(snap), site_id: snap.position.site_id, labels: visiblePeople, sql_npcs: people.map((row) => row.entity_id) };
    }
    if (seen.hiddenNpc == null && visiblePeople.length === 0 && people.length > 0)
      seen.hiddenNpc = { place: placeName(snap), count: people.length };
    if (legs.talk.status === 'pass' && snap?.position?.site_id) {
      placesAfterTalk.set(snap.position.site_id, placeName(snap));
    }
  };

  async function attemptTalk() {
    const label = peopleOf(last.screen)[0]?.replace(/\s*\(\d+\)\s*$/u, '');
    // the screen label is a nominative noun: quote it instead of inflecting it
    const phrases = [label && label !== 'человек' ? `Здороваюсь с человеком «${label}» и спрашиваю, как его зовут.`
      : 'Здороваюсь с человеком и спрашиваю, как его зовут.', 'Здравствуй! Кто ты, добрый человек?'];
    let reason = 'ход закоммичен, сохранённого ответа NPC игроку нет';
    let snapshotUnavailable = false;
    for (const text of phrases) {
      if (exploreBudget() <= 0) { reason = 'бюджет ходов исчерпан'; break; }
      if (npcsHere(last.snap).length === 0 && peopleOf(last.screen).length === 0) { reason = 'собеседник ушёл с места'; break; }
      const turn = await play('talk', text);
      if (turn.before?.error || turn.after?.error) {
        snapshotUnavailable = true;
        reason = 'снимок недоступен';
        continue;
      }
      if (turn.committed !== true) {
        reason = turn.error ? `ход не прошёл: ${turn.error.code}` : 'ход не закоммичен';
        continue;
      }
      const priorIds = new Set((turn.before?.npc_statements ?? []).map((statement) => statement.statement_id).filter(Boolean));
      const playerRef = turn.after?.player_character_ref;
      const reply = (turn.after?.npc_statements ?? []).find((statement) => statement.statement_id
        && !priorIds.has(statement.statement_id)
        && statement.speaker_ref?.entity_kind === 'npc'
        && statement.dominant_act === 'answer'
        && typeof statement.utterance_text === 'string'
        && statement.utterance_text.trim() !== ''
        && playerRef?.entity_kind === 'player_character'
        && typeof playerRef.entity_id === 'string'
        && (statement.intended_addressee_refs ?? []).some((ref) =>
          ref.entity_kind === 'player_character' && ref.entity_id === playerRef.entity_id));
      if (reply) {
        const utterance = reply.utterance_text.replace(/\s+/gu, ' ').slice(0, 600);
        turn.pass = true;
        set('talk', 'pass', 'сохранённый ответ NPC адресован персонажу игрока',
          `ответ NPC в снимке: «${utterance}»; оценка имени и характера остаётся наблюдением плейтеста`);
        return;
      }
      reason = turn.error ? `ход не прошёл: ${turn.error.code}` : 'ход закоммичен, ответа NPC игроку в снимке нет';
    }
    set('talk', 'fail', snapshotUnavailable ? 'снимок недоступен' : reason);
  }

  async function attemptTake() {
    const node = liveNodesHere(last.snap)[0];
    const texts = TAKE_PHRASES.find(({ match }) => match.test(node.resource_node_id)).texts;
    let reason = 'запас не изменился';
    for (const text of texts) {
      if (exploreBudget() <= 0) { reason = 'бюджет ходов исчерпан'; break; }
      const turn = await play('take', text);
      const was = Number(liveNodes(turn.before).find((row) => row.resource_node_id === node.resource_node_id)?.quantity_numerator ?? 0);
      const left = Number((turn.after?.resource_nodes ?? []).find((row) => row.resource_node_id === node.resource_node_id)?.quantity_numerator ?? was);
      const heldGain = heldItems(turn.after).length - heldItems(turn.before).length;
      if (was - left > 0 && heldGain > 0) { turn.pass = true; set('take', 'pass', `запас ${node.resource_node_id}: ${was} → ${left}, предмет в руках`); return; }
      if (was - left > 0) reason = `запас уменьшился (${was} → ${left}), но предмета в руках нет`;
      else reason = turn.error ? `ход не прошёл: ${turn.error.code}` : (turn.committed ? 'ход закоммичен, запас не изменился' : 'ход не закоммичен');
    }
    set('take', 'fail', reason);
  }

  const done = (id) => legs[id].status !== 'blocked' || legs[id].reason !== 'не достигнута';
  const talkDependencyReason = () => `talk не пройден${legs.talk.reason && legs.talk.reason !== 'не достигнута' ? `: ${legs.talk.reason}` : ''}`;
  try {
    await refresh('screen_before_exploration', 'walk');
    startSiteId = last.snap?.position?.site_id ?? null;
    for (;;) {
      noteHere();
      if (seen.npc && !done('talk')) { try { await attemptTalk(); } catch (error) { if (error instanceof Blocked) throw error; set('talk', 'fail', error.message); } noteHere(); }
      if (done('talk') && legs.talk.status !== 'pass') { exploreEnd.reason = 'talk не пройден'; break; }
      if (legs.talk.status === 'pass' && liveNodesHere(last.snap).length > 0 && !done('take')) {
        try { await attemptTake(); } catch (error) { if (error instanceof Blocked) throw error; set('take', 'fail', error.message); }
        noteHere();
      }
      if (legs.talk.status === 'pass' && done('take')) break;
      // a step: the first least-tried passage label of this spot, or a look when the spot offers none yet
      const key = siteKey(last.snap);
      const labels = routeLabels(last.screen);
      if (labels.length === 0 && (looked.get(key) ?? 0) < 2) { looked.set(key, (looked.get(key) ?? 0) + 1); await play('walk', LOOK); continue; }
      if (labels.length === 0) { exploreEnd.reason = `на месте ${placeName(last.snap)} экран не показывает проходов после ${looked.get(key)} осмотров`; break; }
      const counts = tried.get(key) ?? new Map();
      tried.set(key, counts);
      const progressed = progressedLabels.get(key) ?? new Set();
      progressedLabels.set(key, progressed);
      const noProgressLimit = labels.length + 1;
      const continuing = Boolean(continueWalkLabel && labels.includes(continueWalkLabel));
      if (!continuing) walkChainSlots = [];
      const label = continuing
        ? continueWalkLabel
        : [...labels].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0];
      counts.set(label, (counts.get(label) ?? 0) + 1);
      const turn = await play('walk', label);
      noteHere();
      const moved = positionProgressed(turn.before, turn.after);
      const siteChanged = turn.before?.position?.site_id != null
        && turn.after?.position?.site_id != null
        && turn.before.position.site_id !== turn.after.position.site_id;
      if (siteChanged) walksAtSite = 0;
      else walksAtSite += 1;
      if (walksAtSite >= 8) {
        exploreEnd.reason = `8 ходов движения на месте ${placeName(turn.after ?? last.snap)} без смены site`;
        break;
      }
      if (moved) {
        stuck = 0;
        progressed.add(label);
        const slotAfter = String(turn.after?.position?.slot ?? '');
        if (continuing && walkChainSlots.includes(slotAfter)) {
          continueWalkLabel = null;
          walkChainSlots = [];
        } else {
          if (slotAfter) walkChainSlots.push(slotAfter);
          continueWalkLabel = label;
        }
      } else {
        continueWalkLabel = null;
        walkChainSlots = [];
        stuck += 1;
        if (stuck >= noProgressLimit) {
          exploreEnd.reason = `${stuck} ходов подряд без смены позиции (порог ${noProgressLimit}; последняя ошибка: ${turn.error?.code ?? 'нет'})`;
          break;
        }
        const triedAllOnce = labels.length > 1
          && labels.every((entry) => (counts.get(entry) ?? 0) >= 1)
          && progressed.size === 0;
        if (triedAllOnce) {
          exploreEnd.reason = `на месте ${placeName(turn.after ?? last.snap)} ни одна подпись (${labels.join(', ')}) не продвинула позицию`;
          break;
        }
      }
    }
  } catch (error) {
    exploreEnd.reason = error instanceof Blocked ? error.message : `сбой: ${error.message}`;
  }

  // verdicts for the exploration legs
  const places = [...visited.values()];
  const walkTurns = state.turns.filter(({ leg }) => leg === 'walk');
  const lookedFirst = walkTurns[0]?.input === LOOK;
  const walkNote = `ходов движения: ${walkTurns.length}, из них без смены места: ${walkTurns.filter(({ before, after }) => before?.position?.site_id === after?.position?.site_id).length}`
    + `${lookedFirst ? '; на стартовом экране проходов не было, понадобился «Осматриваюсь вокруг.»' : ''}`;
  if (visited.size >= 2) set('walk', 'pass', `места Вихтуя по ходу: ${places.join(' → ')}`, walkNote);
  else if (state.turns.some(({ leg }) => leg === 'walk')) set('walk', 'fail', `игрок не покинул стартовое место (${exploreEnd.reason ?? 'ходы без перехода'})`, walkNote);
  else set('walk', 'blocked', exploreEnd.reason ?? 'ходов движения не было');
  if (seen.npc) set('meet', 'pass', `на месте ${seen.npc.place}: ${seen.npc.labels.join(', ')}`,
    `на экране: ${seen.npc.labels.map((label) => `«${label}»`).join(', ') || 'панель людей пуста'}; NPC в G6 игрока по SQL: ${seen.npc.sql_npcs.length}`);
  else if (seen.hiddenNpc) set('meet', 'fail', `на месте ${seen.hiddenNpc.place} SQL видит NPC, но панель людей пуста`,
    `NPC-размещений по SQL: ${seen.hiddenNpc.count}; на экране: панель людей пуста`);
  else set('meet', 'blocked', `ни одного видимого NPC на местах: ${places.join(', ') || '—'} (${exploreEnd.reason ?? 'бюджет ходов'})`,
    `NPC-размещений во всей партии по SQL: ${last?.snap?.npc_placements_all?.length ?? '?'}`);
  if (!done('talk')) set('talk', 'blocked', seen.npc ? `собеседник виден, но разговор не начат (${exploreEnd.reason})`
    : `нет видимого NPC: meet не пройден (${exploreEnd.reason ?? 'поиск завершён'})`);
  if (!done('take')) set('take', 'blocked', legs.talk.status !== 'pass' ? talkDependencyReason() :
    `на посещённых местах после разговора (${[...placesAfterTalk.values()].join(', ') || '—'}) нет доступного узла в party_resource_nodes (${exploreEnd.reason ?? 'бюджет ходов'})`);

  // --- make (reserved turns) ---
  if (legs.talk.status !== 'pass') set('make', 'blocked', talkDependencyReason());
  else try {
    let reason = 'план отвергнут / предмета нет';
    const isMade = (snap) => (snap?.party_items ?? []).filter((row) => row.action_production).length;
    for (const text of MAKE_PHRASES) {
      const turn = await play('make', text, { reserved: true });
      if (isMade(turn.after) > isMade(turn.before)) { turn.pass = true; set('make', 'pass', `создано предметов A1: ${isMade(turn.after) - isMade(turn.before)}`); reason = null; break; }
      reason = turn.error ? `ход не прошёл: ${turn.error.code}` : (turn.committed ? 'ход закоммичен, предмета A1 нет' : 'ход не закоммичен');
    }
    if (reason != null) set('make', 'fail', `все ${MAKE_PHRASES.length} фразы без предмета; последняя причина: ${reason}`);
  } catch (error) {
    if (error instanceof Blocked) set('make', 'blocked', error.message);
    else set('make', 'fail', error.message);
  }
  persist(result());
  return result();
}
