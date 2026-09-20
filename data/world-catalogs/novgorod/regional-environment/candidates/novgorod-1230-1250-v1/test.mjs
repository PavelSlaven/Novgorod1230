import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateRegionalEnvironmentRevision,
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
