import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const FINALIZATION_PLAN_SCHEMA = 'rus.finalization_plan.v1';
export const FINALIZATION_REPORT_SCHEMA = 'rus.finalization_report.v1';

export async function loadFinalizationPlan(rootDir = '.') {
  const root = resolve(rootDir);
  const plan = JSON.parse(await readFile(join(root, 'data/finalization/plan.json'), 'utf8'));
  return validateFinalizationPlan(plan);
}

export function validateFinalizationPlan(plan) {
  if (!plan || typeof plan !== 'object') throw new TypeError('finalization plan must be an object');
  if (plan.schema_version !== FINALIZATION_PLAN_SCHEMA) throw new TypeError('invalid finalization plan schema');
  if (!Array.isArray(plan.automated_evidence) || plan.automated_evidence.length < 6) throw new TypeError('automated_evidence must contain at least six entries');
  if (!Array.isArray(plan.manual_gates) || plan.manual_gates.length !== 4) throw new TypeError('manual_gates must contain exactly four operator gates');
  const ids = [...plan.automated_evidence, ...plan.manual_gates].map((item) => item?.id);
  if (ids.some((id) => typeof id !== 'string' || !id)) throw new TypeError('all finalization gates require ids');
  if (new Set(ids).size !== ids.length) throw new TypeError('finalization gate ids must be unique');
  if (plan.safety?.automatic_legacy_deletion !== false) throw new TypeError('automatic legacy deletion must be disabled');
  if (plan.safety?.modify_live_environment !== false) throw new TypeError('live environment modification must be disabled');
  if (plan.safety?.accept_secrets !== false) throw new TypeError('secret ingestion must be disabled');
  return Object.freeze(structuredClone(plan));
}
