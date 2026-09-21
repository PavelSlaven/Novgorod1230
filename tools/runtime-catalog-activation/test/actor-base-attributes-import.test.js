import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { computeImportAuditDigest } from '@rus/runtime-catalog';
import { loadActorBaseAttributesImportApproval } from
  '../../../data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/runtime-import-v1/validate-import-approval.mjs';
import { buildActorBaseAttributesImportLedger,
  validateActorBaseAttributesImportResult } from
  '../src/actor-base-attributes-import.js';

test('actor base-attribute ledger binds exact import-only approval',
  async () => {
    const approval = await loadActorBaseAttributesImportApproval();
    const ledger = buildActorBaseAttributesImportLedger(approval);
    assert.equal(ledger.root.approval_request_digest,
      approval.request.request_digest);
    assert.equal(ledger.root.approval_attestation_digest,
      approval.attestation.attestation_digest);
    assert.equal(ledger.root.import_audit_digest,
      computeImportAuditDigest(ledger.root));
    assert.equal(ledger.records.length, 1);
    assert.equal(ledger.records[0].operation_kind, 'insert');
    assert.equal(ledger.dependency_assertions.length, 0);
  });

test('actor base-attribute ledger rejects mutated approval', async () => {
  const approval = await loadActorBaseAttributesImportApproval();
  await assert.rejects(async () => buildActorBaseAttributesImportLedger({
    request: approval.request,
    attestation: { ...approval.attestation,
      authority: { ...approval.attestation.authority,
        activation_authorized: true } }
  }), /ACTOR_BASE_ATTRIBUTES_IMPORT_APPROVAL_INVALID/u);
});

test('tracked actor base-attribute readback binds exact approved import',
  async () => {
    const approval = await loadActorBaseAttributesImportApproval();
    const result = JSON.parse(await readFile(
      'data/world-catalogs/novgorod/procedural-scene-v2/'
        + 'actor-base-attributes-v1/runtime-import-v1/'
        + 'import-readback-result.json', 'utf8'));
    assert.equal(validateActorBaseAttributesImportResult({ result,
      ...approval }), true);
    assert.throws(() => validateActorBaseAttributesImportResult({
      result: { ...result, activation_authorized: true }, ...approval
    }), { code: 'ACTOR_BASE_ATTRIBUTES_IMPORT_RESULT_INVALID' });
  });
