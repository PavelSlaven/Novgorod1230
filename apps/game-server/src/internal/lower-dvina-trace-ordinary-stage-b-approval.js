import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { LOWER_DVINA_TRACE_ORDINARY_PROFILE_DIGEST } from
  './lower-dvina-trace-ordinary-materialization-profile.js';
import { validateLowerDvinaTraceOrdinaryStageBEval } from
  './lower-dvina-trace-ordinary-stage-b-eval.js';

const PROFILE_PATH = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/'
  + 'phase-m7-content/ordinary-materialization-profile.json';
const RECEIPT_PATH = 'data/model-evals/lower-dvina-trace/'
  + 'ordinary-stage-b-approval-v1.json';
const RECEIPT_DIGEST =
  'ca08b4749197253e93484de93c1bf582b5b1b56db5e7299a5b154b4377e7834d';

export async function loadLowerDvinaTraceOrdinaryStageBApproval({
  rootDir = process.cwd()
} = {}) {
  const [profileRaw, receiptRaw] = await Promise.all([
    readFile(resolve(rootDir, PROFILE_PATH)),
    readFile(resolve(rootDir, RECEIPT_PATH))
  ]);
  const profile = JSON.parse(profileRaw);
  const receipt = JSON.parse(receiptRaw);
  if (sha(profileRaw) !== LOWER_DVINA_TRACE_ORDINARY_PROFILE_DIGEST
      || sha(receiptRaw) !== RECEIPT_DIGEST
      || !valid(receipt, profile)) {
    throw Object.assign(new Error('TRACE_ORDINARY_STAGE_B_APPROVAL_INVALID'), {
      code: 'TRACE_ORDINARY_STAGE_B_APPROVAL_INVALID'
    });
  }
  return freeze(receipt);
}

export function validateLowerDvinaTraceOrdinaryStageBApproval(receipt,
  evalContract) {
  return valid(receipt, { stage_b_classification_eval: evalContract });
}

function valid(receipt, profile) {
  const contract = profile?.stage_b_classification_eval;
  const identity = receipt?.model_identity;
  const caseIds = contract?.cases?.map(({ id }) => id).sort();
  return validateLowerDvinaTraceOrdinaryStageBEval(contract)
    && exact(receipt, ['schema','version','profile_digest',
      'eval_contract_digest','model_identity','approved_case_ids',
      'result_digest'])
    && receipt.schema
      === 'rus.ordinary_materialization_stage_b_approval_receipt.v1'
    && receipt.version === 1
    && receipt.profile_digest === LOWER_DVINA_TRACE_ORDINARY_PROFILE_DIGEST
    && receipt.eval_contract_digest === canonicalDigest(contract)
    && exact(identity, ['provider','model','scope','role_id','config_hash'])
    && identity.scope === 'turn_runtime'
    && identity.role_id === 'ordinary_materialization'
    && [identity.model, identity.config_hash, receipt.result_digest]
      .every(text)
    && Array.isArray(receipt.approved_case_ids)
    && canonicalDigest(receipt.approved_case_ids)
      === canonicalDigest(caseIds);
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function text(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}
function sha(value) {
  return createHash('sha256').update(value).digest('hex');
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
