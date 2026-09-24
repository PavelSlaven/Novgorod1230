import { canonicalDigest } from '@rus/materialization';
import { materializeSpatialV3Expansion, materializeSpatialV3GeneratedScene,
  selectSpatialV3Expansion } from '@rus/materialization/spatial-v3-materialization';
import { createSpatialV3Repository } from '@rus/party-store/spatial-v3';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { computeSpatialV3CanonicalDigest as digest,
  createSpatialV3TypedError } from '@rus/contracts/spatial-v3/registry';

const ref = (entity_id, version) => ({ entity_id, authoring_version: String(version) });
const exact = (row, pin) => row?.id === pin?.id && row.version === pin.version;
const semanticRows = (rows) => rows.map(({ target_table, id, record }) => ({ target_table, id,
  record: Object.fromEntries(Object.entries(record).filter(([key]) =>
    !key.endsWith('_change_set_id') && !key.endsWith('_digest')
    && !['materialization_trace_id', 'choice_trace_id', 'idempotency_record_id'].includes(key))) }));

/** Server-only composition: exact reads and proposals share the existing P16 lock/transaction. */
export function createSpatialV3GeneratedExpansionAdapter({ worldBaseReader, committer,
  writePlanBuilder, admitGeneration, projectVisible, prepareFirstEntry, now = () => Date.now() } = {}) {
  async function prepareExpansion(request) {
    const { party_id, g4, profile, slot_ref, directional_exit, candidate_ordinal,
      source_site_id, source_position_id, entry_binding, materializer_version } = request ?? {};
    const pins = [[g4, 'canonical_spatial_node'], [profile, 'g4_expansion_profile']].filter(([pin]) => pin)
      .map(([pin, kind]) => ({ dependency_role: 'source_authoring',
      entity_ref: { entity_kind: kind, entity_id: pin.id },
      version_pin: { pin_kind: 'authoring_version', authoring_version: String(pin.version) } }));
    let dependency_pins = { pins, canonical_digest: digest(pins).slice(7) };
    const appendPins = (kind, rows) => {
      const combined = [...dependency_pins.pins, ...rows.map((row) => ({ dependency_role: 'source_authoring',
        entity_ref: { entity_kind: kind, entity_id: row.id },
        version_pin: { pin_kind: 'authoring_version', authoring_version: String(row.version) } }))];
      const unique = [...new Map(combined.map((pin) => [canonicalDigest(pin), pin])).values()];
      dependency_pins = { pins: unique, canonical_digest: digest(unique).slice(7) };
    };
    const reject = (reason, code = 'authoring_dependency_pin_missing') => ({ ok: false,
      error: createSpatialV3TypedError(code, { subject_ref: { entity_kind: 'world_revision',
        entity_id: g4?.world_revision_id ?? 'unknown' }, dependency_pins, diagnostics: { reason } }) });
    if (![party_id, source_site_id, source_position_id, materializer_version].every((s) => typeof s === 'string' && s.trim())
      || !Number.isSafeInteger(candidate_ordinal) || candidate_ordinal < 0
      || !g4 || !profile || !slot_ref || !directional_exit) return reject('exact_expansion_request_required');
    if (typeof committer?.prepareExpansion !== 'function'
      || typeof admitGeneration !== 'function' || typeof projectVisible !== 'function') {
      return reject('generation_admission_projection_and_p16_owners_required');
    }
    const read = await worldBaseReader.readPinnedG4ExpansionClosure({ g4, profile });
    if (!read.ok) return read;
    const closure = read.value;
    appendPins('expansion_rule_set', closure.expansion_rule_sets);
    const authoring_refs = closure.expansion_rule_sets.map((row) => ({ entity_kind: 'expansion_rule_set',
      id: row.id, version: row.version, canonical_digest: row.canonical_digest }));
    appendPins('expansion_slot', closure.slots.filter((row) => exact(row, slot_ref)));
    appendPins('g4_directional_exit', closure.directional_exits.filter((row) => exact(row, directional_exit)));
    const identity = { party_id, world_revision_id: g4.world_revision_id,
      g4_profile_id: profile.id, g4_profile_version: profile.version,
      expansion_slot_key: `${slot_ref.id}@${slot_ref.version}`, candidate_ordinal };
    const idempotency_key = `resolve_frontier:${canonicalDigest(identity)}`;
    const canonical_input_digest = digest({ ...identity, g4, profile, directional_exit,
      source_site_id, source_position_id, entry_binding: entry_binding ?? null, materializer_version });
    const change_set_id = `expansion:${canonicalDigest(identity)}`;
    const suffix = digest({ party_id, profile: ref(profile.id, profile.version),
      slot: ref(slot_ref.id, slot_ref.version) }).slice(7);
    const outcome = await committer.prepareExpansion({ party_id, g4_id: g4.id, idempotency_key,
      canonical_input_digest, prepare: async ({ transaction }) => {
        const loaded = await createSpatialV3Repository({ transaction }).loadExpansionState({ party_id, g4_id: g4.id });
        if (!loaded.ok) return loaded;
        const snapshot = loaded.snapshot;
        const current = await transaction.query(`SELECT party.state_version, session.last_turn_id
          FROM party_runtime.parties party
          JOIN party_runtime.party_state_snapshots state
            ON state.party_id=party.party_id AND state.state_version=party.state_version
          LEFT JOIN party_runtime.party_server_sessions session ON session.party_id=party.party_id
          WHERE party.party_id=$1`, [party_id]);
        if (current.rows.length !== 1 || !/^[1-9][0-9]*$/u.test(String(current.rows[0].state_version))) {
          return reject('committed_party_state_required', 'visible_package_persistence_gap');
        }
        const chain = snapshot.chains.find((row) => row.id === `expansion:${suffix}:chain`);
        const timestamp = now();
        let selection;
        try { selection = selectSpatialV3Expansion({ closure, snapshot, now: timestamp,
          party_id, slot_ref, directional_exit, entry_binding, candidate_ordinal,
          ...(candidate_ordinal === 0 ? {} : { terminal_ordinal: chain?.terminal_ordinal }) });
        } catch (cause) { return reject(cause.code ?? cause.message, 'spatial_candidate_gap'); }
        if (!selection.ok) return reject(selection.code, selection.code);
        if (selection.idempotency_key !== idempotency_key) return reject('selection_identity_changed');
        appendPins('continuation_length_rule', closure.continuation_length_rules.filter((row) =>
          row.id === selection.slot.continuation_length_rule_id && row.version === selection.slot.continuation_length_rule_version));
        appendPins('expansion_terminal_policy', closure.terminal_policies.filter((row) =>
          row.id === selection.slot.terminal_policy_id && row.version === selection.slot.terminal_policy_version));
        const sourceSite = snapshot.sites.find((row) => row.id === source_site_id);
        const sourceBaseline = snapshot.scene_baselines.find((row) => row.host_kind === 'g5_site'
          && row.host_id === source_site_id && row.status === 'active');
        if (!sourceSite || !sourceBaseline) return reject('committed_source_baseline_required');
        const sourceRead = await worldBaseReader.readPinnedSceneTemplateClosure({
          id: sourceBaseline.scene_template_ref?.entity_id,
          version: Number(sourceBaseline.scene_template_ref?.authoring_version), world_revision_id: g4.world_revision_id });
        if (!sourceRead.ok) return sourceRead;
        const sourcePosition = snapshot.scene_positions.find((row) => row.id === source_position_id);
        const departure = sourceRead.value.endpoint_slots.filter((row) => ['departure', 'both'].includes(row.endpoint_role)
          && row.required_position_slot_key === sourcePosition?.template_slot_key
          && row.required_position_instance_ordinal === sourcePosition?.template_instance_ordinal);
        if (departure.length !== 1) return reject('source_departure_endpoint_required');
        const selected = selection.selected_template;
        const sceneCandidates = selected ? closure.scene_materialization_candidates.filter((row) =>
          row.profile_id === selected.scene_materialization_profile_id
          && row.profile_version === selected.scene_materialization_profile_version) : [];
        // The real owner evaluates candidate applicability, natural baseline and all required authoring bindings.
        const admitted = await admitGeneration({ transaction, request, closure, snapshot,
          selection, scene_candidates: sceneCandidates, dependency_pins });
        if (!admitted?.ok) return admitted?.error ? admitted : reject('generation_admission_required');
        if (!admitted.validation_report || !Array.isArray(admitted.commit_rechecks)
          || typeof admitted.recheck !== 'function') return reject('generation_commit_rechecks_required');
        let scene;
        let terminal_target;
        let terminal_writes = [];
        if (selected) {
          const candidate = sceneCandidates.find((row) => row.scene_template_id === admitted.scene_template_ref?.id
            && row.scene_template_version === admitted.scene_template_ref?.version);
          if (!candidate) return reject('approved_scene_selection_required');
          const sceneRead = await worldBaseReader.readPinnedSceneTemplateClosure({
            id: candidate.scene_template_id, version: candidate.scene_template_version,
            world_revision_id: g4.world_revision_id });
          if (!sceneRead.ok) return sceneRead;
          const acoustic = await worldBaseReader.readPinnedG5AcousticClosure({
            g5_template: { id: selected.template_id, version: selected.template_version,
              world_revision_id: g4.world_revision_id, canonical_digest: selected.template_digest },
            scene_template: sceneRead.value.header, world_revision_id: g4.world_revision_id });
          if (!acoustic.ok) return acoustic;
          appendPins('g5_generation_template', [{ id: selected.template_id, version: selected.template_version }]);
          appendPins('scene_materialization_profile', [{ id: selected.scene_materialization_profile_id,
            version: selected.scene_materialization_profile_version }]);
          appendPins('scene_template', [sceneRead.value.header]);
          appendPins('g6_acoustic_baseline', acoustic.value.rows);
          authoring_refs.push(...acoustic.value.rows.map((row) => ({ entity_kind: 'g6_acoustic_baseline',
            id: row.id, version: row.version, canonical_digest: row.canonical_digest })));
          const prepared = materializeSpatialV3GeneratedScene({ party_id,
            site_id: `expansion:${suffix}:site:${candidate_ordinal}`,
            baseline_id: `expansion:${suffix}:baseline:${candidate_ordinal}`,
            change_set_id, materializer_version, materialization_trace_id: `trace:${change_set_id}`,
            generation_template: { id: selected.template_id, version: selected.template_version },
            scene_closure: sceneRead.value, acoustic_rows: acoustic.value.rows, dependency_pins });
          if (!prepared.ok) return prepared;
          scene = prepared.proposal;
        } else {
          const exit = closure.directional_exits.find((row) => exact(row, directional_exit));
          let target = snapshot.sites.find((row) => row.origin === 'canonical' && row.status === 'active'
            && row.canonical_g5_ref?.entity_id === exit?.exit_canonical_g5_id
            && String(row.canonical_g5_ref.authoring_version) === String(exit.exit_canonical_g5_version));
          let baseline = snapshot.scene_baselines.find((row) => row.host_id === target?.id && row.status === 'active');
          if (!baseline) {
            const canonicalRead = await worldBaseReader.readPinnedCanonicalG5SceneBinding({
              id: exit.exit_canonical_g5_id, version: exit.exit_canonical_g5_version,
              world_revision_id: g4.world_revision_id });
            if (!canonicalRead.ok) return canonicalRead;
            const canonical = canonicalRead.value;
            if (canonical.parent_id !== g4.id || canonical.parent_version !== g4.version
              || canonical.id !== exit.exit_canonical_g5_id || canonical.version !== exit.exit_canonical_g5_version) {
              return reject('canonical_terminal_parent_pin_mismatch', 'terminal_target_gap');
            }
            const sceneRead = await worldBaseReader.readPinnedSceneTemplateClosure({
              id: canonical.scene_template_id, version: canonical.scene_template_version,
              world_revision_id: g4.world_revision_id });
            if (!sceneRead.ok) return sceneRead;
            const acoustic = await worldBaseReader.readPinnedCanonicalG5AcousticClosure({
              canonical_g5: canonical, scene_template: sceneRead.value.header,
              world_revision_id: g4.world_revision_id });
            if (!acoustic.ok) return acoustic;
            appendPins('canonical_spatial_node', [canonical]);
            appendPins('scene_materialization_profile', [{ id: canonical.materialization_profile_id,
              version: canonical.materialization_profile_version }]);
            appendPins('scene_template', [sceneRead.value.header]);
            appendPins('g6_acoustic_baseline', acoustic.value.rows);
            authoring_refs.push(...acoustic.value.rows.map((row) => ({ entity_kind: 'g6_acoustic_baseline',
              id: row.id, version: row.version, canonical_digest: row.canonical_digest })));
            const canonicalId = `canonical:${canonicalDigest({ party_id, id: canonical.id, version: canonical.version })}`;
            const siteId = target?.id ?? `${canonicalId}:site`;
            const materialized = materializeSpatialV3GeneratedScene({ party_id, site_id: siteId,
              baseline_id: `${canonicalId}:baseline`, change_set_id, materializer_version,
              materialization_trace_id: `trace:${change_set_id}`, canonical_g5: canonical,
              scene_closure: sceneRead.value, acoustic_rows: acoustic.value.rows, dependency_pins });
            if (!materialized.ok) return materialized;
            if (!target) {
              target = { id: siteId, party_id, origin: 'canonical', parent_g4_id: g4.id,
                canonical_g5_ref: ref(canonical.id, canonical.version), status: 'active', state_version: 1,
                created_change_set_id: change_set_id, updated_change_set_id: change_set_id };
              terminal_writes.push({ target_table: 'party_g5_sites', id: siteId, record: target });
            }
            terminal_writes.push(...materialized.proposal.rows);
            baseline = materialized.proposal.rows.find((row) => row.target_table === 'party_scene_baselines').record;
          }
          const targetRead = await worldBaseReader.readPinnedSceneTemplateClosure({
            id: baseline.scene_template_ref.entity_id, version: Number(baseline.scene_template_ref.authoring_version),
            world_revision_id: g4.world_revision_id });
          if (!targetRead.ok) return targetRead;
          const arrivals = targetRead.value.endpoint_slots.filter((row) => ['arrival', 'both'].includes(row.endpoint_role));
          const arrival = arrivals[0];
          const targetG6 = [...snapshot.g6_instances, ...terminal_writes.filter((row) => row.target_table === 'party_g6_instances').map((row) => row.record)]
            .filter((row) => row.scene_baseline_id === baseline.id && row.status === 'active');
          const positions = [...snapshot.scene_positions, ...terminal_writes.filter((row) => row.target_table === 'scene_position_nodes').map((row) => row.record)]
            .filter((row) => targetG6.some((g6) => g6.id === row.g6_instance_id)
            && row.template_slot_key === arrival?.required_position_slot_key
            && row.template_instance_ordinal === arrival?.required_position_instance_ordinal && row.status === 'active');
          if (arrivals.length !== 1 || positions.length !== 1) return reject('canonical_terminal_endpoint_required', 'terminal_target_gap');
          terminal_target = { canonical_g5_id: exit.exit_canonical_g5_id, canonical_g5_version: exit.exit_canonical_g5_version,
            site_id: target.id, position_id: positions[0].id, slot_key: arrival.slot_key };
        }
        const prepared = materializeSpatialV3Expansion({ party_id, change_set_id, closure, snapshot,
          selection, scene, candidate_ordinal, dependency_pins, now: timestamp, terminal_target, terminal_writes,
          materialization_trace_id: `trace:${change_set_id}`,
          source: { site_id: source_site_id, position_id: source_position_id, entry_binding,
            departure_endpoint_slot_key: departure[0].slot_key,
            departure_position_slot_key: departure[0].required_position_slot_key } });
        if (!prepared.ok) return prepared;
        const proposal = prepared.proposal;
        if (selected && typeof prepareFirstEntry !== 'function') return reject('first_entry_owner_required');
        const firstEntry = selected
          ? await prepareFirstEntry({ transaction, request, closure, snapshot, selection,
            proposal, change_set_id, dependency_pins })
          : { ok: true, approved_write_sets: [] };
        if (!firstEntry?.ok) return firstEntry?.error ? firstEntry : reject('first_entry_proposal_required');
        if (!Array.isArray(firstEntry.approved_write_sets)) return reject('first_entry_write_sets_required');
        const firstEntryWrites = firstEntry.approved_write_sets.flatMap((set) =>
          [...(set.inserts ?? []), ...(set.updates ?? []), ...(set.appends ?? [])]);
        if (!Array.isArray(selection.choices)) return reject('materialization_choice_trace_required');
        const run_id = `trace:${change_set_id}`;
        const trace = { run_id, request_id: idempotency_key, party_id,
          trigger: 'frontier_resolution', world_revision_id: g4.world_revision_id,
          materializer_version, catalog_digest: canonicalDigest(closure),
          canonical_input_digest: canonical_input_digest.slice(7),
          canonical_output_digest: canonicalDigest({ inserts: semanticRows(proposal.inserts),
            updates: semanticRows(proposal.updates), connection_id: proposal.connection_id,
            target_site_id: proposal.target_site_id, target_position_id: proposal.target_position_id,
            first_entry: semanticRows(firstEntryWrites),
            ...(firstEntry.materialization_trace ? { first_entry_trace: firstEntry.materialization_trace } : {}) }),
          validation_report_digest: canonicalDigest(admitted.validation_report),
          created_change_set_id: change_set_id, occurred_at_turn: admitted.created_at_turn ?? 0,
          dependency_pins, authoring_refs,
          ...(firstEntry.materialization_trace ? { first_entry: firstEntry.materialization_trace } : {}),
          choice_ids: selection.choices.map((row) => `${run_id}:${row.choice_ordinal}`),
          seed_context: selection.seed_context, seed_digest: selection.seed_digest };
        const traceWrites = [{ target_table: 'party_materialization_runs', id: run_id,
          record: { party_id, run_id, g4_id: g4.id, run_kind: 'expansion', occurrence: candidate_ordinal,
            seed_digest: selection.seed_digest, input_digest: trace.canonical_input_digest,
            catalog_digest: trace.catalog_digest, materializer_version, rng_version: 'mulberry32_v1',
            result_digest: trace.canonical_output_digest, idempotency_key, status: 'committed',
            validation_report: admitted.validation_report, trace,
            created_refs: [...proposal.inserts, ...firstEntryWrites].map((row) => ({ table: row.target_table, id: row.id })) } },
        ...selection.choices.map((choice) => ({ target_table: 'party_materialization_choices',
          id: `${run_id}:${choice.choice_ordinal}`, record: { party_id, run_id, ...choice } }))];
        const visible = await projectVisible({ transaction, request, closure, snapshot, proposal, firstEntry,
          dependency_pins, current_state_version: String(current.rows[0].state_version),
          current_turn_id: current.rows[0].last_turn_id, package_id: `visible:${change_set_id}`,
          idempotency_key, change_set_id, idempotency_record_id: `idem:${change_set_id}` });
        if (!visible?.ok) return visible?.error ? visible : reject('visible_projection_required');
        if (!visible.envelope?.projection_policy_ref) {
          return reject('approved_projection_policy_ref_required', 'visible_package_persistence_gap');
        }
        const change = { target_table: 'party_v3_change_sets', id: change_set_id,
          record: { id: change_set_id, party_id, operation_kind: 'resolve_frontier', idempotency_record_id: `idem:${change_set_id}` } };
        const approvedWriteSets = [{ inserts: proposal.inserts, updates: proposal.updates, appends: [change, ...traceWrites] }, ...firstEntry.approved_write_sets];
        const builder = writePlanBuilder ?? createCombinedWritePlanBuilder({
          verifyApproval: async (candidate) => ({ ok: candidate.party_id === party_id
            && candidate.operation_kind === 'resolve_frontier'
            && candidate.canonical_input_digest === canonical_input_digest
            && canonicalDigest(candidate.validation_report) === canonicalDigest(admitted.validation_report)
            && canonicalDigest(candidate.approved_write_sets) === canonicalDigest(approvedWriteSets)
            && canonicalDigest(candidate.visible_package_envelope) === canonicalDigest(visible.envelope) })
        });
        const built = await builder.build({ plan_id: `plan:${change_set_id}`, party_id,
          write_plan_kind: 'semantic_commit', operation_kind: 'resolve_frontier', canonical_input_digest,
          expected_state_versions: [...proposal.expected_state_versions, ...(firstEntry.expected_state_versions ?? [])], validation_report: admitted.validation_report,
          idempotency: { id: `idem:${change_set_id}`, key: idempotency_key }, change_set: { id: change_set_id },
          visible_package_envelope: visible.envelope,
          approved_write_sets: approvedWriteSets,
          lock_context: { owner_keys: [], execution_keys: [], g4_keys: [`${party_id}:${g4.id}`],
            physical_keys: [...proposal.inserts, ...proposal.updates, ...firstEntryWrites, change, ...traceWrites].map((row) => `party_runtime.${row.target_table}:${row.id}`) },
          commit_rechecks: [...admitted.commit_rechecks, ...(firstEntry.commit_rechecks ?? [])] });
        return built.ok ? { ok: true, plan: built.plan, recheck: async (context) => {
          const checked = await admitted.recheck(context);
          if (!checked?.ok || typeof firstEntry.recheck !== 'function') return checked;
          return firstEntry.recheck(context);
        },
          created_at_turn: admitted.created_at_turn } : built;
      } });
    return outcome.ok ? Object.freeze({ ...outcome, topology_status: 'committed',
      connection_id: `expansion:${suffix}:connection:${candidate_ordinal}`,
      source_position_id, directional_exit: Object.freeze({ ...directional_exit }),
      moves_traveller: false, advances_time: false }) : outcome;
  }
  return Object.freeze({ prepareExpansion });
}
