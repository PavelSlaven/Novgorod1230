import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { checkV17BootstrapInputs } from '../../scripts/bootstrap-live-world-v17.mjs';

test('checkV17BootstrapInputs fails closed without fresh-schema attestation for current request', async () => {
  const missingGate1Path = join(tmpdir(),
    `novgorod-missing-gate1-attestation-v2-${process.pid}.json`);
  await assert.rejects(
    () => checkV17BootstrapInputs({ attestationV2Path: missingGate1Path }),
    /V17_FRESH_SCHEMA_ATTESTATION_REQUIRED/u,
    'committed v2 attestation must not authorize the rebuilt request digest'
  );
});
