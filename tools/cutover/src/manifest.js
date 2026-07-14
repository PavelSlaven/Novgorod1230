import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const CUTOVER_SCHEMA = 'rus.cutover_plan.v1';
export const CUTOVER_GATES = Object.freeze(['smoke', 'shadow', 'db_dry_run', 'diagnostics', 'rollback']);

export async function loadCutoverPlan(root = process.cwd(), path = 'data/cutover/plan.json') {
  const plan = JSON.parse(await readFile(resolve(root, path), 'utf8'));
  validateCutoverPlan(plan);
  return Object.freeze(plan);
}

export function validateCutoverPlan(plan) {
  const errors = [];
  if (plan?.schema_version !== CUTOVER_SCHEMA) errors.push('schema_version');
  if (plan?.version !== 1) errors.push('version');
  if (plan?.default_after_cutover !== 'modular') errors.push('default_after_cutover');
  if (plan?.rollback_route !== 'legacy') errors.push('rollback_route');
  const steps = Array.isArray(plan?.steps) ? plan.steps : [];
  if (steps.length !== 13) errors.push('steps.length');
  const ids = steps.map((step) => step.id);
  if (JSON.stringify(ids) !== JSON.stringify(Array.from({ length: 13 }, (_, index) => index + 1))) errors.push('steps.order');
  const names = new Set();
  for (const step of steps) {
    if (!step?.name || names.has(step.name)) errors.push(`step.${step?.id}.name`);
    names.add(step?.name);
    if (!plain(step?.enable) || Object.keys(step.enable).length === 0) errors.push(`step.${step?.id}.enable`);
  }
  for (const gate of CUTOVER_GATES) if (!(plan?.required_gates ?? []).includes(gate)) errors.push(`required_gates.${gate}`);
  if (steps[11]?.enable?.RUS_RUNTIME_ROUTE !== 'modular') errors.push('step.12.modular_route');
  if (steps.slice(0, 11).some((step) => step.enable?.RUS_RUNTIME_ROUTE === 'modular')) errors.push('premature_modular_default');
  if (errors.length) throw typed('CUTOVER_PLAN_INVALID', `Invalid cutover plan: ${errors.join(', ')}`, { errors });
  return plan;
}

const ENV_FLAGS = Object.freeze(['RUS_MODULES_ENABLED','RUS_LLM_RUNTIME_MODULES_ENABLED','RUS_DATA_MODULES_ENABLED','RUS_PARTY_STORE_MODULES_ENABLED','RUS_NEW_GAME_WAVE_24_26_ENABLED','RUS_NEW_GAME_WAVE_20_23_ENABLED','RUS_NEW_GAME_ALL_STAGES_ENABLED','RUS_NEW_GAME_MODULES_ENABLED','RUS_TURN_MODULES_ENABLED','RUS_PRESENTATION_MODULES_ENABLED','RUS_GAME_SERVER_MODULES_ENABLED','RUS_UI_MODULES_ENABLED','RUS_TOOLS_MODULES_ENABLED']);

export function buildCutoverProfile(plan, throughStep = 13, base = {}) {
  validateCutoverPlan(plan);
  const limit = Number(throughStep);
  if (!Number.isInteger(limit) || limit < 0 || limit > 13) throw typed('CUTOVER_STEP_INVALID', `Invalid cutover step: ${throughStep}`);
  const profile = { ...Object.fromEntries(ENV_FLAGS.map((name) => [name, 'false'])), ...base, RUS_RUNTIME_ROUTE: 'legacy', RUS_CUTOVER_STAGE: String(limit) };
  for (const step of plan.steps) if (step.id <= limit) Object.assign(profile, step.enable);
  return Object.freeze(profile);
}

function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function typed(code, message, details = {}) { const error = new Error(message); error.code = code; error.details = details; return error; }
