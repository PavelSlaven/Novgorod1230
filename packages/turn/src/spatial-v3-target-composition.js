import { computeSpatialV3CanonicalDigest, createSpatialV3TypedError } from '@rus/contracts/spatial-v3/registry';
import { createSpatialV3CommandRegistry, createSpatialV3NewGameStarter, createSpatialV3TurnOrchestrator } from './spatial-v3-orchestration.js';
import { buildCombinedWritePlan } from './spatial-v3-write-plan.js';

const clone = (value) => structuredClone(value);
const text = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const freeze = (value) => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const seal = (value) => freeze({ ...clone(value), canonical_digest: computeSpatialV3CanonicalDigest(value) });
const failure = (party_id, stage, reason) => {
  const pins = [{ dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: 'spatial-v3-target' }, version_pin: { pin_kind: 'authoring_version', authoring_version: '4.2.0-target.1', state_version: null } }];
  return freeze({ ok: false, error: createSpatialV3TypedError('generated_schema_mismatch', { subject_ref: { entity_kind: 'party_change_set', entity_id: party_id ?? 'unknown' }, dependency_pins: { pins, canonical_digest: computeSpatialV3CanonicalDigest(pins).replace('sha256:', '') }, diagnostics: { stage, reason } }) });
};
const requirePort = (value, name) => { if (typeof value !== 'function') throw new TypeError(`P21 target/shadow ${name} port is required.`); };

/**
 * P21 target/shadow composition. It deliberately has no v2 imports, no active
 * runtime registration and no direct storage access. Every mutation is sealed
 * into combined_write_plan.v2 and delegated to the P16 sole writer.
 */
