import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyDryingEnablement,
  generateRegionalEnvironmentRevision,
  validateApprovalAttestations,
  validateRevision
} from './generator.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../../..');
const pack = await generateRegionalEnvironmentRevision(root);
const source = JSON.parse(await readFile(resolve(here, 'source-authoring.json'),
  'utf8'));
const auditApproveWithLimitsIds = [
  'lt_scrub_meadow', 'lt_rocky_lake_shore', 'lt_steep_hills',
  'lt_dry_ravine_gully', 'wb_rapid_section', 'wb_seasonal_pool',
  'wb_floodwater', 'wb_brine_spring', 'wb_moat_water',
  'lu_orchard_fruit_grove', 'lu_reed_sedge_harvest',
  'lu_charcoal_burning', 'lu_resin_tar_pitch_production',
  'lu_fish_weir_trap_operation', 'lu_saltmaking_saltern',
  'lu_clay_extraction', 'lu_bog_iron_extraction',
  'pt_rural_church_center', 'pt_monastic_grange', 'pt_river_landing',
  'pt_boat_landing', 'pt_periodic_fairground', 'pt_ford_place',
  'pt_ferry_place', 'pt_bridge_place', 'pt_portage_place',
  'pt_hermitage_skete', 'pt_pilgrimage_shrine',
  'pt_watchpost_guard_post', 'pt_toll_customs_post', 'pt_saltworks',
  'pt_clay_pit_pottery_site', 'pt_iron_smelting_site'
];

assert.equal(validateRevision({ source, candidate: pack.candidate,
  approvalRequest: pack.approvalRequest }), true);
assert.equal(validateApprovalAttestations({ candidate: pack.candidate,
  approvalRequest: pack.approvalRequest, manifest: pack.manifest,
  existingPromotionsAttestation: pack.existingPromotionsAttestation,
  dryingDesignAttestation: pack.dryingDesignAttestation }), true);
assert.equal(pack.existingPromotionsAttestation.subject_commit_sha,
  '20275b3a39372d1dc5c4fa95d21660dbb44420b3');
assert.deepEqual(pack.existingPromotionsAttestation.approved_counts,
  { landscape: 33, water: 21, land_use: 24, place: 37 });
assert.equal(pack.existingPromotionsAttestation.conditional_guard_count, 33);
assert.deepEqual(pack.existingPromotionsAttestation.sparse_gap_retained,
  pack.candidate.data_gaps[0]);
assert.deepEqual(pack.existingPromotionsAttestation.explicit_exclusions_retained,
  pack.candidate.explicit_exclusions);
assert.equal(pack.dryingDesignAttestation.pending_bundle_digest,
  '7b9e1bd9116e70cd654c4864e92beb82e6a4b9e926b4dbed8eaf221c78c32b6a');
assert.equal(pack.dryingDesignAttestation.universal_row_digest,
  '8f0bc0dde9529a3d80b6f0f76f1376ac45d1a959dbae72593330f395c8637714');
assert.equal(pack.dryingDesignAttestation.regional_row_digest,
  'd08329ea1ac95f6b855fa314873fb901132c9037dac1d1fe121d611b6c016cdb');
assert.equal(pack.dryingDesignAttestation.evidence_attestation_digest,
  '965995aae64b72a6329ac97e33b09700733e69c609a247d2d76716d5d68333c3');
assert.equal(pack.dryingEnablementAttestation.attestation_digest,
  '2ead91157c3efc214c7431bd47cb79acfd1e334f814d74dc9c45ea96a7ecd550');
const dryingProjection = applyDryingEnablement({ candidate: pack.candidate,
  dryingEnablementAttestation: pack.dryingEnablementAttestation });
const expectedUniversal = structuredClone(pack.candidate.pending_rows.universal_row);
expectedUniversal.status = 'approved';
const expectedRegional = structuredClone(pack.candidate.pending_rows.regional_row);
expectedRegional.status = 'approved';
expectedRegional.is_allowed = true;
assert.deepEqual(dryingProjection.universal_row, expectedUniversal);
assert.deepEqual(dryingProjection.regional_row, expectedRegional);
assert.equal(dryingProjection.universal_row.status, 'approved');
assert.equal(dryingProjection.regional_row.status, 'approved');
assert.equal(dryingProjection.regional_row.is_allowed, true);
assert.equal(dryingProjection.regional_row.generation_weight, 0);
assert.equal(dryingProjection.generic_regional_generation_authorized, false);
assert.equal(pack.candidate.pending_rows.universal_row.status, 'needs_review');
assert.equal(pack.candidate.pending_rows.regional_row.status, 'needs_review');
assert.equal(pack.candidate.pending_rows.regional_row.is_allowed, false);

const genericDrying = structuredClone(pack.dryingEnablementAttestation);
genericDrying.generic_regional_generation_authorized = true;
delete genericDrying.attestation_digest;
genericDrying.attestation_digest = digestPayload(genericDrying);
assert.throws(() => applyDryingEnablement({ candidate: pack.candidate,
  dryingEnablementAttestation: genericDrying }),
  /DRYING_ENABLEMENT_ATTESTATION_DIGEST_MISMATCH/);

const wrongSpatialGuard = structuredClone(pack.dryingEnablementAttestation);
wrongSpatialGuard.applicability_guard.g5_id = 'wrong_g5';
delete wrongSpatialGuard.attestation_digest;
wrongSpatialGuard.attestation_digest = digestPayload(wrongSpatialGuard);
assert.throws(() => applyDryingEnablement({ candidate: pack.candidate,
  dryingEnablementAttestation: wrongSpatialGuard }),
  /DRYING_ENABLEMENT_ATTESTATION_DIGEST_MISMATCH/);

