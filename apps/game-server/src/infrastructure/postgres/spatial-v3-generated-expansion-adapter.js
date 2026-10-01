import { canonicalDigest } from '@rus/materialization';
import { materializeSpatialV3CanonicalConnection, materializeSpatialV3Expansion,
  materializeSpatialV3GeneratedScene, selectSpatialV3Expansion } from '@rus/materialization/spatial-v3-materialization';
import { createSpatialV3Repository } from '@rus/party-store/spatial-v3';
import { createCombinedWritePlanBuilder } from '@rus/turn';
import { computeSpatialV3CanonicalDigest as digest,
  createSpatialV3TypedError, validateSpatialV3Contract } from '@rus/contracts/spatial-v3/registry';
import { SPATIAL_V3_CURRENT_VISIBLE_PROJECTION_POLICY_REF as projectionPolicyRef } from '../../runtime/spatial-v3-current-visible-context.js';

const ref = (entity_id, version) => ({ entity_id, authoring_version: String(version) });
const exact = (row, pin) => row?.id === pin?.id && row.version === pin.version;
const semanticRows = (rows) => rows.map(({ target_table, id, record }) => ({ target_table, id,
  record: Object.fromEntries(Object.entries(record).filter(([key]) =>
    !key.endsWith('_change_set_id') && !key.endsWith('_digest')
    && !['materialization_trace_id', 'choice_trace_id', 'idempotency_record_id'].includes(key))) }));

/** Dependency pins of one preparation. `pins()` is read at the moment a proposal is built. */
function createPinBook(g4, profile) {
  const first = [[g4, 'canonical_spatial_node'], [profile, 'g4_expansion_profile']].filter(([pin]) => pin)
    .map(([pin, kind]) => ({ dependency_role: 'source_authoring',
      entity_ref: { entity_kind: kind, entity_id: pin.id },
      version_pin: { pin_kind: 'authoring_version', authoring_version: String(pin.version) } }));
  let dependency_pins = { pins: first, canonical_digest: digest(first).slice(7) };
  return {
    pins: () => dependency_pins,
    append(kind, rows) {
      const combined = [...dependency_pins.pins, ...rows.map((row) => ({ dependency_role: 'source_authoring',
        entity_ref: { entity_kind: kind, entity_id: row.id },
        version_pin: { pin_kind: 'authoring_version', authoring_version: String(row.version) } }))];
      const unique = [...new Map(combined.map((pin) => [canonicalDigest(pin), pin])).values()];
      dependency_pins = { pins: unique, canonical_digest: digest(unique).slice(7) };
    },
    reject: (reason, code = 'authoring_dependency_pin_missing') => ({ ok: false,
      error: createSpatialV3TypedError(code, { subject_ref: { entity_kind: 'world_revision',
        entity_id: g4?.world_revision_id ?? 'unknown' }, dependency_pins, diagnostics: { reason } }) })
  };
}

/** The committed canonical site of `canonical_g5` and its arrival endpoint, or the rows that prepare
 * them from the exact scene binding and acoustic closure (first arrival). Shared by the terminal of
 * an expansion and by an intra-G4 connection. */
