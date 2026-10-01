import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REPO, readCsv, readJson, split } from '../scripts/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TYPE_KINDS = new Set(['land_use', 'place']);
const CANDIDATE_ASSESSMENTS = new Set(['условно применим', 'правдоподобен, условно']);
const GAP_ASSESSMENTS = new Set(['нет точного основания', 'не применим по имеющимся данным']);
const SOURCE_LINE = /(?:^|;\s*)(?:(?:pr98:)?(?:[A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+):\d+(?:-\d+)?|research-evidence\.json#[A-Za-z0-9_-]+)/u;
const sourceLineCounts = new Map();

function hasResolvableSourceLine(value, evidenceById) {
  const refs = split(value);
  let fileRefs = 0;
  for (const rawRef of refs) {
    const ref = rawRef.trim();
    if (/^book:\d+ §\d+(?:[–-]\d+)?(?:\s+.*)?$/u.test(ref)) continue;
    const evidenceMatch = /^research-evidence\.json#([A-Za-z0-9_-]+)$/u.exec(ref);
    if (evidenceMatch) {
      const evidence = evidenceById.get(evidenceMatch[1]);
      if (!evidence || evidence.verification_status !== 'verified') return false;
      fileRefs++;
      continue;
    }
    const match = /^(?:pr98:)?(.+?\.[A-Za-z0-9_-]+):(\d+)(?:-(\d+))?$/u.exec(ref);
    if (!match) return false;
    fileRefs++;
    const file = path.resolve(REPO, match[1]);
    let count = sourceLineCounts.get(file);
    if (count === undefined) {
      try { count = fs.readFileSync(file, 'utf8').split(/\r?\n/u).length; }
      catch { count = 0; }
      sourceLineCounts.set(file, count);
    }
    const first = Number(match[2]);
    const last = Number(match[3] ?? match[2]);
    if (first < 1 || last < first || last > count) return false;
  }
  return fileRefs > 0;
}

function nodeBindingRefsMatch(sourceRefs, nodeRef) {
  for (const ref of split(sourceRefs)) {
    const match = /^(?:pr98:)?(.+\/node_binding\.csv):(\d+)$/u.exec(ref.trim());
    if (!match) continue;
    const file = path.resolve(REPO, match[1]);
    let rows;
    try { rows = fs.readFileSync(file, 'utf8').split(/\r?\n/u); }
    catch { return false; }
    const line = rows[Number(match[2]) - 1];
    if (!line) return false;
    const row = readCsv(file)[Number(match[2]) - 2];
    if (!row || row.node_ref !== nodeRef) return false;
  }
  return true;
}

export function loadPackage() {
  const bindingRoot = path.resolve(HERE, '..');
  const regional = path.join(REPO, 'data/world-catalogs/novgorod/regional-environment/candidates/novgorod-1230-1250-v1/source-authoring.json');
  const inventory = readJson(path.join(bindingRoot, 'inputs/m2c-nature-coverage-entries.json'));
  const source = readJson(regional);
  const templates = [
    ...readJson(path.resolve(REPO, 'infra/world-base/land_use_templates.seed.json')),
    ...readJson(path.resolve(REPO, 'infra/world-base/place_templates.seed.json')),
  ];
  return {
    inventory: inventory.entries.filter((row) => TYPE_KINDS.has(row.kind)),
    source,
    matrix: readCsv(path.join(HERE, 'matrix.csv')),
    candidates: readCsv(path.join(HERE, 'candidates.csv')),
    gaps: readCsv(path.join(HERE, 'typed-gaps.csv')),
    selectorRecommendations: readCsv(path.join(HERE, 'selector-reconciliation.csv')),
    nodes: readCsv(path.join(bindingRoot, 'places/node_binding.csv')),
    pfs: readCsv(path.join(bindingRoot, 'places/place_families.csv')),
    templates,
    researchEvidence: readJson(path.join(HERE, 'research-evidence.json')).entries,
  };
}

function normalizedWords(value, excluded = []) {
  let text = String(value ?? '').toLocaleLowerCase('ru').replaceAll('ё', 'е');
  for (const valueToDrop of excluded) {
    if (valueToDrop) text = text.replaceAll(String(valueToDrop).toLocaleLowerCase('ru'), ' ');
  }
  return text.replace(/[^\p{L}\s]/gu, ' ').split(/\s+/u).filter(Boolean).map((word) =>
    word.length > 4 ? word.replace(/(ами|ями|ого|его|ому|ему|ыми|ими|ов|ев|ей|ом|ем|ах|ях|ый|ий|ой|ая|яя|ое|ее|ые|ие|ую|юю|ам|ям|ют|ут|ат|ят|ет|ит|ся|сь|а|я|о|е|ы|и|у|ю|ь|й)$/u, '') : word);
}

function duplicateReasonShare(rows) {
  const tokens = rows.map((row) => normalizedWords(row.reason, [row.type_id, row.title]));
  const prefixes = new Map();
  for (const words of tokens) for (let size = 1; size <= Math.min(words.length, 6); size++) {
    const key = words.slice(0, size).join(' ');
    prefixes.set(key, (prefixes.get(key) ?? 0) + 1);
  }
  let commonPrefix = 0;
  for (let size = 1; size <= 6; size++) {
    const common = [...prefixes].some(([key, count]) => key.split(' ').length === size && count >= 0.8 * rows.length);
    if (!common) break;
    commonPrefix = size;
  }
  const parents = rows.map((_, index) => index);
  const find = (index) => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const union = (a, b) => { parents[find(a)] = find(b); };
  const clusterBy = (keyFor) => {
    const groups = new Map();
    tokens.forEach((words, index) => {
      const key = keyFor(words);
      if (key) groups.set(key, [...(groups.get(key) ?? []), index]);
    });
    for (const indexes of groups.values()) for (const index of indexes.slice(1)) union(indexes[0], index);
  };
  clusterBy((words) => words.slice(commonPrefix).length >= 4 ? words.slice(commonPrefix, commonPrefix + 4).join(' ') : '');
  clusterBy((words) => words.length >= 4 ? words.slice(-4).join(' ') : '');
  const comparable = tokens.map((words) => new Set(words.slice(commonPrefix)));
  for (let left = 0; left < rows.length; left++) for (let right = left + 1; right < rows.length; right++) {
    const a = comparable[left], b = comparable[right];
    let shared = 0;
    for (const word of a) if (b.has(word)) shared++;
    if (a.size && b.size && shared / (a.size + b.size - shared) >= 0.6) union(left, right);
  }
  const groups = new Map();
  rows.forEach((_, index) => groups.set(find(index), (groups.get(find(index)) ?? 0) + 1));
  const repeated = [...groups.values()].filter((size) => size > 1).reduce((sum, size) => sum + size, 0);
  return rows.length ? repeated / rows.length : 0;
}

export function validateStartTerritoryTypes(data = loadPackage()) {
  const errors = [];
  const fail = (code, detail) => errors.push(`${code}: ${detail}`);
  const expected = new Map(data.inventory.map((row) => [row.template_id, row.kind]));
  const ids = (rows, field = 'type_id') => rows.map((row) => row[field]);
  const unique = (values) => new Set(values).size === values.length;
  const matrixIds = ids(data.matrix);
  const candidateIds = ids(data.candidates);
  const gapIds = ids(data.gaps);
  const nodes = new Map(data.nodes.map((row) => [row.node_ref, row]));
  const pfs = new Set(data.pfs.map((row) => row.pf_id));
  const evidenceIds = ids(data.researchEvidence ?? [], 'evidence_id');
  const evidenceById = new Map((data.researchEvidence ?? []).map((row) => [row.evidence_id, row]));
  const templates = new Map((data.templates ?? []).map((row) => [row.id, row]));
  const selectors = new Map(Object.entries(data.source.selectors)
    .flatMap(([kind, typeIds]) => typeIds.map((typeId) => [typeId, kind])));
  const exclusions = new Set(data.source.explicit_exclusions);

  if (expected.size !== 70 || [...expected.values()].filter((kind) => kind === 'land_use').length !== 31 ||
      [...expected.values()].filter((kind) => kind === 'place').length !== 39) fail('INVENTORY_COUNTS', `got ${expected.size}`);
  if (data.matrix.length !== 70 || !unique(matrixIds) || matrixIds.some((id) => !expected.has(id)) ||
      expected.size !== matrixIds.length || [...expected.keys()].some((id) => !matrixIds.includes(id))) {
    fail('MATRIX_INVENTORY', 'matrix must contain each pinned regional PF inventory id exactly once');
  }
  if (data.candidates.length !== 39 || data.gaps.length !== 31 || !unique(candidateIds) || !unique(gapIds)) {
    fail('PARTITION_COUNTS', `candidate=${data.candidates.length}, gap=${data.gaps.length}`);
  }
  const expectedEvidenceIds = ['bort-01', 'bort-02', 'bort-03', 'orchard-01', 'orchard-02', 'orchard-11', 'orchard-12', 'orchard-14', 'quarry-01', 'quarry-02', 'quarry-07', 'quarry-15'];
  if (data.researchEvidence?.length !== expectedEvidenceIds.length || !unique(evidenceIds) ||
      expectedEvidenceIds.some((id) => !evidenceById.has(id)) || evidenceIds.some((id) => !expectedEvidenceIds.includes(id))) {
    fail('RESEARCH_EVIDENCE_SET', `expected ${expectedEvidenceIds.length} curated verified findings`);
  }
  for (const row of data.researchEvidence ?? []) {
    const quoteWords = String(row.short_quote ?? '').trim().split(/\s+/u).filter(Boolean);
    if (row.verification_status !== 'verified' || !row.assertion?.trim() || !row.note?.trim() ||
        !Array.isArray(row.source) || !row.source.length || row.source.some((url) => !/^https:\/\//u.test(url)) ||
        (row.short_quote && quoteWords.length > 25)) {
      fail('RESEARCH_EVIDENCE_ENTRY', row.evidence_id);
    }
  }
  if (candidateIds.some((id) => gapIds.includes(id)) || [...matrixIds].some((id) => !candidateIds.includes(id) && !gapIds.includes(id))) {
    fail('PARTITION_IDS', 'candidate and gap ids must partition matrix ids');
  }

  const candidateById = new Map(data.candidates.map((row) => [row.type_id, row]));
  const gapById = new Map(data.gaps.map((row) => [row.type_id, row]));
  for (const row of data.matrix) {
    const candidate = candidateById.get(row.type_id);
    const gap = gapById.get(row.type_id);
    const detail = candidate ?? gap;
    if (!detail) continue;
    const assessment = candidate?.causal_assessment_not_approved ?? gap?.assessment;
    const reason = candidate?.causal_reason ?? gap?.cause_gap;
    const detailRefs = new Set(split(candidate?.source_refs ?? gap?.sources ?? ''));
    const matrixRefs = split(row.source_refs);
    const expectedNodeRefs = candidate
      ? `G4=${candidate.candidate_G4_refs} | G5=${candidate.candidate_G5_refs}`
      : 'G4=— | G5=—';
    if (row.causal_applicability_assessment_not_approved !== assessment ||
        row.reason !== reason ||
        matrixRefs.some((ref) => !detailRefs.has(ref)) ||
        row.candidate_exact_G4_G5_with_PF_overlap_not_type_binding !== expectedNodeRefs) {
      fail('MATRIX_DETAIL_MIRROR', row.type_id);
    }
  }

  for (const row of data.matrix) {
    if (expected.get(row.type_id) !== row.kind) fail('TYPE_KIND', row.type_id);
    if (!row.reason?.trim() || !SOURCE_LINE.test(row.source_refs ?? '') || !hasResolvableSourceLine(row.source_refs, evidenceById)) fail('MATRIX_EVIDENCE', row.type_id);
    const selected = selectors.get(row.type_id) === row.kind;
    const expectedSelector = selected ? 'selected' : 'NOT_SELECTED: reconcile before treating as regional type';
    if (row.current_regional_environment_candidate_selector !== expectedSelector) fail('SELECTOR_STATUS', row.type_id);
    if (exclusions.has(row.type_id) && selected) fail('EXCLUSION_SELECTED', row.type_id);
  }

  for (const row of data.candidates) {
    if (!CANDIDATE_ASSESSMENTS.has(row.causal_assessment_not_approved)) fail('CANDIDATE_ASSESSMENT', row.type_id);
    if (expected.get(row.type_id) !== row.kind) fail('CANDIDATE_KIND', row.type_id);
    if (!row.causal_reason?.trim() || !SOURCE_LINE.test(row.source_refs ?? '') || !hasResolvableSourceLine(row.source_refs, evidenceById)) fail('CANDIDATE_EVIDENCE', row.type_id);
    const actualRefs = [...new Set([...split(row.candidate_G4_refs), ...split(row.candidate_G5_refs)])];
    const g4Refs = split(row.candidate_G4_refs);
    const g5Refs = split(row.candidate_G5_refs);
    if (!g4Refs.length || !g5Refs.length || !actualRefs.length) fail('CANDIDATE_SCOPE_EMPTY', row.type_id);
    for (const ref of g4Refs) if (nodes.get(ref)?.node_level !== 'G4') fail('G4_REF_LEVEL', `${row.type_id} -> ${ref}`);
    for (const ref of g5Refs) if (nodes.get(ref)?.node_level !== 'G5') fail('G5_REF_LEVEL', `${row.type_id} -> ${ref}`);
    for (const ref of actualRefs) {
      const node = nodes.get(ref);
      if (!node || !['G4', 'G5'].includes(node.node_level) || node.status !== 'candidate') fail('NODE_REF', `${row.type_id} -> ${ref}`);
    }
    const template = templates.get(row.type_id);
    if (!template) fail('TYPE_TEMPLATE', row.type_id);
    let exceptions = [];
    try { exceptions = row.candidate_compatibility_exceptions ? JSON.parse(row.candidate_compatibility_exceptions) : []; }
    catch { fail('COMPATIBILITY_EXCEPTION_JSON', row.type_id); }
    if (!Array.isArray(exceptions)) { fail('COMPATIBILITY_EXCEPTION_SHAPE', row.type_id); exceptions = []; }
    const declaredExceptionKeys = new Set();
    for (const exception of exceptions) {
      const key = `${exception.node_ref}:${exception.dimension}`;
      if (declaredExceptionKeys.has(key)) fail('COMPATIBILITY_EXCEPTION_DUPLICATE', `${row.type_id} -> ${key}`);
      declaredExceptionKeys.add(key);
    }
    const exceptionKeys = new Set();
    const compatibility = [
      ['landscape_template_id', 'compatible_landscape_template_ids'],
      ['water_body_template_id', 'compatible_water_body_template_ids'],
    ];
    for (const ref of actualRefs) {
      const node = nodes.get(ref);
      if (!node || !template) continue;
      for (const [field, allowedField] of compatibility) {
        const allowed = template[allowedField] ?? [];
        if (!allowed.length) continue;
        const value = node[field] || (node.parent_node_ref ? nodes.get(node.parent_node_ref)?.[field] : '');
        if (value && allowed.includes(value)) continue;
        const exception = exceptions.find((item) => item.node_ref === ref && item.dimension === field);
        if (!exception) {
          fail('NODE_TEMPLATE_INCOMPATIBLE', `${row.type_id} -> ${ref} ${field}=${value || '(missing)'}; allowed=${allowed.join('|')}`);
          continue;
        }
        const key = `${exception.node_ref}:${exception.dimension}`;
        if (exceptionKeys.has(key)) fail('COMPATIBILITY_EXCEPTION_DUPLICATE', `${row.type_id} -> ${key}`);
        exceptionKeys.add(key);
        if (!actualRefs.includes(exception.node_ref) ||
            !String(exception.reason ?? '').trim() ||
            !SOURCE_LINE.test(exception.source_refs ?? '') || !hasResolvableSourceLine(exception.source_refs, evidenceById) ||
            !nodeBindingRefsMatch(exception.source_refs, exception.node_ref)) {
          fail('COMPATIBILITY_EXCEPTION_EVIDENCE', `${row.type_id} -> ${key}`);
        }
      }
    }
    for (const exception of exceptions) {
      if (!actualRefs.includes(exception.node_ref) || !['landscape_template_id', 'water_body_template_id'].includes(exception.dimension)) {
        fail('COMPATIBILITY_EXCEPTION_SCOPE', row.type_id);
        continue;
      }
      const node = nodes.get(exception.node_ref);
      const allowedField = exception.dimension === 'landscape_template_id'
        ? 'compatible_landscape_template_ids'
        : 'compatible_water_body_template_ids';
      const allowed = template?.[allowedField] ?? [];
      const value = node?.[exception.dimension] || (node?.parent_node_ref ? nodes.get(node.parent_node_ref)?.[exception.dimension] : '');
      if (!node || !allowed.length || (value && allowed.includes(value))) fail('COMPATIBILITY_EXCEPTION_UNNEEDED', `${row.type_id} -> ${exception.node_ref} ${exception.dimension}`);
      if (!String(exception.reason ?? '').trim() || !SOURCE_LINE.test(exception.source_refs ?? '') || !hasResolvableSourceLine(exception.source_refs, evidenceById) ||
          !nodeBindingRefsMatch(exception.source_refs, exception.node_ref)) {
        fail('COMPATIBILITY_EXCEPTION_EVIDENCE', `${row.type_id} -> ${exception.node_ref} ${exception.dimension}`);
      }
    }
    for (const pf of split(row.candidate_PF_refs)) if (!pfs.has(pf)) fail('PF_REF', `${row.type_id} -> ${pf}`);
    if (!['candidate_pf_overlap', 'context_only_no_type_or_pf_binding'].includes(row.scope_evidence_class)) fail('SCOPE_EVIDENCE_CLASS', row.type_id);
    if (row.scope_evidence_class === 'candidate_pf_overlap' && !split(row.candidate_PF_refs).length) fail('SCOPE_PF_EMPTY', row.type_id);
    const selected = selectors.get(row.type_id) === row.kind;
    const expectedSelector = selected ? 'selected' : 'NOT_SELECTED: reconcile before treating as regional type';
    if (row.regional_selector_status !== expectedSelector) fail('CANDIDATE_SELECTOR_STATUS', row.type_id);
    if (!row.presence_manifestation?.trim() || !row.direct_type_binding?.startsWith('NONE:')) fail('CANDIDATE_REPRESENTATION', row.type_id);
  }

  for (const row of data.gaps) {
    if (!GAP_ASSESSMENTS.has(row.assessment)) fail('GAP_ASSESSMENT', row.type_id);
    if (expected.get(row.type_id) !== row.kind) fail('GAP_KIND', row.type_id);
    if (!row.cause_gap?.trim() || !row.closure_evidence_or_decision?.trim() || !SOURCE_LINE.test(row.sources ?? '') || !hasResolvableSourceLine(row.sources, evidenceById)) fail('GAP_EVIDENCE', row.type_id);
    if (Object.values(row).some((value) => String(value).trim().toLocaleLowerCase('en') === 'false')) fail('GAP_FALSE', row.type_id);
    if (!row.direct_type_binding?.startsWith('NONE:')) fail('GAP_DIRECT_BINDING', row.type_id);
    const selected = selectors.get(row.type_id) === row.kind;
    const excluded = exclusions.has(row.type_id);
    const expectedSelector = selected ? 'selected' : excluded ? 'explicitly excluded' : 'not selected';
    if (row.regional_selector_status !== expectedSelector) fail('GAP_SELECTOR_STATUS', row.type_id);
  }

  const recommendations = new Map(data.selectorRecommendations.map((row) => [row.type_id, row]));
  const expectedRecommendations = ['lu_dye_medicinal_crop_plot', 'lu_peat_cutting', 'lu_sand_gravel_extraction', 'lu_stone_quarrying'];
  if (recommendations.size !== 4 || expectedRecommendations.some((id) => !recommendations.has(id))) fail('SELECTOR_RECOMMENDATIONS', 'expected four unselected land-use types');
  for (const row of data.selectorRecommendations) {
    if (selectors.get(row.type_id) || exclusions.has(row.type_id) || row.current_selector_status !== 'not selected; not explicit exclusion') fail('RECOMMENDATION_SCOPE', row.type_id);
    if (!row.proposed_action?.trim() || !row.reason?.trim() || !SOURCE_LINE.test(row.evidence_refs ?? '') || !hasResolvableSourceLine(row.evidence_refs, evidenceById)) fail('RECOMMENDATION_EVIDENCE', row.type_id);
  }

  for (const row of data.nodes) {
    if (row.land_use_template_id || row.place_template_id) fail('DIRECT_NODE_TYPE_BINDING', row.node_ref);
  }
  const repeatedShare = duplicateReasonShare(data.matrix);
  if (repeatedShare > 0.2) fail('DUPLICATE_CAUSES', `${(repeatedShare * 100).toFixed(1)}% exceeds 20%`);
  return { errors, counts: { inventory: expected.size, candidates: data.candidates.length, gaps: data.gaps.length, duplicateCauseShare: repeatedShare } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateStartTerritoryTypes();
  for (const error of result.errors) process.stderr.write(`${error}\n`);
  if (result.errors.length) process.exitCode = 1;
  else process.stdout.write(`start-territory-types valid: ${result.counts.inventory} types, ${result.counts.candidates} candidates, ${result.counts.gaps} gaps; duplicate-cause share ${(result.counts.duplicateCauseShare * 100).toFixed(1)}%\n`);
}