const enabledDrying = structuredClone(pack.dryingDesignAttestation);
enabledDrying.regional_enablement_approved = true;
delete enabledDrying.attestation_digest;
enabledDrying.attestation_digest = digestPayload(enabledDrying);
assert.throws(() => validateApprovalAttestations({ candidate: pack.candidate,
  approvalRequest: pack.approvalRequest, manifest: pack.manifest,
  existingPromotionsAttestation: pack.existingPromotionsAttestation,
  dryingDesignAttestation: enabledDrying }), /DRYING_DESIGN_ATTESTATION_INVALID/);
assert.deepEqual(source.approve_with_limits_ids, auditApproveWithLimitsIds);
const limitedRows = Object.values(pack.candidate.promotions).flat()
  .filter(({ audit_verdict: verdict }) => verdict === 'APPROVE_WITH_LIMITS');
assert.deepEqual(limitedRows.map(({ universal }) => universal.id),
  auditApproveWithLimitsIds);
for (const row of limitedRows) {
  assert.deepEqual(row.context_guard.required_ref_fields,
    source.conditional_guards[row.universal.id]);
  assert.equal(row.context_guard.enforcement,
    'reject_if_any_required_ref_missing');
  assert.match(row.regional.regional_limits, /requires_context_refs=/);
}
const steepHills = limitedRows.find(({ universal }) =>
  universal.id === 'lt_steep_hills');
assert.deepEqual(steepHills.required_context_refs,
  ['local_topology_ref', 'local_geology_ref']);
assert.equal(steepHills.regional.is_common, true);
assert.equal(steepHills.regional.generation_weight, 10);
const dryRavine = limitedRows.find(({ universal }) =>
  universal.id === 'lt_dry_ravine_gully');
assert.deepEqual(dryRavine.required_context_refs,
  ['local_topology_ref', 'local_geology_or_erosion_context_ref']);
assert.equal(dryRavine.regional.is_common, true);
assert.equal(dryRavine.regional.generation_weight, 10);

const missingLimitedGuard = structuredClone(pack.candidate);
missingLimitedGuard.promotions.landscape.find(({ universal }) =>
  universal.id === 'lt_steep_hills').required_context_refs = [];
delete missingLimitedGuard.candidate_digest;
missingLimitedGuard.candidate_digest = digestPayload(missingLimitedGuard);
const missingGuardRequest = reboundRequest(pack.approvalRequest,
  missingLimitedGuard.candidate_digest);
assert.throws(() => validateRevision({ source, candidate: missingLimitedGuard,
  approvalRequest: missingGuardRequest }), /CONDITIONAL_GUARD_MISMATCH/);

const weightTamper = structuredClone(pack.candidate);
weightTamper.promotions.landscape[0].regional.generation_weight += 1;
delete weightTamper.candidate_digest;
weightTamper.candidate_digest = digestPayload(weightTamper);
const weightRequest = reboundRequest(pack.approvalRequest,
  weightTamper.candidate_digest);
assert.throws(() => validateRevision({ source, candidate: weightTamper,
  approvalRequest: weightRequest }), /REGIONAL_SOURCE_DRIFT/);

const bulkApprove = structuredClone(pack.candidate);
const extra = structuredClone(bulkApprove.promotions.land_use[0]);
extra.universal.id = 'lu_open_field_strip_cultivation';
extra.regional.land_use_template_id = 'lu_open_field_strip_cultivation';
bulkApprove.promotions.land_use.push(extra);
delete bulkApprove.candidate_digest;
bulkApprove.candidate_digest = digestPayload(bulkApprove);
const bulkRequest = reboundRequest(pack.approvalRequest,
  bulkApprove.candidate_digest);
assert.throws(() => validateRevision({ source, candidate: bulkApprove,
  approvalRequest: bulkRequest }), /PROMOTION_COUNT_MISMATCH|REGIONAL_SELECTOR_SET_INVALID/);

const substitutedLandscape = structuredClone(pack.candidate);
const substituted = substitutedLandscape.promotions.landscape[0];
substituted.universal.id = 'lt_wet_ravine_gully';
substituted.regional.landscape_template_id = 'lt_wet_ravine_gully';
delete substitutedLandscape.candidate_digest;
substitutedLandscape.candidate_digest = digestPayload(substitutedLandscape);
const substitutedRequest = reboundRequest(pack.approvalRequest,
  substitutedLandscape.candidate_digest);
assert.throws(() => validateRevision({ source, candidate: substitutedLandscape,
  approvalRequest: substitutedRequest }), /REGIONAL_SELECTOR_SET_INVALID/);

const placeTamper = structuredClone(pack.candidate);
placeTamper.pending_rows.universal_row.fire = true;
delete placeTamper.candidate_digest;
placeTamper.candidate_digest = digestPayload(placeTamper);
const placeRequest = reboundRequest(pack.approvalRequest,
  placeTamper.candidate_digest);
assert.throws(() => validateRevision({ source, candidate: placeTamper,
  approvalRequest: placeRequest }), /NEW_PLACE_FORBIDDEN_STATE/);

process.stdout.write('regional environment authoring tests: PASS\n');

function reboundRequest(request, candidateDigest) {
  const changed = structuredClone(request);
  changed.candidate_digest = candidateDigest;
  delete changed.request_digest;
  changed.request_digest = digestPayload(changed);
  return changed;
}

function digestPayload(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