export function createSpatialV3TargetShadowComposition({
  planner, activationValidator, executionEngine, targetPreparation, frontierResolver,
  loadSnapshots, validateProposal, projectVisible, narrate, committer, verifyApproval,
  loadStartSnapshot, prepareStart, buildStartWritePlanInput, commandAdapters = {},
  createStartChangeSet = null, modeHandoff = null, buildModeHandoffProposal = null
} = {}) {
  if (!planner || typeof planner.resolve !== 'function') throw new TypeError('P21 requires P18 planner.resolve.');
  if (!activationValidator || typeof activationValidator.validate !== 'function') throw new TypeError('P21 requires P18 activation validator.');
  if (!executionEngine || typeof executionEngine !== 'object') throw new TypeError('P21 requires P19 execution engine object.');
  if (!targetPreparation || typeof targetPreparation.prepare !== 'function' || !frontierResolver || typeof frontierResolver.resolve !== 'function') throw new TypeError('P21 requires P20 preparation and frontier resolvers.');
  [loadSnapshots, validateProposal, projectVisible, narrate, verifyApproval, loadStartSnapshot, prepareStart, buildStartWritePlanInput].forEach((port, index) => requirePort(port, ['loadSnapshots', 'validateProposal', 'projectVisible', 'narrate', 'verifyApproval', 'loadStartSnapshot', 'prepareStart', 'buildStartWritePlanInput'][index]));
  if (!committer || typeof committer.commit !== 'function') throw new TypeError('P21 requires P16 CombinedAtomicCommitter.');
  if (createStartChangeSet != null) requirePort(createStartChangeSet, 'createStartChangeSet');
  if (!modeHandoff || typeof modeHandoff.handoff !== 'function') throw new TypeError('P21 requires P21-S04 modeHandoff.handoff port.');
  requirePort(buildModeHandoffProposal, 'buildModeHandoffProposal');
  const adapt = async (command, result) => {
    if (!result?.ok) return result ?? failure(command.party_id, 'command_adapter', 'resolver returned no result');
    const adapter = commandAdapters[command.command_kind];
    if (typeof adapter !== 'function') return failure(command.party_id, 'command_adapter', `missing approved adapter for ${command.command_kind}`);
    const adapted = await adapter(freeze({ command: clone(command), result: clone(result) }));
    if (!adapted?.ok || !plain(adapted.proposal)) return failure(command.party_id, 'command_adapter', `adapter rejected ${command.command_kind}`);
    return freeze({ ok: true, proposal: clone(adapted.proposal) });
  };
  const invokeP19 = async (method, payload, stage) => {
    if (typeof executionEngine[method] !== 'function') return failure(payload?.party_id, stage, `P19 execution engine.${method} is required`);
    try {
      const result = await executionEngine[method](payload);
      return result ?? failure(payload?.party_id, stage, `P19 execution engine.${method} returned no result`);
    } catch (cause) {
      return failure(payload?.party_id, stage, `P19 execution engine.${method} rejected: ${cause?.message ?? 'unknown error'}`);
    }
  };
  const invokeTraversal = async (payload) => {
    const operation = payload?.operation;
    if (operation === 'start') return invokeP19('startTraversal', payload, 'timed_traversal.start');
    if (operation === 'interval') return invokeP19('resolveTraversalInterval', payload, 'timed_traversal.interval');
    if (operation === 'synchronized_slice') return invokeP19('resolveSynchronizedSlice', payload, 'timed_traversal.synchronized_slice');
    return failure(payload?.party_id, 'timed_traversal', 'explicit traversal operation is required');
  };
  const invokeModeHandoff = async (command) => {
    const transition = await invokeP19('resolveModeTransition', command.command_payload, `mode_handoff.${command.command_kind}`);
    if (!transition?.ok || !plain(transition.handoff_input)) return transition ?? failure(command.party_id, 'mode_handoff', 'P19 transition result is unavailable');
    const handedOff = await modeHandoff.handoff(freeze(clone(transition.handoff_input)));
    if (!handedOff?.ok) return handedOff ?? failure(command.party_id, 'mode_handoff', 'P21 handoff rejected');
    const proposed = await buildModeHandoffProposal(freeze({ command: clone(command), p19_transition: clone(transition), handoff: clone(handedOff) }));
    if (!proposed?.ok || !plain(proposed.proposal)) return failure(command.party_id, 'mode_handoff', 'P16-governed handoff proposal is unavailable');
    return freeze({ ok: true, proposal: clone(proposed.proposal) });
  };
  const handlers = Object.freeze({
    path_query: async (command) => adapt(command, await planner.resolve(command.command_payload)),
    prepare_target: async (command) => adapt(command, await targetPreparation.prepare(command.command_payload)),
    resolve_frontier: async (command) => adapt(command, await frontierResolver.resolve(command.command_payload)),
    activate_plan: async (command) => adapt(command, await activationValidator.validate(command.command_payload)),
    immediate_action: async (command) => adapt(command, await invokeP19('executeImmediateAction', command.command_payload, 'immediate_action')),
    timed_activity: async (command) => adapt(command, await invokeP19('resolveTimedActivity', command.command_payload, 'timed_activity')),
    // P19's traversal operations are asynchronous.  The approved adapter must
    // see their resolved result, never the Promise itself: otherwise a truthy
    // Promise would bypass the sealed-proposal and typed-failure boundary.
    timed_traversal: async (command) => adapt(command, await invokeTraversal(command.command_payload)),
    resume_plan: async (command) => adapt(command, await commandAdapters.resume_plan?.({ command: clone(command) })),
    replan: async (command) => adapt(command, await commandAdapters.replan?.({ command: clone(command) })),
    recover_journey: async (command) => adapt(command, await commandAdapters.recover_journey?.({ command: clone(command) })),
    board_carrier: invokeModeHandoff,
    disembark_carrier: invokeModeHandoff,
    load_carrier: invokeModeHandoff,
    change_cohort: invokeModeHandoff
  });
  const registry = createSpatialV3CommandRegistry(handlers);
  const buildWritePlan = async (input) => {
    const built = await buildCombinedWritePlan(input.proposal.combined_write_plan_input, { verifyApproval });
    if (!built.ok) return built;
    return freeze({ ok: true, plan: seal({ kind: 'combined_write_plan', party_id: input.party_id, command_id: input.command.command_id, validation_report_digest: input.validation_report.canonical_digest, dependency_pins: input.snapshot.dependency_pins, combined_write_plan: built.plan }) });
  };
  const commit = async ({ party_id, plan }) => {
    const raw = plan?.combined_write_plan;
    if (!raw) return failure(party_id, 'commit', 'P16 plan envelope is missing');
    const result = await committer.commit({ plan: raw });
    if (!result?.ok) return result;
    return freeze({ ok: true, change_set: seal({ kind: 'committed_change_set', party_id, id: result.change_set_id, write_plan_digest: plan.canonical_digest, dependency_pins: plan.dependency_pins, p16_result: clone(result) }) });
  };
  const turn = createSpatialV3TurnOrchestrator({ loadSnapshots, registry, validateProposal, buildWritePlan, commit, projectVisible, narrate });
  const starter = createSpatialV3NewGameStarter({
    loadStartSnapshot,
    prepareStart,
    persistStart: async ({ party_id, start_snapshot, preparation }) => {
      const writeInput = await buildStartWritePlanInput(freeze({ party_id, start_snapshot: clone(start_snapshot), preparation: clone(preparation) }));
      if (!writeInput?.ok) return writeInput ?? failure(party_id, 'start_write_plan', 'start write input unavailable');
      const built = await buildCombinedWritePlan(writeInput.input, { verifyApproval });
      if (!built.ok) return built;
      const committed = await committer.commit({ plan: built.plan });
      if (!committed?.ok) return committed;
      const change = createStartChangeSet ? await createStartChangeSet(freeze({ party_id, plan: clone(built.plan), committed: clone(committed), dependency_pins: clone(start_snapshot.dependency_pins) })) : seal({ party_id, kind: 'committed_change_set', id: committed.change_set_id, write_plan_digest: null, dependency_pins: start_snapshot.dependency_pins });
      const write_plan = seal({ party_id, kind: 'party_runtime_v3_start_write_plan', dependency_pins: start_snapshot.dependency_pins, start_snapshot_digest: start_snapshot.canonical_digest, preparation_digest: preparation.canonical_digest, combined_write_plan: built.plan });
      const { canonical_digest: previousChangeDigest, ...changePayload } = change;
      const boundChange = seal({ ...changePayload, write_plan_digest: write_plan.canonical_digest });
      return freeze({ ok: true, schema_version: 3, write_plan, change_set: boundChange });
    }
  });
  return freeze({ status: 'target_shadow_only', registry, turn, new_game: starter, handoff: modeHandoff, submitTurn: turn.run.bind(turn), startNewGame: starter.start.bind(starter) });
}
