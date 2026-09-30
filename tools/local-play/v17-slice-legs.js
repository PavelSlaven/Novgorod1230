// Scripted legs of the D49 slice (start → walk out → meet → talk → take → make) over the public API.
// Pure of I/O: `api` (HTTP client) and `sql` (snapshot reader) are injected, so unit tests use fakes.
// A turn that fails is data (fail with the API error code), not an exception.

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

class Blocked extends Error {}

const labelOf = (entry) => entry?.display_label ?? entry?.label ?? entry?.name ?? entry?.title ?? null;
const peopleOf = (screen) => {
  const data = screen?.panels?.people?.data ?? {};
  return (data.people ?? data.visible_npcs ?? data.npcs ?? []).map(labelOf).filter(Boolean);
};
const positionKey = (snap) => `${snap?.position?.site_id ?? '?'}|${snap?.position?.slot ?? '?'}`;
const npcsHere = (snap) => (snap?.placements_here ?? []).filter((row) => row.entity_kind === 'npc');
const liveNodes = (snap) => (snap?.resource_nodes ?? []).filter((row) => Number(row.quantity_numerator) > 0);
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
  deadlineAt = Infinity, now = Date.now, persist = () => {}
}) {
  const legs = Object.fromEntries(['start', 'walk', 'meet', 'talk', 'take', 'make'].map((id) => [id,
    { id, status: 'blocked', reason: 'не достигнута', detail: null }]));
  const state = { legs, turns: [], opening: null, party_id: null, final_snapshot: null };
  const set = (id, status, reason, detail = null) => { Object.assign(legs[id], { status, reason, detail }); };
  const blockRest = (from, reason) => {
    for (const leg of Object.values(legs)) if (leg.status === 'blocked' && leg.reason === 'не достигнута' && from.includes(leg.id)) leg.reason = reason;
  };
  const result = () => ({ ...state, legs: Object.values(legs) });
  let partyId = null;
  let last = null; // { screen, snap }
  let turnNo = 0;

  const total = () => state.turns.length;
  const exploreBudget = () => maxTurns - reserveMake - total();

  async function refresh() {
    const screen = await api.screen(partyId);
    const snap = await sql.snapshot(partyId);
    last = { screen: screen.data?.screen ?? null, snap };
    state.final_snapshot = snap;
    return last;
  }

  /** One player turn: budget/deadline guard, snapshots around it, presentation recovery when the text is missing. */
  async function play(leg, text, { reserved = false } = {}) {
    if (now() >= deadlineAt) throw new Blocked('дедлайн прогона');
    if (reserved ? total() >= maxTurns : exploreBudget() <= 0) throw new Blocked('бюджет ходов исчерпан');
    const n = ++turnNo;
    const requestId = `slice-${runId}-${n}`;
    const before = last?.snap ?? await sql.snapshot(partyId);
    const started = now();
    const calls = llm.count();
    const response = await api.turn(partyId, { raw_text: text, request_id: requestId });
    let recovered = false;
    let view = await refresh();
    let prose = view.screen?.main_prose ?? response.data?.screen?.main_prose ?? '';
    const committed = Number(view.snap?.state_version) > Number(before?.state_version);
    if (committed && !String(prose).trim()) {
      await api.recover(partyId, { request_id: requestId });
      recovered = true;
      view = await refresh();
      prose = view.screen?.main_prose ?? '';
    }
    const turn = {
      n, leg, input: text, request_id: requestId, http_status: response.status, error: response.ok ? null : response.error,
      committed, recovered, prose: String(prose ?? ''), before, after: view.snap, ms: now() - started,
      llm_calls: llm.count() - calls, route_labels: routeLabels(view.screen), people_labels: peopleOf(view.screen)
    };
    state.turns.push(turn);
    persist(result());
    return turn;
  }

  // --- start ---
  try {
    let attempts = 0;
    let rejections = 0;
    let opening = null;
    const requestId = `slice-${runId}-start`;
    while (attempts < 3 && opening == null) {
      attempts += 1;
      const response = await api.newGame({ scenario_id: scenarioId, request_id: requestId });
      if (response.ok) opening = response.data;
      else if (response.error?.code === OPENING_REJECTED) rejections += 1;
      else { state.opening = { attempts, rejections, party_id: null, prose: '' }; throw new Error(response.error?.code ?? `HTTP ${response.status}`); }
    }
    state.opening = { attempts, rejections, party_id: opening?.party_id ?? null, prose: opening?.screen?.main_prose ?? '' };
    if (opening == null) throw new Error(`${OPENING_REJECTED} ×${rejections}`);
    partyId = opening.party_id;
    state.party_id = partyId;
    const ack = await api.ack(partyId, { client_ack_id: `slice-${runId}-ack` });
    if (!ack.ok) throw new Error(`opening-ack: ${ack.error?.code ?? ack.status}`);
    await refresh();
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
  const tried = new Map(); // positionKey -> Map(label -> count)
  const looked = new Set();
  const seen = { npc: null, source: null };
  let stuck = 0;
  const exploreEnd = { reason: null };

  const noteHere = () => {
    const snap = last.snap;
    if (snap?.position?.site_id) visited.set(snap.position.site_id, placeName(snap));
    const people = npcsHere(snap);
    if (seen.npc == null && (people.length > 0 || peopleOf(last.screen).length > 0)) {
      seen.npc = { place: placeName(snap), labels: peopleOf(last.screen), sql_npcs: people.map((row) => row.entity_id) };
    }
    if (seen.source == null && liveNodes(snap).length > 0) seen.source = { place: placeName(snap), nodes: liveNodes(snap).map((row) => row.resource_node_id) };
  };

  async function attemptTalk() {
    const label = peopleOf(last.screen)[0]?.replace(/\s*\(\d+\)\s*$/u, '');
    // the screen label is a nominative noun: quote it instead of inflecting it
    const phrases = [label && label !== 'человек' ? `Здороваюсь с человеком «${label}» и спрашиваю, как его зовут.`
      : 'Здороваюсь с человеком и спрашиваю, как его зовут.', 'Здравствуй! Кто ты, добрый человек?'];
    let reason = 'ход закоммичен, реплики NPC нет';
    for (const text of phrases) {
      if (exploreBudget() <= 0) { reason = 'бюджет ходов исчерпан'; break; }
      if (npcsHere(last.snap).length === 0 && peopleOf(last.screen).length === 0) { reason = 'собеседник ушёл с места'; break; }
      const turn = await play('talk', text);
      const gained = (turn.after?.npc_statements?.length ?? 0) - (turn.before?.npc_statements?.length ?? 0);
      if (gained > 0) {
        const reply = turn.after.npc_statements.at(-1);
        set('talk', 'pass', `реплика NPC записана (+${gained})`, `последняя реплика NPC в снимке: ${JSON.stringify(reply).slice(0, 600)}`);
        return;
      }
      reason = turn.error ? `ход не прошёл: ${turn.error.code}` : (turn.committed ? 'ход закоммичен, реплики NPC в снимке нет' : 'ход не закоммичен');
    }
    set('talk', 'fail', reason);
  }

  async function attemptTake() {
    const node = liveNodes(last.snap)[0];
    const texts = TAKE_PHRASES.find(({ match }) => match.test(node.resource_node_id)).texts;
    let reason = 'запас не изменился';
    for (const text of texts) {
      if (exploreBudget() <= 0) { reason = 'бюджет ходов исчерпан'; break; }
      const turn = await play('take', text);
      const was = Number(liveNodes(turn.before).find((row) => row.resource_node_id === node.resource_node_id)?.quantity_numerator ?? 0);
      const left = Number((turn.after?.resource_nodes ?? []).find((row) => row.resource_node_id === node.resource_node_id)?.quantity_numerator ?? was);
      const heldGain = heldItems(turn.after).length - heldItems(turn.before).length;
      if (was - left > 0 && heldGain > 0) { set('take', 'pass', `запас ${node.resource_node_id}: ${was} → ${left}, предмет в руках`); return; }
      if (was - left > 0) reason = `запас уменьшился (${was} → ${left}), но предмета в руках нет`;
      else reason = turn.error ? `ход не прошёл: ${turn.error.code}` : (turn.committed ? 'ход закоммичен, запас не изменился' : 'ход не закоммичен');
    }
    set('take', 'fail', reason);
  }

  const done = (id) => legs[id].status !== 'blocked' || legs[id].reason !== 'не достигнута';
  try {
    await refresh();
    for (;;) {
      noteHere();
      if (seen.npc && !done('talk')) { try { await attemptTalk(); } catch (error) { if (error instanceof Blocked) throw error; set('talk', 'fail', error.message); } noteHere(); }
      if (seen.source && !done('take')) { try { await attemptTake(); } catch (error) { if (error instanceof Blocked) throw error; set('take', 'fail', error.message); } noteHere(); }
      if (done('talk') && done('take')) break;
      // a step: the first least-tried passage label of this spot, or a look when the spot offers none yet
      const key = positionKey(last.snap);
      const labels = routeLabels(last.screen);
      if (labels.length === 0 && !looked.has(key)) { looked.add(key); await play('walk', LOOK); continue; }
      if (labels.length === 0) { exploreEnd.reason = `на месте ${placeName(last.snap)} экран не показывает проходов`; break; }
      const counts = tried.get(key) ?? new Map();
      tried.set(key, counts);
      const label = [...labels].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0))[0];
      counts.set(label, (counts.get(label) ?? 0) + 1);
      const sitesBefore = visited.size;
      const turn = await play('walk', label);
      noteHere();
      stuck = turn.committed || visited.size > sitesBefore ? 0 : stuck + 1;
      if (stuck >= 3) { exploreEnd.reason = `3 хода подряд без сдвига (последняя ошибка: ${turn.error?.code ?? 'нет'})`; break; }
    }
  } catch (error) {
    exploreEnd.reason = error instanceof Blocked ? error.message : `сбой: ${error.message}`;
  }

  // verdicts for the exploration legs
  const places = [...visited.values()];
  if (visited.size >= 2) set('walk', 'pass', `места Вихтуя по ходу: ${places.join(' → ')}`);
  else if (state.turns.some(({ leg }) => leg === 'walk')) set('walk', 'fail', `игрок не покинул стартовое место (${exploreEnd.reason ?? 'ходы без перехода'})`);
  else set('walk', 'blocked', exploreEnd.reason ?? 'ходов движения не было');
  if (seen.npc) set('meet', 'pass', `на месте ${seen.npc.place}: ${seen.npc.labels.join(', ') || `NPC по SQL ${seen.npc.sql_npcs.join(', ')}`}`,
    `на экране: ${seen.npc.labels.map((label) => `«${label}»`).join(', ') || 'панель людей пуста'}; NPC в G6 игрока по SQL: ${seen.npc.sql_npcs.length}`);
  else set('meet', 'blocked', `ни одного видимого NPC на местах: ${places.join(', ') || '—'} (${exploreEnd.reason ?? 'бюджет ходов'})`);
  if (!done('talk')) set('talk', 'blocked', seen.npc ? `собеседник виден, но разговор не начат (${exploreEnd.reason})` : 'нет видимого NPC: meet не пройден');
  if (!done('take')) set('take', 'blocked', `ни на одном месте (${places.join(', ') || '—'}) нет непустого источника в party_resource_nodes (${exploreEnd.reason ?? 'бюджет ходов'})`);

  // --- make (reserved turns) ---
  try {
    let reason = 'план отвергнут / предмета нет';
    const isMade = (snap) => (snap?.party_items ?? []).filter((row) => row.action_production).length;
    for (const text of MAKE_PHRASES) {
      const turn = await play('make', text, { reserved: true });
      if (isMade(turn.after) > isMade(turn.before)) { set('make', 'pass', `создано предметов A1: ${isMade(turn.after) - isMade(turn.before)}`); reason = null; break; }
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
