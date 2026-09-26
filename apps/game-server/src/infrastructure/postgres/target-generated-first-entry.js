import { compileGeneratedNpcBindings } from '@rus/materialization';
import { createSpatialV3TypedError } from '@rus/contracts/spatial-v3/registry';
import { prepareGeneratedNpcFirstEntry } from './generated-npc-first-entry.js';

const pinKeys = ['catalog_scope', 'catalog_revision_id', 'catalog_digest', 'activation_event_id',
  'import_id', 'import_audit_digest', 'record_registry_digest', 'runtime_contract_digest',
  'compatible_world_revision_id', 'compatible_world_catalog_digest', 'compatible_world_pin_manifest_digest'];
const actorKeys = pinKeys.slice(0, 8);
const text = (value) => typeof value === 'string' && value.trim().length > 0;

/** Compose admitted natural and NPC proposals under the existing expansion transaction. */
export function createTargetGeneratedFirstEntry({ worldBaseReader, verifiedItemCatalog,
  actorBaseAttributesBinding, approvedActorTemporalBundle, prepareNaturalFirstEntry,
  readFactualContext } = {}) {
  return async function prepareFirstEntry(context) {
    const { transaction, request, proposal, change_set_id: changeSetId, dependency_pins } = context;
    const gap = (reason) => ({ ok: false, error: createSpatialV3TypedError('authoring_dependency_pin_missing', {
      subject_ref: { entity_kind: 'world_revision', entity_id: request.g4.world_revision_id },
      dependency_pins, diagnostics: { reason } }) });
    if (typeof readFactualContext !== 'function') return gap('target_first_entry_factual_context_required');
    if (typeof prepareNaturalFirstEntry !== 'function'
      || typeof worldBaseReader?.readPinnedG4NpcCompositionClosure !== 'function'
      || typeof transaction?.query !== 'function') return gap('target_first_entry_owners_required');
    const itemPin = verifiedItemCatalog?.pin;
    const actorPin = actorBaseAttributesBinding?.pin;
    const actorProfile = actorBaseAttributesBinding?.runtime_profile;
    if (verifiedItemCatalog?.schema !== 'rus.verified_item_catalog.v2' || verifiedItemCatalog.verified !== true
      || itemPin?.catalog_scope !== 'item_container_materialization_v2'
      || actorBaseAttributesBinding?.schema !== 'rus.actor_base_attributes_runtime_binding.v1'
      || actorPin?.catalog_scope !== 'actor_base_attributes_v1'
      || actorKeys.some((key) => !text(actorPin?.[key]) || actorPin[key] !== actorProfile?.[key])
      || [itemPin, actorPin].some((pin) => pin?.schema !== 'rus.runtime_catalog_pin.v2'
        || pinKeys.some((key) => !text(pin[key]))
        || pin.compatible_world_revision_id !== request.g4.world_revision_id)
      || actorPin.compatible_world_catalog_digest !== itemPin.compatible_world_catalog_digest
      || actorPin.compatible_world_pin_manifest_digest !== itemPin.compatible_world_pin_manifest_digest
      || approvedActorTemporalBundle?.schema !== 'rus.procedural_actor_temporal_bundle.v1'
      || approvedActorTemporalBundle.world_pin?.world_revision_id !== request.g4.world_revision_id
      || approvedActorTemporalBundle.world_pin?.world_catalog_digest !== itemPin.compatible_world_catalog_digest) {
      return gap('target_first_entry_runtime_catalog_pin_required');
    }
    const pinned = (await transaction.query(`SELECT * FROM party_runtime.party_catalog_pins
      WHERE party_id=$1 AND catalog_scope=ANY($2::text[]) FOR SHARE`,
    [request.party_id, [itemPin.catalog_scope, actorPin.catalog_scope]])).rows;
    if ([itemPin, actorPin].some((pin) => {
      const rows = pinned.filter((row) => row.catalog_scope === pin.catalog_scope);
      return rows.length !== 1 || pinKeys.some((key) => rows[0][key] !== pin[key]);
    })) return gap('target_first_entry_party_catalog_pin_mismatch');
    const sites = proposal.inserts.filter((row) => row.target_table === 'party_g5_sites'
      && row.id === proposal.target_site_id);
    const site = sites[0]?.record;
    const selected = context.selection?.selected_template;
    const template = { id: site?.generated_template_ref?.entity_id,
      version: Number(site?.generated_template_ref?.authoring_version),
      world_revision_id: request.g4.world_revision_id, canonical_digest: selected?.template_digest };
    if (sites.length !== 1 || site.party_id !== request.party_id
      || site.parent_g4_id !== request.g4.id || !text(template.id)
      || !Number.isSafeInteger(template.version) || template.version < 1
      || template.id !== selected?.template_id || template.version !== selected?.template_version
      || !/^[a-f0-9]{64}$/.test(template.canonical_digest ?? '')) return gap('target_first_entry_generated_scope_required');
    const read = await worldBaseReader.readPinnedG4NpcCompositionClosure({ g4: request.g4,
      generation_template: template });
    if (!read.ok) return read;
    const factual = await readFactualContext(context);
    if (!factual?.ok) return factual?.error ? factual : gap('target_first_entry_factual_context_required');
    if (factual.party_id !== request.party_id || factual.world_revision_id !== request.g4.world_revision_id
      || !factual.started_at || !factual.calendar_profile
      || factual.environment?.schema !== 'rus.approved_initial_environment.v1'
      || typeof factual.recheck !== 'function') return gap('target_first_entry_factual_context_required');
    const runId = `trace:${changeSetId}`;
    const scene = { party_id: request.party_id, site_id: proposal.target_site_id, rows: proposal.inserts };
    const compiled = compileGeneratedNpcBindings({ party_id: request.party_id, run_id: runId,
      scene, closure: read.value, approved_bundle: approvedActorTemporalBundle,
      environment: factual.environment, actor_base_attributes_runtime_profile: actorProfile,
      equipment_activation: { status: 'active' }, equipment_catalog_digest: itemPin.catalog_digest,
      world_catalog_digest: itemPin.compatible_world_catalog_digest });
    const npc = compiled.npc_inputs.length === 0 ? null : prepareGeneratedNpcFirstEntry({
      party_id: request.party_id, run_id: runId, change_set_id: changeSetId,
      world_revision_id: request.g4.world_revision_id, g4_ref: request.g4, generation_template_ref: template,
      scene, ...compiled, started_at: factual.started_at, calendar_profile: factual.calendar_profile });
    const natural = await prepareNaturalFirstEntry(context);
    if (!natural?.ok) return natural?.error ? natural : gap('target_first_entry_natural_proposal_required');
    if (!Array.isArray(natural.approved_write_sets) || typeof natural.recheck !== 'function') {
      return gap('target_first_entry_natural_proposal_required');
    }
    return { ok: true, approved_write_sets: [...natural.approved_write_sets, ...(npc ? [npc.write_set] : [])],
      expected_state_versions: [...(natural.expected_state_versions ?? []), ...(factual.expected_state_versions ?? [])],
      commit_rechecks: [...(natural.commit_rechecks ?? []), ...(factual.commit_rechecks ?? [])],
      materialization_trace: { catalog_pins: [itemPin, actorPin], selection: compiled.selection_trace,
        choices: npc?.choices ?? [], attribute_traces: npc?.attribute_traces ?? [],
        validation_report: npc?.validation_report ?? { pass: true, domain: 'npc', created_count: 0, equipment_count: 0 } },
      recheck: async (recheckContext) => {
        const checked = await factual.recheck(recheckContext);
        return checked?.ok ? natural.recheck(recheckContext) : checked;
      } };
  };
}
