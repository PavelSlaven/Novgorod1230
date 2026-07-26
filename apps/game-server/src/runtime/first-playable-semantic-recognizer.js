import { createHash } from 'node:crypto';

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const digest = (value) =>
  createHash('sha256').update(canonical(value)).digest('hex');
const normalize = (value) => String(value ?? '').trim().toLocaleLowerCase('ru-RU');
const LOCAL_ROUTE_BINDINGS = Object.freeze({
  landing_edge: Object.freeze({
    entity_kind: 'canonical_g5_connection_binding',
    entity_id:
      'cg5bindv3__g4dirv3r__g4route_gn_nov_g3_xp017_yp026_r2_sheltered_landing_terrace_2',
    version: 2
  }),
  high_platform: Object.freeze({
    entity_kind: 'canonical_g5_connection_binding',
    entity_id:
      'cg5bindv3__g4dirv3f__g4route_gn_nov_g3_xp017_yp026_r2_sheltered_landing_terrace_2',
    version: 2
  })
});

const RULES = Object.freeze([
  { verb: 'look', patterns: [/^осмотр(?:еться|еться вокруг)?$/u, /^осматриваюсь$/u, /^осмотреться$/u] },
  { verb: 'talk', patterns: [/^поговорить(?: с рыбаком)?$/u, /^заговорить(?: с рыбаком)?$/u] },
  { verb: 'move', patterns: [
    /^идти к берегу$/u,
    /^спуститься к берегу$/u,
    /^спуститься по скользкой кромке$/u,
    /^вернуться на площадку$/u
  ] },
  { verb: 'collect_resource', patterns: [/^набрать (?:1000 мл|литр) воды$/u, /^собрать (?:связку )?валежника$/u] },
  { verb: 'perform_simple_work', patterns: [/^помочь (?:рыбаку )?с сетью$/u] },
  { verb: 'rest', patterns: [/^отдохнуть (30|60|120) минут$/u] },
  { verb: 'give', patterns: [/^передать (?:рыбаку )?вер[её]вку$/u] },
  { verb: 'board', patterns: [/^сесть в лодку$/u] },
  { verb: 'alight', patterns: [/^выйти из лодки$/u] },
  { verb: 'cross_boundary', patterns: [/^перейти южную границу$/u] },
  { verb: 'save', patterns: [/^сохранить(?: игру)?$/u] }
]);

const VISIBLE_TARGETS = Object.freeze({
  talk: 'npc:fisher',
  give: 'npc:fisher',
  perform_simple_work: 'npc:fisher',
  collect_resource: 'resource:visible',
  board: 'transport:player_boat',
  alight: 'transport:player_boat'
});

export function recognizeFirstPlayableSemanticCommand({
  partyId,
  actorId,
  rawText = '',
  selectedActionOptionId = '',
  visibleEntityRefs = [],
  currentLocation = null,
  baseStateVersion,
  requestId,
  idempotencyKey,
  dependencyPins
} = {}) {
  const selected = normalize(selectedActionOptionId);
  const source = selected === 'action:collect_water'
    ? 'набрать 1000 мл воды'
    : selected === 'action:collect_deadwood'
      ? 'собрать связку валежника'
      : selected === 'action:move_risky'
        ? 'спуститься по скользкой кромке'
      : selected === 'action:move'
        ? (currentLocation === 'landing_edge'
            ? 'вернуться на площадку'
            : 'спуститься к берегу')
      : /^rest:(30|60|120)$/u.test(selected)
        ? `отдохнуть ${selected.split(':')[1]} минут`
        : normalize(selectedActionOptionId || rawText);
  const matches = RULES.filter(({ patterns, verb }) =>
    patterns.some((pattern) => pattern.test(source)) ||
    source === `action:${verb}`);
  if (matches.length === 0) {
    return Object.freeze({
      ok: false,
      code: 'semantic_command_unrecognized',
      elapsed_minutes: 0,
      mutations: Object.freeze([]),
      visible_options: Object.freeze([])
    });
  }
  if (matches.length > 1) {
    return Object.freeze({
      ok: false,
      code: 'semantic_command_ambiguous',
      elapsed_minutes: 0,
      mutations: Object.freeze([]),
      visible_options: Object.freeze(matches.map(({ verb }) => `action:${verb}`))
    });
  }
  const verb = matches[0].verb;
  const targetRef = VISIBLE_TARGETS[verb] ?? null;
  if (targetRef && !visibleEntityRefs.includes(targetRef)) {
    return Object.freeze({
      ok: false,
      code: 'semantic_target_not_visible',
      elapsed_minutes: 0,
      mutations: Object.freeze([]),
      visible_options: Object.freeze([])
    });
  }
  const durationMatch = source.match(/(30|60|120) минут/u);
  const quantity = verb === 'collect_resource' && /воды/u.test(source)
    ? { numerator: 1000, denominator: 1, unit: 'millilitre' }
    : verb === 'collect_resource'
      ? { numerator: 1, denominator: 1, unit: 'bundle' }
      : null;
  const destinationId = verb === 'move'
    ? (/берегу|кромке/u.test(source) ? 'landing_edge' : 'high_platform')
    : null;
  const riskyTraversal = verb === 'move'
    && /скользкой кромке/u.test(source);
  const commandWithoutDigest = {
    schema: 'semantic_command.v1',
    verb,
    party_ref: { entity_kind: 'party', entity_id: partyId },
    actor_ref: { entity_kind: 'actor', entity_id: actorId },
    target_ref: targetRef == null ? null : {
      entity_kind: targetRef.split(':')[0],
      entity_id: targetRef.split(':')[1]
    },
    destination_ref: verb === 'move'
      ? { entity_kind: 'scene_position', entity_id: destinationId }
      : null,
    route_binding_ref: verb === 'move'
      ? structuredClone(LOCAL_ROUTE_BINDINGS[destinationId])
      : null,
    risk_profile_ref: riskyTraversal
      ? {
          entity_kind: 'risk_profile',
          entity_id: 'risk_landing_edge_slip_nonfatal_v1',
          version: 1
        }
      : null,
    quantity,
    duration_minutes: durationMatch ? Number(durationMatch[1]) : null,
    base_state_version: baseStateVersion,
    request_id: requestId,
    idempotency_key: idempotencyKey,
    dependency_pins: structuredClone(dependencyPins)
  };
  return Object.freeze({
    ok: true,
    command: Object.freeze({
      ...commandWithoutDigest,
      canonical_digest: digest(commandWithoutDigest)
    })
  });
}
