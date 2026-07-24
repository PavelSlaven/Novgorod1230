import { clone, exact, fail, freeze, pins, record, requirePort, sealed, same, text } from './spatial-v3-orchestration-core.js';
import { createSpatialV3NewGameStarter, createSpatialV3ModeHandoffOrchestrator } from './spatial-v3-orchestration-lifecycle.js';
import { createPresentationCoordinator, containsNarrationOutput, validateVisibleEnvelope } from './spatial-v3-orchestration-presentation.js';
import { createSpatialV3CommandRegistry, SPATIAL_V3_COMMAND_KINDS } from './spatial-v3-orchestration-registry.js';

export { createSpatialV3CommandRegistry, createSpatialV3ModeHandoffOrchestrator, createSpatialV3NewGameStarter, SPATIAL_V3_COMMAND_KINDS };
export const SPATIAL_V3_TURN_STAGE_IDS = Object.freeze([
  'normalize_intent', 'resolve_mode', 'load_context', 'availability', 'checks',
  'resolve_consequence_or_execution_plan', 'temporal_advance_if_required',
  'build_combined_change_set', 'derive_and_validate_visible_package',
  'build_persistence_plan', 'commit_factual_state_and_visible_package',
  'narration_from_persisted_package', 'screen_projection'
]);

/** P21-S02 target/shadow turn graph: facts and visible package commit before narration. */
export function createSpatialV3TurnOrchestrator({
  loadSnapshots, registry, validateProposal, advanceTemporal, buildCombinedChangeSet,
  deriveVisiblePackage, buildWritePlan, commit, loadCommittedVisiblePackage,
  claimPresentationAttempt, narrate, persistNarrationOutput,
  finalizePresentationAttempt, projectScreen
} = {}) {
  const ports = [loadSnapshots, validateProposal, advanceTemporal, buildCombinedChangeSet, deriveVisiblePackage, buildWritePlan, commit, loadCommittedVisiblePackage, claimPresentationAttempt, narrate, persistNarrationOutput, finalizePresentationAttempt, projectScreen];
  const names = ['loadSnapshots', 'validateProposal', 'advanceTemporal', 'buildCombinedChangeSet', 'deriveVisiblePackage', 'buildWritePlan', 'commit', 'loadCommittedVisiblePackage', 'claimPresentationAttempt', 'narrate', 'persistNarrationOutput', 'finalizePresentationAttempt', 'projectScreen'];
  ports.forEach((port, index) => requirePort(port, names[index]));
  if (!registry || typeof registry.dispatch !== 'function') throw new TypeError('P21 registry.dispatch is required.');
  const presentation = createPresentationCoordinator({ loadCommittedVisiblePackage, claimPresentationAttempt, narrate, persistNarrationOutput, finalizePresentationAttempt, projectScreen });

  return freeze({
    async run(input = {}) {
      const stageTrace = [];
      if (!record(input) || !text(input.party_id) || !text(input.request_id) || !sealed(input.command)) return fail('route_plan_version_pin_missing', input?.party_id, { stage: 'turn_input' });
      if (input.command.party_id !== input.party_id) return fail('route_plan_snapshot_missing', input.party_id, { stage: 'turn_input', reason: 'command party mismatch' });
      stageTrace.push(SPATIAL_V3_TURN_STAGE_IDS[0]);
      const resolved = await registry.dispatch(freeze(clone(input.command)));
      if (!resolved.ok) return resolved;
      stageTrace.push(SPATIAL_V3_TURN_STAGE_IDS[1]);
      const snapshots = await loadSnapshots(freeze({ party_id: input.party_id, request_id: input.request_id, command: clone(input.command) }));
      if (!snapshots?.ok || !exact(snapshots.snapshot, 'turn_factual_snapshot', input.party_id) || !pins(snapshots.snapshot.dependency_pins)) return fail('route_plan_snapshot_missing', input.party_id, { stage: 'load_snapshots' });
      stageTrace.push(SPATIAL_V3_TURN_STAGE_IDS[2]);
      if (!exact(resolved.proposal, `${input.command.command_kind}_proposal`, input.party_id, snapshots.snapshot.dependency_pins) || resolved.proposal.command_id !== input.command.command_id) return fail('generated_schema_mismatch', input.party_id, { stage: 'availability', reason: 'handler proposal must bind exact command, party and pins' });
      stageTrace.push(SPATIAL_V3_TURN_STAGE_IDS[3]);
      const validation = await validateProposal(freeze({ party_id: input.party_id, command: clone(input.command), snapshot: clone(snapshots.snapshot), proposal: clone(resolved.proposal) }));
      if (!validation?.ok || !exact(validation.report, 'turn_validation_report', input.party_id, snapshots.snapshot.dependency_pins) || validation.report.command_id !== input.command.command_id || validation.report.proposal_digest !== resolved.proposal.canonical_digest) return fail('generated_schema_mismatch', input.party_id, { stage: 'validate' });
      stageTrace.push(SPATIAL_V3_TURN_STAGE_IDS[4], SPATIAL_V3_TURN_STAGE_IDS[5]);
      const temporal = await advanceTemporal(freeze({ party_id: input.party_id, request_id: input.request_id, command: clone(input.command), snapshot: clone(snapshots.snapshot), proposal: clone(resolved.proposal), validation_report: clone(validation.report) }));
      if (!temporal?.ok || !sealed(temporal.result) || temporal.result.party_id !== input.party_id) return fail('generated_schema_mismatch', input.party_id, { stage: 'temporal_advance' });
      stageTrace.push(SPATIAL_V3_TURN_STAGE_IDS[6]);
      const combined = await buildCombinedChangeSet(freeze({ party_id: input.party_id, request_id: input.request_id, command: clone(input.command), snapshot: clone(snapshots.snapshot), proposal: clone(resolved.proposal), validation_report: clone(validation.report), temporal_result: clone(temporal.result) }));
      if (!combined?.ok || !exact(combined.change_set, 'combined_change_set_candidate', input.party_id, snapshots.snapshot.dependency_pins) || !text(combined.change_set.id)) return fail('temporal_change_set_conflict', input.party_id, { stage: 'combined_change_set' });
      stageTrace.push(SPATIAL_V3_TURN_STAGE_IDS[7]);
      const projected = await deriveVisiblePackage(freeze({ party_id: input.party_id, turn_id: input.request_id, command: clone(input.command), snapshot: clone(snapshots.snapshot), proposal: clone(resolved.proposal), validation_report: clone(validation.report), temporal_result: clone(temporal.result), combined_change_set: clone(combined.change_set) }));
      const visibleFailure = validateVisibleEnvelope(projected?.envelope, { partyId: input.party_id, turnId: input.request_id, changeSetId: combined.change_set.id, dependencyPins: snapshots.snapshot.dependency_pins, requirePending: true });
      if (visibleFailure) return fail(visibleFailure.code, input.party_id, { stage: 'visible_package', ...visibleFailure.diagnostics });
      const visibleEnvelope = projected.envelope;
      stageTrace.push(SPATIAL_V3_TURN_STAGE_IDS[8]);
      const built = await buildWritePlan(freeze({ party_id: input.party_id, command: clone(input.command), snapshot: clone(snapshots.snapshot), proposal: clone(resolved.proposal), validation_report: clone(validation.report), temporal_result: clone(temporal.result), combined_change_set: clone(combined.change_set), visible_package_envelope: clone(visibleEnvelope) }));
      if (!built?.ok || !exact(built.plan, 'combined_write_plan', input.party_id, snapshots.snapshot.dependency_pins) || built.plan.command_id !== input.command.command_id || built.plan.validation_report_digest !== validation.report.canonical_digest || built.plan.combined_change_set_digest !== combined.change_set.canonical_digest || !same(built.plan.visible_package_envelope, visibleEnvelope) || containsNarrationOutput(built.plan)) return fail('generated_schema_mismatch', input.party_id, { stage: 'write_plan' });
      stageTrace.push(SPATIAL_V3_TURN_STAGE_IDS[9]);
      const committed = await commit(freeze({ party_id: input.party_id, plan: clone(built.plan) }));
      const committedVisibleFailure = validateVisibleEnvelope(committed?.visible_package_envelope, { partyId: input.party_id, turnId: input.request_id, changeSetId: combined.change_set.id, dependencyPins: snapshots.snapshot.dependency_pins, requirePending: true });
      if (!committed?.ok || !exact(committed.change_set, 'committed_change_set', input.party_id, snapshots.snapshot.dependency_pins) || committed.change_set.write_plan_digest !== built.plan.canonical_digest || committed.change_set.id !== combined.change_set.id || committedVisibleFailure || !same(committed.visible_package_envelope, visibleEnvelope)) return fail('generated_schema_mismatch', input.party_id, { stage: 'commit' });
      stageTrace.push(SPATIAL_V3_TURN_STAGE_IDS[10]);
      const presented = await presentation.presentPersistedPackage({ partyId: input.party_id, packageId: visibleEnvelope.package_id, packageDigest: visibleEnvelope.package_digest, changeSetId: committed.change_set.id, dependencyPins: snapshots.snapshot.dependency_pins });
      stageTrace.push(SPATIAL_V3_TURN_STAGE_IDS[11], SPATIAL_V3_TURN_STAGE_IDS[12]);
      return freeze({ ok: true, outer_status: presented.outer_status, command: clone(input.command), snapshot: clone(snapshots.snapshot), proposal: clone(resolved.proposal), validation_report: clone(validation.report), temporal_result: clone(temporal.result), combined_change_set: clone(combined.change_set), write_plan: clone(built.plan), change_set: clone(committed.change_set), visible_package: clone(presented.visible_package), narration: presented.narration ? clone(presented.narration) : null, presentation_outcome: presented.presentation_outcome ? clone(presented.presentation_outcome) : null, screen: clone(presented.screen), stage_trace: [...stageTrace] });
    },
    async retryPresentation(input = {}) {
      if (!record(input) || !text(input.party_id) || !text(input.package_id) || !text(input.package_digest)) return fail('visible_package_persistence_gap', input?.party_id, { stage: 'presentation_retry_input' });
      const presented = await presentation.presentPersistedPackage({ partyId: input.party_id, packageId: input.package_id, packageDigest: input.package_digest, changeSetId: text(input.change_set_id) || null, dependencyPins: input.dependency_pins ?? null });
      return freeze({ ok: true, outer_status: presented.outer_status, visible_package: clone(presented.visible_package), narration: presented.narration ? clone(presented.narration) : null, presentation_outcome: presented.presentation_outcome ? clone(presented.presentation_outcome) : null, screen: clone(presented.screen) });
    }
  });
}
