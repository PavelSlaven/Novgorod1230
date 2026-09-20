import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateApprovalAttestations,
  validateRevision
} from './generator.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const source = JSON.parse(await readFile(resolve(here, 'source-authoring.json'), 'utf8'));
const candidate = JSON.parse(await readFile(resolve(here, 'candidate.json'), 'utf8'));
const approvalRequest = JSON.parse(await readFile(resolve(here, 'approval-request.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(here, 'manifest.json'), 'utf8'));
const existingPromotionsAttestation = JSON.parse(await readFile(resolve(here,
  'existing-promotions-approval-attestation.json'), 'utf8'));
const dryingDesignAttestation = JSON.parse(await readFile(resolve(here,
  'drying-design-approval-attestation.json'), 'utf8'));

validateRevision({ source, candidate, approvalRequest });
validateApprovalAttestations({ candidate, approvalRequest, manifest,
  existingPromotionsAttestation, dryingDesignAttestation });
process.stdout.write(`${JSON.stringify({ pass: true,
  candidate_digest: candidate.candidate_digest,
  approval_request_digest: approvalRequest.request_digest,
  existing_promotions_attestation_digest:
    existingPromotionsAttestation.attestation_digest,
  drying_design_attestation_digest:
    dryingDesignAttestation.attestation_digest }, null, 2)}\n`);
