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

assert.equal(validateRevision({ source, candidate: pack.candidate,
  approvalRequest: pack.approvalRequest }), true);

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
