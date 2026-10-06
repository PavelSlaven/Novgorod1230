/**
 * Deterministic WK audit plan-mode harness (TASK-011 step 8 / D17 acceptance).
 * No LLM, no Giga encoder: applies fixture plans through Core and checks
 * applicability / knowledge_access / started_historical_events gates.
 * Live mode stays outside CI (owner recalculates judge metrics).
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorldKnowledgeCore, isApplicable, canAccess }
  from '@rus/world-knowledge';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(HERE, '../../..');
const DEFAULT_BUNDLE = 'data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json';

export async function loadPlanHarnessBundle({
  rootDir = DEFAULT_ROOT, bundleRel = DEFAULT_BUNDLE
} = {}) {
  const bundle = JSON.parse(await readFile(join(rootDir, bundleRel), 'utf8'));
  if (bundle?.schema !== 'world_knowledge_runtime_bundle_v1') {
    throw new TypeError('plan harness bundle schema mismatch');
  }
  return Object.freeze({
    bundle,
    core: createWorldKnowledgeCore(bundle)
  });
}

export function runPlanModeCase({ core, bundle, situation, plan }) {
  if (situation?.id == null || plan?.id == null || situation.id !== plan.id) {
    throw new TypeError('situation/plan id mismatch');
  }
  const year = Number.isInteger(situation.year) ? situation.year : 1230;
  const events = Array.isArray(situation.historical_events)
    ? situation.historical_events : [];
  const started = Array.isArray(situation.started_historical_events)
    ? situation.started_historical_events
    : events.filter((event) => event?.started_by_year == null
      || event.started_by_year <= year).map((event) => event.event_id);
  const context = {
    time: { year },
    place_refs: Array.isArray(situation.place_refs)
      ? situation.place_refs : ['region_novgorod_land'],
    actor_facets: situation.actor_facets ?? {},
    conditions: { started_historical_events: started }
  };
  const query = {
    schema: 'world_knowledge_query_v1',
    pack_ref: bundle.manifest.pack_ref,
    pack_revision: bundle.manifest.revision_id,
    purpose: situation.purpose,
    query_locale: plan.query_locale ?? 'ru',
    domains: [...(plan.domains ?? [])],
    focus_refs: [...(plan.focus_refs ?? [])],
    requested_predicates: [],
    search_hints: [...(plan.search_hints ?? [])],
    context,
    budget: { max_facts: 12, max_candidates: 12 }
  };
  const slice = core.resolveWorldKnowledge(query);
  const claimByRef = new Map(bundle.claims.map((claim) => [claim.claim_ref, claim]));
  const admitted = [...slice.facts, ...slice.hard_constraints]
    .map((entry) => claimByRef.get(entry.claim_ref))
    .filter(Boolean);
  for (const claim of admitted) {
    if (!isApplicable(claim.applicability, context)) {
      throw new Error(`plan harness admitted inapplicable ${claim.claim_ref}`);
    }
    if (!canAccess(claim.knowledge_access, context.actor_facets, query.purpose)) {
      throw new Error(`plan harness admitted inaccessible ${claim.claim_ref}`);
    }
  }
  const forbidden = Array.isArray(situation.expect_absent_claim_refs)
    ? situation.expect_absent_claim_refs : [];
  const present = new Set([
    ...slice.facts.map((entry) => entry.claim_ref),
    ...slice.hard_constraints.map((entry) => entry.claim_ref),
    ...(slice.disputes ?? []).flatMap((group) =>
      (group.claims ?? []).map((claim) => claim.claim_ref))
  ]);
  for (const ref of forbidden) {
    if (present.has(ref)) {
      throw new Error(`plan harness expected absent claim ${ref}`);
    }
  }
  const required = Array.isArray(situation.expect_present_claim_refs)
    ? situation.expect_present_claim_refs : [];
  for (const ref of required) {
    if (!present.has(ref)) {
      throw new Error(`plan harness expected present claim ${ref}`);
    }
  }
  // Planner may propose cut refs in focus_refs; Core must still exclude them.
  // Independence: expect_absent/present are the acceptance checks (not only
  // re-running isApplicable/canAccess on the admitted set).
  return Object.freeze({
    id: situation.id,
    purpose: situation.purpose,
    verdict: slice.verdict,
    claim_refs: Object.freeze([...present]),
    focus_refs: Object.freeze([...(plan.focus_refs ?? [])]),
    search_hint_hits: slice.search_hint_hits,
    search_hint_relevance: slice.search_hint_relevance,
    coverage: slice.coverage,
    disputes: slice.disputes
  });
}

export async function runPlanModeFixture({
  rootDir = DEFAULT_ROOT,
  situationsPath,
  plansPath
} = {}) {
  const { core, bundle } = await loadPlanHarnessBundle({ rootDir });
  const situations = await readJsonl(situationsPath);
  const plans = new Map((await readJsonl(plansPath)).map((plan) => [plan.id, plan]));
  const results = [];
  for (const situation of situations) {
    const plan = plans.get(situation.id);
    if (plan == null) throw new Error(`missing plan for ${situation.id}`);
    results.push(runPlanModeCase({ core, bundle, situation, plan }));
  }
  return Object.freeze(results);
}

async function readJsonl(path) {
  const text = await readFile(path, 'utf8');
  return text.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}
