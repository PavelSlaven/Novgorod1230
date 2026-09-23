import { validateVisibleContext, detectHiddenLeaks } from '@rus/visibility-knowledge-memory';
import { assertVisibleSource, bodyStateSummary, auditOpeningReaderAssessments } from './lower-dvina-trace-opening.js';
import { projectItems } from './lower-dvina-trace-player-safe-items.js';
import { freezeJson } from './lower-dvina-trace-player-safe-json.js';
import { serverError } from '../errors.js';

/** Canonical opening uses supplied perception and self knowledge. Empty history,
 * goals and local structures are valid; this owner does not create any of them. */
export function buildCanonicalOpeningVisibleContext({ requestId, visible, internal,
  approvedProjection, naturalScenePerception, canonicalSourceBinding } = {}) {
  assertVisibleSource(visible, approvedProjection);
  const actorId = internal?.player?.instance_id; const position = internal?.position;
  const context = naturalScenePerception?.visible_context;
  if (canonicalSourceBinding?.schema !== 'rus.verified_canonical_initial_natural_source.v1'
    || canonicalSourceBinding.verified !== true || canonicalSourceBinding.party_id !== visible.party_id
    || canonicalSourceBinding.actor_id !== actorId || canonicalSourceBinding.position_id !== position?.position_id
    || canonicalSourceBinding.scenario_id !== approvedProjection.scenario_id
    || naturalScenePerception?.ok !== true || !validateVisibleContext(context).ok
    || !Array.isArray(naturalScenePerception.perceived_facts)
    || naturalScenePerception.perceived_facts.some((fact) => !context.sensory_details.includes(fact.text))) gap();
  const environment = internal.environment_snapshot;
  if (environment?.schema !== 'rus.approved_initial_environment.v1'
    || !environment.calendar_date || !environment.season || !environment.light_state) gap();
  const identity = `${visible.player.name} — ${visible.player.social_status.display_name}.`;
  const body = bodyStateSummary(visible.body);
  const naturalFacts = naturalScenePerception.perceived_facts;
  const ownItems = projectItems((internal.items ?? []).filter((item) =>
    item.placement?.holder_character_id === actorId), { actorId, position,
    visibleNpcIds: new Set() }).filter((item) => item.item_id && item.name);
  const visibleNpcs = context.visible_npc.map((npc) => ({
    npc_instance_id: npc.entity_ref.entity_id, label: npc.display_label,
    recognition: npc.recognition, current_activity: npc.visible_status }));
  const observedItems = context.visible_objects.filter((item) => item.entity_ref?.entity_kind === 'item')
    .map((item) => ({ item_instance_id: item.entity_ref.entity_id, label: item.display_label,
      recognition: item.recognition, visible_status: item.visible_status }));
  const known = (internal.player.dossier?.knowledge?.known_facts ?? []).filter((fact) => typeof fact === 'string' && fact.trim());
  const facts = [{ fact_id: 'opening:identity', text: identity, source_refs: [actorId] },
    { fact_id: 'opening:body', text: body, source_refs: [actorId] },
    ...visibleNpcs.map((npc, index) => ({ fact_id: `opening:person:${index + 1}`,
      text: npc.label, source_refs: [npc.npc_instance_id] })),
    ...naturalFacts.map((fact, index) => ({ fact_id: `opening:natural:${index + 1}`,
      text: fact.text, source_refs: [fact.source_position_id] }))];
  const mustInclude = [{ category: 'identity', text: identity }, { category: 'body', text: body }];
  if (naturalFacts.length) mustInclude.push({ category: 'surroundings', text: naturalFacts.map((fact) => fact.text).join(' ') });
  if (visibleNpcs.length) mustInclude.push({ category: 'people', text: visibleNpcs.map((npc) => npc.label).join('; ') });
  if (ownItems.length) mustInclude.push({ category: 'carried_items', text: ownItems.map((item) => item.name).join('; ') });
  const naturalRefs = facts.filter((fact) => fact.fact_id.startsWith('opening:natural:')).map((fact) => fact.fact_id);
  const peopleRefs = facts.filter((fact) => fact.fact_id.startsWith('opening:person:')).map((fact) => fact.fact_id);
  const reader = auditOpeningReaderAssessments({ facts, assessments: [
    { question: 'identity', status: 'supported', fact_refs: ['opening:identity'], reason: 'Committed player identity.' },
    { question: 'reason_here', status: 'unknown', fact_refs: [], reason: 'No player-known cause of arrival is supplied.' },
    { question: 'preceding_context', status: 'unknown', fact_refs: [], reason: 'No preceding event is supplied.' },
    { question: 'people', status: peopleRefs.length ? 'supported' : 'unknown', fact_refs: peopleRefs,
      reason: peopleRefs.length ? 'Only supplied player-safe entity observations.' : 'No complete current entity-perception evidence is supplied; this does not establish absence.' },
    { question: 'current_event', status: 'supported', fact_refs: ['opening:body', ...naturalRefs], reason: 'Current bodily state and admitted sensory observations.' },
    { question: 'goal_stake', status: 'unknown', fact_refs: [], reason: 'No player-known goal or obligation is supplied.' },
    { question: 'surroundings', status: naturalRefs.length ? 'supported' : 'unknown', fact_refs: naturalRefs,
      reason: naturalRefs.length ? 'Only P22-admitted sensory observations.' : 'No admitted environmental observation; this does not establish an empty or silent place.' },
    { question: 'directions_interactions', status: 'unknown', fact_refs: [], reason: 'No perceived route or immediate interaction with an exact causal basis is supplied.' }
  ] });
  if (!reader.pass) throw serverError('CANONICAL_OPENING_CONTEXT_INCOMPLETE',
    'Canonical opening reader control failed.', { status: 409, details: reader });
  const result = {
    version: 1, schema: 'visible_context_package', request_id: requestId, visible_context_status: 'formed',
    frame: { region_id: position.g4_id, year: environment.calendar_date.year, season: environment.season,
      clock: structuredClone(visible.timestamp), weather_state: {}, light_profile: environment.light_state },
    position: { region_id: position.g4_id, place_id: position.g5_node_id, location_id: position.g5_node_id,
      minilocation_id: position.g6_instance_id, anchor_id: position.g5_anchor_id },
    narrator_scope: { allowed_surfaces: ['opening'], forbidden_surfaces: ['hidden_state'],
      style_constraints: ['connected_literary_russian', 'second_person', 'two_to_four_paragraphs'],
      knowledge_boundary: { player_safe_only: true } },
    visible_scene_dossier: { must_include: mustInclude,
      must_not_include: ['unprovided history or preceding journey', 'unprovided goal or obligation',
        'unperceived people, structures, routes or sources', 'absence of observations does not establish an empty or silent scene'] },
    visible_scene_facts: facts, visible_anchors: [], visible_exits: [], visible_npcs: visibleNpcs,
    visible_items: observedItems, visible_containers: [], visible_risks: [],
    audible_context: naturalFacts.filter((fact) => fact.channel === 'acoustic').map((fact) => ({
      text: fact.text, source_ref: { position_id: fact.source_position_id } })),
    smell_context: [], touch_body_context: [{ text: body }], weather_light_context: [],
    known_context: [...known.map((text) => ({ text, basis_refs: [actorId] })),
      ...ownItems.map((item) => ({ text: `При вас: ${item.name}.`, basis_refs: [actorId, item.item_id] }))],
    rumor_context: [], uncertain_context: [], available_actions_context: [], hidden_filtered_out: [],
    source_trace: [{ source_id: actorId, kind: 'committed_canonical_initial_state' }],
    audit_self_check: { pass: reader.pass, concerns: [], evidence: ['Independent reader control verified source boundaries and assessed all eight opening questions.'] },
    opening_reader_control: reader
  };
  if (detectHiddenLeaks(result).length) gap();
  return freezeJson(result);
}
function gap() { throw serverError('CANONICAL_OPENING_CONTEXT_INVALID',
  'Canonical opening requires exact current player-safe perception.', { status: 409 }); }