async function prepareCanonicalTarget({ worldBaseReader, snapshot, party_id, g4, canonical_g5,
  change_set_id, materializer_version, book, authoring_refs }) {
  const { id: g5Id, version: g5Version } = canonical_g5;
  let target = snapshot.sites.find((row) => row.origin === 'canonical' && row.status === 'active'
    && row.canonical_g5_ref?.entity_id === g5Id && String(row.canonical_g5_ref.authoring_version) === String(g5Version));
  let baseline = snapshot.scene_baselines.find((row) => row.host_id === target?.id && row.status === 'active');
  const terminal_writes = [];
  if (!baseline) {
    const canonicalRead = await worldBaseReader.readPinnedCanonicalG5SceneBinding({
      id: g5Id, version: g5Version, world_revision_id: g4.world_revision_id });
    if (!canonicalRead.ok) return canonicalRead;
    const canonical = canonicalRead.value;
    if (canonical.parent_id !== g4.id || canonical.parent_version !== g4.version
      || canonical.id !== g5Id || canonical.version !== g5Version) {
      return book.reject('canonical_terminal_parent_pin_mismatch', 'terminal_target_gap');
    }
    const sceneRead = await worldBaseReader.readPinnedSceneTemplateClosure({
      id: canonical.scene_template_id, version: canonical.scene_template_version,
      world_revision_id: g4.world_revision_id });
    if (!sceneRead.ok) return sceneRead;
    const acoustic = await worldBaseReader.readPinnedCanonicalG5AcousticClosure({
      canonical_g5: canonical, scene_template: sceneRead.value.header,
      world_revision_id: g4.world_revision_id });
    if (!acoustic.ok) return acoustic;
    book.append('canonical_spatial_node', [canonical]);
    book.append('scene_materialization_profile', [{ id: canonical.materialization_profile_id,
      version: canonical.materialization_profile_version }]);
    book.append('scene_template', [sceneRead.value.header]);
    book.append('g6_acoustic_baseline', acoustic.value.rows);
    authoring_refs.push(...acoustic.value.rows.map((row) => ({ entity_kind: 'g6_acoustic_baseline',
      id: row.id, version: row.version, canonical_digest: row.canonical_digest })));
    const canonicalId = `canonical:${canonicalDigest({ party_id, id: canonical.id, version: canonical.version })}`;
    const siteId = target?.id ?? `${canonicalId}:site`;
    const materialized = materializeSpatialV3GeneratedScene({ party_id, site_id: siteId,
      baseline_id: `${canonicalId}:baseline`, change_set_id, materializer_version,
      materialization_trace_id: `trace:${change_set_id}`, canonical_g5: canonical,
      scene_closure: sceneRead.value, acoustic_rows: acoustic.value.rows, dependency_pins: book.pins() });
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
  if (arrivals.length !== 1 || positions.length !== 1) return book.reject('canonical_terminal_endpoint_required', 'terminal_target_gap');
  return { ok: true, terminal_writes, terminal_target: { canonical_g5_id: g5Id, canonical_g5_version: g5Version,
    site_id: target.id, position_id: positions[0].id, slot_key: arrival.slot_key } };
}

/** Server-only composition: exact reads and proposals share the existing P16 lock/transaction. */
export function createSpatialV3GeneratedExpansionAdapter({ worldBaseReader, committer,
  writePlanBuilder, admitGeneration, projectVisible,
  prepareFirstEntry, now = () => Date.now() } = {}) {
  /** Everything after the rows of one topology are proposed: first entry of a created place, trace,
   * visible package, sealed write plan. Frontier resolution and canonical connections both end here. */
  async function planProposal({ transaction, request, closure, snapshot, selection, proposal,
    admitted, book, authoring_refs, change_set_id, idempotency_key, canonical_input_digest,
    materializer_version, occurrence, current }) {
    const { party_id, g4 } = request;
    const reject = book.reject;
    const dependency_pins = book.pins();
    const needsFirstEntry = proposal.inserts.some((row) => row.target_table === 'party_g5_sites');
    if (needsFirstEntry && typeof prepareFirstEntry !== 'function') return reject('first_entry_owner_required');
    const firstEntry = needsFirstEntry
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
      record: { party_id, run_id, g4_id: g4.id, run_kind: 'expansion', occurrence,
        seed_digest: selection.seed_digest, input_digest: trace.canonical_input_digest,
        catalog_digest: trace.catalog_digest, materializer_version, rng_version: 'mulberry32_v1',
        result_digest: trace.canonical_output_digest, idempotency_key, status: 'committed',
        validation_report: admitted.validation_report, trace,
        created_refs: [...proposal.inserts, ...firstEntryWrites].map((row) => ({ table: row.target_table, id: row.id })) } },
    ...selection.choices.map((choice) => ({ target_table: 'party_materialization_choices',
      id: `${run_id}:${choice.choice_ordinal}`, record: { party_id, run_id, ...choice } }))];
    const factualWrites = [...proposal.inserts, ...proposal.updates, ...firstEntryWrites];
    const expected_state_versions = [...proposal.expected_state_versions,
      ...(firstEntry.expected_state_versions ?? [])];
    const envelopeInput = { party_id, turn_id: change_set_id,
      committed_state_version: String(current.state_version),
      change_set_id, package_id: `visible:${change_set_id}`,
      idempotency_record_id: `idem:${change_set_id}`, dependency_pins,
      projection_policy_ref: projectionPolicyRef };
    const visible = await projectVisible({ transaction, request, closure, snapshot, proposal, firstEntry,
      factual_writes: factualWrites, expected_state_versions, dependency_pins,
      current_state_version: envelopeInput.committed_state_version,
      current_turn_id: current.last_turn_id, envelopeInput,
      projection_policy_ref: projectionPolicyRef,
      package_id: envelopeInput.package_id, idempotency_key, change_set_id,
      idempotency_record_id: envelopeInput.idempotency_record_id });
    if (!visible?.ok) return visible?.error ? visible : reject('visible_projection_required');
    if (!visible.envelope?.projection_policy_ref
      || canonicalDigest(visible.envelope?.projection_policy_ref) !== canonicalDigest(projectionPolicyRef)) {
      return reject('approved_projection_policy_ref_required', 'visible_package_persistence_gap');
    }
    if (Object.entries(envelopeInput).some(([key, value]) => key === 'dependency_pins'
      ? !visible.envelope.dependency_pins
        || canonicalDigest(visible.envelope.dependency_pins) !== canonicalDigest(value)
      : visible.envelope[key] !== value)
      || visible.envelope.presentation_status !== 'pending'
      || !visible.envelope.visible_payload || typeof visible.envelope.visible_payload !== 'object'
      || visible.envelope.package_digest !== digest(visible.envelope.visible_payload)
      || validateSpatialV3Contract('visible_package_persistence_envelope', visible.envelope).length) {
      return reject('visible_envelope_identity_or_digest_mismatch', 'visible_package_persistence_gap');
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
      expected_state_versions, validation_report: admitted.validation_report,
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
  }

  /** The party clock and turn a P16 topology commit is based on. */
  async function readCurrentParty(transaction, party_id) {
    const current = await transaction.query(`SELECT party.state_version, session.last_turn_id
      FROM party_runtime.parties party
      JOIN party_runtime.party_state_snapshots state
        ON state.party_id=party.party_id AND state.state_version=party.state_version
      LEFT JOIN party_runtime.party_server_sessions session ON session.party_id=party.party_id
      WHERE party.party_id=$1`, [party_id]);
    return current.rows.length === 1 && /^[1-9][0-9]*$/u.test(String(current.rows[0].state_version))
      ? current.rows[0] : null;
  }

  /** The exact departure endpoint of the committed source position, from its scene template. */
  async function readSourceDeparture({ snapshot, source_site_id, source_position_id, world_revision_id }) {
    const sourceSite = snapshot.sites.find((row) => row.id === source_site_id);
    const sourceBaseline = snapshot.scene_baselines.find((row) => row.host_kind === 'g5_site'
      && row.host_id === source_site_id && row.status === 'active');
    if (!sourceSite || !sourceBaseline) return { failure: 'committed_source_baseline_required' };
    const sourceRead = await worldBaseReader.readPinnedSceneTemplateClosure({
      id: sourceBaseline.scene_template_ref?.entity_id,
      version: Number(sourceBaseline.scene_template_ref?.authoring_version), world_revision_id });
    if (!sourceRead.ok) return { read: sourceRead };
    const sourcePosition = snapshot.scene_positions.find((row) => row.id === source_position_id);
    const departure = sourceRead.value.endpoint_slots.filter((row) => ['departure', 'both'].includes(row.endpoint_role)
      && row.required_position_slot_key === sourcePosition?.template_slot_key
      && row.required_position_instance_ordinal === sourcePosition?.template_instance_ordinal);
    return departure.length === 1 ? { departure: departure[0] } : { failure: 'source_departure_endpoint_required' };
  }

  async function prepareExpansion(request) {
    const { party_id, g4, profile, slot_ref, directional_exit, candidate_ordinal,
      source_site_id, source_position_id, entry_binding, materializer_version } = request ?? {};
    const book = createPinBook(g4, profile);
    const reject = book.reject;
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
    book.append('expansion_rule_set', closure.expansion_rule_sets);
    const authoring_refs = closure.expansion_rule_sets.map((row) => ({ entity_kind: 'expansion_rule_set',
      id: row.id, version: row.version, canonical_digest: row.canonical_digest }));
    book.append('expansion_slot', closure.slots.filter((row) => exact(row, slot_ref)));
    book.append('g4_directional_exit', closure.directional_exits.filter((row) => exact(row, directional_exit)));
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
        const current = await readCurrentParty(transaction, party_id);
        if (!current) return reject('committed_party_state_required', 'visible_package_persistence_gap');
        const chain = snapshot.chains.find((row) => row.id === `expansion:${suffix}:chain`);
        const timestamp = now();
        let selection;
        try { selection = selectSpatialV3Expansion({ closure, snapshot, now: timestamp,
          party_id, slot_ref, directional_exit, entry_binding, candidate_ordinal,
          ...(candidate_ordinal === 0 ? {} : { terminal_ordinal: chain?.terminal_ordinal }) });
        } catch (cause) { return reject(cause.code ?? cause.message, 'spatial_candidate_gap'); }
        if (!selection.ok) return reject(selection.code, selection.code);
        if (selection.idempotency_key !== idempotency_key) return reject('selection_identity_changed');
        book.append('continuation_length_rule', closure.continuation_length_rules.filter((row) =>
          row.id === selection.slot.continuation_length_rule_id && row.version === selection.slot.continuation_length_rule_version));
        book.append('expansion_terminal_policy', closure.terminal_policies.filter((row) =>
          row.id === selection.slot.terminal_policy_id && row.version === selection.slot.terminal_policy_version));
        const source = await readSourceDeparture({ snapshot, source_site_id, source_position_id,
          world_revision_id: g4.world_revision_id });
        if (source.failure) return reject(source.failure);
        if (source.read) return source.read;
        const departure = [source.departure];
        const selected = selection.selected_template;
        const sceneCandidates = selected ? closure.scene_materialization_candidates.filter((row) =>
          row.profile_id === selected.scene_materialization_profile_id
          && row.profile_version === selected.scene_materialization_profile_version) : [];
        // The real owner evaluates candidate applicability, natural baseline and all required authoring bindings.
        const admitted = await admitGeneration({ transaction, request, closure, snapshot,
          selection, scene_candidates: sceneCandidates, dependency_pins: book.pins() });
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
          book.append('g5_generation_template', [{ id: selected.template_id, version: selected.template_version }]);
          book.append('scene_materialization_profile', [{ id: selected.scene_materialization_profile_id,
            version: selected.scene_materialization_profile_version }]);
          book.append('scene_template', [sceneRead.value.header]);
          book.append('g6_acoustic_baseline', acoustic.value.rows);
          authoring_refs.push(...acoustic.value.rows.map((row) => ({ entity_kind: 'g6_acoustic_baseline',
            id: row.id, version: row.version, canonical_digest: row.canonical_digest })));
          const prepared = materializeSpatialV3GeneratedScene({ party_id,
            site_id: `expansion:${suffix}:site:${candidate_ordinal}`,
            baseline_id: `expansion:${suffix}:baseline:${candidate_ordinal}`,
            change_set_id, materializer_version, materialization_trace_id: `trace:${change_set_id}`,
            generation_template: { id: selected.template_id, version: selected.template_version },
            scene_closure: sceneRead.value, acoustic_rows: acoustic.value.rows, dependency_pins: book.pins() });
          if (!prepared.ok) return prepared;
          scene = prepared.proposal;
        } else {
          const exit = closure.directional_exits.find((row) => exact(row, directional_exit));
          const target = await prepareCanonicalTarget({ worldBaseReader, snapshot, party_id, g4,
            canonical_g5: { id: exit.exit_canonical_g5_id, version: exit.exit_canonical_g5_version },
            change_set_id, materializer_version, book, authoring_refs });
          if (!target.ok) return target;
          ({ terminal_target, terminal_writes } = target);
        }
        const prepared = materializeSpatialV3Expansion({ party_id, change_set_id, closure, snapshot,
          selection, scene, candidate_ordinal, dependency_pins: book.pins(), now: timestamp, terminal_target, terminal_writes,
          materialization_trace_id: `trace:${change_set_id}`,
          source: { site_id: source_site_id, position_id: source_position_id, entry_binding,
            departure_endpoint_slot_key: departure[0].slot_key,
            departure_position_slot_key: departure[0].required_position_slot_key } });
        if (!prepared.ok) return prepared;
        return planProposal({ transaction, request, closure, snapshot, selection,
          proposal: prepared.proposal, admitted, book, authoring_refs, change_set_id, idempotency_key,
          canonical_input_digest, materializer_version, occurrence: candidate_ordinal, current });
      } });
    return outcome.ok ? Object.freeze({ ...outcome, topology_status: 'committed',
      connection_id: `expansion:${suffix}:connection:${candidate_ordinal}`,
      source_position_id, directional_exit: Object.freeze({ ...directional_exit }),
      moves_traveller: false, advances_time: false }) : outcome;
  }
  /** Intra-G4 connection between two canonical places, by an approved connection binding. The same
   * P16 topology commit as a frontier resolution (`resolve_frontier`), under its own idempotency key
   * space `resolve_frontier:canconn:<party>:<binding>`; no frontier, chain or ledger row is involved. */
  async function prepareCanonicalConnection(request) {
    const { party_id, g4, profile, binding_id, source_site_id, source_position_id,
      materializer_version } = request ?? {};
    const book = createPinBook(g4, profile);
    const reject = book.reject;
    const filled = (value) => typeof value === 'string' && value.trim();
    if (![party_id, binding_id, source_site_id, source_position_id, materializer_version].every(filled)
      || !g4 || !profile) return reject('exact_connection_request_required');
    if (typeof committer?.prepareExpansion !== 'function'
      || typeof admitGeneration !== 'function' || typeof projectVisible !== 'function') {
      return reject('generation_admission_projection_and_p16_owners_required');
    }
    const read = await worldBaseReader.readPinnedG4ExpansionClosure({ g4, profile });
    if (!read.ok) return read;
    const closure = read.value;
    const authoring_refs = [];
    const connection_id = `canconn:${party_id}:${binding_id}`;
    const identity = { party_id, world_revision_id: g4.world_revision_id, g4_id: g4.id, binding_id };
    const idempotency_key = `resolve_frontier:canconn:${party_id}:${binding_id}`;
    const canonical_input_digest = digest({ ...identity, g4, profile, source_site_id,
      source_position_id, materializer_version });
    const change_set_id = `${connection_id}:change`;
    const outcome = await committer.prepareExpansion({ party_id, g4_id: g4.id, idempotency_key,
      canonical_input_digest, prepare: async ({ transaction }) => {
        const loaded = await createSpatialV3Repository({ transaction }).loadExpansionState({ party_id, g4_id: g4.id });
        if (!loaded.ok) return loaded;
        const snapshot = loaded.snapshot;
        const current = await readCurrentParty(transaction, party_id);
        if (!current) return reject('committed_party_state_required', 'visible_package_persistence_gap');
        const sourceSite = snapshot.sites.find((row) => row.id === source_site_id);
        if (sourceSite?.origin !== 'canonical') return reject('committed_source_baseline_required');
        const connections = await worldBaseReader.readApprovedCanonicalG5Connections({ g4,
          canonical_g5: { id: sourceSite.canonical_g5_ref.entity_id,
            version: Number(sourceSite.canonical_g5_ref.authoring_version) } });
        if (!connections.ok) return connections;
        const approved = connections.value.find((row) => row.binding.id === binding_id);
        if (!approved) return reject(connections.gaps?.find((gap) => gap.binding_id === binding_id)?.reason
          ?? 'approved_canonical_connection_required');
        const { binding, profile: connectionProfile, line_binding } = approved;
        // The pin vocabulary has no connection kinds: the source place is pinned, the binding and its
        // profile are traced (their catalog is the one pinned world revision).
        book.append('canonical_spatial_node', [{ id: binding.from_canonical_g5_id, version: binding.from_canonical_g5_version }]);
        authoring_refs.push({ entity_kind: 'canonical_g5_connection_binding', id: binding.id, version: binding.version },
          { entity_kind: 'canonical_g5_connection_profile', id: connectionProfile.id, version: connectionProfile.version });
        const source = await readSourceDeparture({ snapshot, source_site_id, source_position_id,
          world_revision_id: g4.world_revision_id });
        if (source.failure) return reject(source.failure);
        if (source.read) return source.read;
        const selection = { status: 'canonical_connection', choices: [],
          target_canonical_g5: { id: binding.to_canonical_g5_id, version: binding.to_canonical_g5_version },
          seed_context: { kind: 'canonical_connection', binding: ref(binding.id, binding.version) },
          seed_digest: digest(identity) };
        const admitted = await admitGeneration({ transaction, request, closure, snapshot,
          selection, scene_candidates: [], dependency_pins: book.pins() });
        if (!admitted?.ok) return admitted?.error ? admitted : reject('generation_admission_required');
        if (!admitted.validation_report || !Array.isArray(admitted.commit_rechecks)
          || typeof admitted.recheck !== 'function') return reject('generation_commit_rechecks_required');
        const target = await prepareCanonicalTarget({ worldBaseReader, snapshot, party_id, g4,
          canonical_g5: selection.target_canonical_g5, change_set_id, materializer_version, book, authoring_refs });
        if (!target.ok) return target;
        const prepared = materializeSpatialV3CanonicalConnection({ party_id, change_set_id, snapshot,
          binding, profile: connectionProfile, line_binding, terminal_target: target.terminal_target,
          terminal_writes: target.terminal_writes, dependency_pins: book.pins(),
          materialization_trace_id: `trace:${change_set_id}`,
          source: { site_id: source_site_id, position_id: source_position_id,
            departure_endpoint_slot_key: source.departure.slot_key,
            departure_position_slot_key: source.departure.required_position_slot_key } });
        if (!prepared.ok) return prepared;
        return planProposal({ transaction, request, closure, snapshot, selection,
          proposal: prepared.proposal, admitted, book, authoring_refs, change_set_id, idempotency_key,
          canonical_input_digest, materializer_version, occurrence: 0, current });
      } });
    return outcome.ok ? Object.freeze({ ...outcome, topology_status: 'committed', connection_id,
      source_position_id, moves_traveller: false, advances_time: false }) : outcome;
  }
  return Object.freeze({ prepareExpansion, prepareCanonicalConnection });
}
