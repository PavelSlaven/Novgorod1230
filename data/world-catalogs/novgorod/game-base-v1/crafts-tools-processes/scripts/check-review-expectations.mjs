import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const EXPECTATIONS = path.resolve(HERE, '../authoring/review_expectations.csv');
const DISAGREEMENTS = path.resolve(HERE, '../authoring/review_disagreements.csv');
const GROUPS = [
  ['crafts-tools-processes', 'archive_inclusion_ledger.csv', ''],
  ['buildings-interiors-containers', 'archive_inclusion_ledger.csv', 'authoring/archive_inclusion_manifest.json'],
  ['clothing-appearance', 'reports/archive_inclusion_ledger.csv', 'authoring/archive_inclusion_manifest.json'],
  ['items-weapons-armour', 'items/archive_inclusion_ledger.csv', 'authoring/archive_inclusion_manifest.json'],
];

function csv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted && c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.map(values => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

function readLedger(relative) {
  const file = path.join(ROOT, relative);
  const [header, ...lines] = fs.readFileSync(file, 'utf8').trimEnd().split(/\r?\n/);
  const keys = csv(`${header}\n`)[0] ? Object.keys(csv(`${header}\n`)[0]) : [];
  return csv([header, ...lines].join('\n')).map(row => ({ ...row, _file: relative, _keys: keys }));
}

function archiveId(row) {
  const ref = row.archive_ref || row.archive_id || '';
  return ref.split(':').at(-1) || '';
}

function actualAction(row) {
  const status = `${row.status || ''} ${row.decision || ''} ${row.inclusion_result || ''} ${row.archive_action || ''} ${row.disposition || ''} ${row.semantic_result || ''}`.toLowerCase();
  const type = row.match_type || row.record_type || row.type || '';
  if (/needs.?check/.test(status)) return 'needs_check';
  if (/reject|отклон/.test(status) || status.includes('rejected')) return 'reject';
  if (/routed|route/.test(status) || row.inclusion_result === 'routed' || row.disposition === 'routed') return 'routed';
  if (row.decision === 'entity' || row.inclusion_result === 'entity'
    || (type === 'new' && /include|included|include_d39|include_analogy/.test(`${status} ${row.selected_action || ''}`))) return 'entity';
  if (type === 'variant') return 'variant';
  if (row.target_group || row.game_base_ref || row.target_ref) return 'ref';
  return 'unknown';
}

function rowsById() {
  const rows = GROUPS.flatMap(([group, ledger]) => {
    return readLedger(path.join(group, ledger)).map(row => ({ ...row, _group: group }));
  });
  return rows
    .reduce((map, row) => map.set(archiveId(row), [...(map.get(archiveId(row)) || []), row]), new Map());
}

function targetMatches(actual, expected) {
  const values = [actual.game_base_ref, actual.target_ref].filter(Boolean);
  return values.some(value => value.includes(expected));
}

function actualTarget(actual) {
  return actual.target_ref || actual.game_base_ref || '';
}

function normalizedTarget(value) {
  return String(value || '').split(/[#:]/).at(-1).toLowerCase();
}

function resolveStableTarget(value, records, seen = new Set()) {
  const target = normalizedTarget(value);
  const archiveId = target.match(/[a-z]{2,5}\d{3,6}$/i)?.[0]?.toUpperCase();
  if (!archiveId || seen.has(archiveId)) return { target, hops: 0 };
  const candidates = records.get(archiveId) || [];
  if (!candidates.length) return { target, hops: 0 };
  const decision = recordGroupDecision(candidates);
  if (decision.issue) return { target, hops: 0 };
  const rows = (decision.ownerRows.length ? decision.ownerRows : candidates)
    .filter(row => ['variant', 'ref'].includes(actualAction(row)) && actualTarget(row));
  if (!rows.length) return { target, hops: 0 };
  const nextSeen = new Set(seen).add(archiveId);
  const resolved = rows.map(row => resolveStableTarget(actualTarget(row), records, nextSeen));
  const targets = new Set(resolved.map(item => item.target));
  if (targets.size !== 1) return { target, hops: 0 };
  return { target: resolved[0].target, hops: Math.max(...resolved.map(item => item.hops)) + 1 };
}

function targetIds(group) {
  const dir = path.join(ROOT, group);
  const ids = new Set();
  if (!fs.existsSync(dir)) return ids;
  const ignored = /(^|\/)(sources|reports|authoring)(\/|$)|archive_inclusion_ledger\.csv$|archive_inclusion_manifest\.json$|VERIFICATION\.md$/i;
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      const relative = path.relative(dir, file).replaceAll(path.sep, '/');
      if (ignored.test(relative)) continue;
      if (entry.isDirectory()) { visit(file); continue; }
      if (!/\.(csv|psv|json)$/i.test(entry.name)) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (/\.json$/i.test(entry.name)) {
        try {
          const walk = value => {
            if (typeof value === 'string') ids.add(value.trim());
            else if (Array.isArray(value)) value.forEach(walk);
            else if (value && typeof value === 'object') {
              Object.entries(value).forEach(([key, item]) => { ids.add(key.trim()); walk(item); });
            }
          };
          walk(JSON.parse(text));
        } catch { /* malformed unrelated JSON is not a target source */ }
        continue;
      }
      const delimiter = entry.name.endsWith('.psv') ? '|' : ',';
      for (const line of text.split(/\r?\n/).slice(1)) {
        const first = line.split(delimiter, 1)[0]?.trim().replace(/^"|"$/g, '');
        if (first) ids.add(first);
      }
    }
  };
  visit(dir);
  return ids;
}

const targetIndex = new Map();
function targetExists(group, target) {
  if (!group || !target) return false;
  if (!targetIndex.has(group)) targetIndex.set(group, targetIds(group));
  const ids = targetIndex.get(group);
  const wanted = target.toLowerCase();
  return [...ids].some(id => id.toLowerCase() === wanted || id.toLowerCase().endsWith(`:${wanted}`));
}

function recordGroupDecision(candidates) {
  const ownerRows = candidates.filter(row => ['entity', 'variant'].includes(actualAction(row)));
  const owners = new Set(ownerRows.map(row => row._group).filter(Boolean));
  if (owners.size > 1) return { ownerGroup: '', ownerRows: [], issue: `multiple owners: ${[...owners].join('|')}` };
  if (owners.size === 1) {
    const ownerGroup = [...owners][0];
    const routedElsewhere = candidates.filter(row => row._group && row._group !== ownerGroup
      && actualAction(row) !== 'routed' && actualAction(row) !== 'unknown');
    if (routedElsewhere.length) return { ownerGroup, ownerRows, issue: `non-owner not routed: ${routedElsewhere.map(row => row._group).join('|')}` };
    return { ownerGroup, ownerRows, issue: '' };
  }
  return { ownerGroup: '', ownerRows: [], issue: '' };
}

export function compareExpectations(expectations, disagreements, records, exists = targetExists) {
  for (const expected of expectations) {
    if (!['round2', 'amend', 'round1'].includes(expected.source_rank)) {
      throw new Error(`invalid source_rank for ${expected.archive_id}: ${expected.source_rank}`);
    }
  }
  const active = expectations.filter(expected => !expected.superseded_by?.trim());
  const allowed = new Map();
  for (const row of disagreements) {
    if (!row.archive_id || !row.reason?.trim() || row.reason.trim().length < 12 || allowed.has(row.archive_id)
      || [...allowed.values()].includes(row.reason.trim())) {
      throw new Error('disagreements CSV requires unique archive_id and a concrete reason');
    }
    allowed.set(row.archive_id, row.reason.trim());
  }
  const mismatches = [];
  const direct = new Set();
  const equivalent = new Set();
  for (const expected of active) {
    if (!expected.archive_id || !expected.expected_action || !expected.review_source) {
      throw new Error('expectation row requires archive_id, expected_action and review_source');
    }
    const candidates = records.get(expected.archive_id) || [];
    const decision = recordGroupDecision(candidates);
    const decisionRows = decision.ownerRows.length ? decision.ownerRows : candidates;
    const canonicalEntityTarget = actual => actualAction(actual) === 'entity'
      && !actual.game_base_ref && !actual.target_ref
      && expected.expected_target_ref === `n1230:material_item:${expected.archive_id.toLowerCase()}`
      && exists(actual._group, expected.expected_target_ref);
    const targetGroupMatches = actual => !expected.expected_target_group
      || (actual.target_group || actual.owner_group || actual._group || '') === expected.expected_target_group;
    const directMatch = decisionRows.some(actual => actualAction(actual) === expected.expected_action
      && (!expected.expected_target_ref || targetMatches(actual, expected.expected_target_ref) || canonicalEntityTarget(actual))
      && targetGroupMatches(actual));
    const routeEquivalent = ['variant', 'ref'].includes(expected.expected_action) && expected.expected_target_ref
      && !candidates.some(actual => !['routed', 'unknown'].includes(actualAction(actual)))
      && candidates.some(actual => actualAction(actual) === 'routed'
        && actualTarget(actual).includes(expected.expected_target_ref)
        && (!expected.expected_target_group || (actual.target_group || actual.owner_group || '') === expected.expected_target_group)
        && exists(actual.target_group || actual.owner_group, expected.expected_target_ref));
    const refVariantEquivalent = ['variant', 'ref'].includes(expected.expected_action) && expected.expected_target_ref
      && decisionRows.some(actual => ['variant', 'ref'].includes(actualAction(actual))
        && actualAction(actual) !== expected.expected_action
        && targetMatches(actual, expected.expected_target_ref));
    const expectedStableTarget = expected.expected_target_ref
      ? resolveStableTarget(expected.expected_target_ref, records) : { target: '', hops: 0 };
    const stableTargetEquivalent = ['variant', 'ref'].includes(expected.expected_action) && expected.expected_target_ref
      && expectedStableTarget.hops > 0
      && decisionRows.some(actual => ['variant', 'ref'].includes(actualAction(actual))
        && targetGroupMatches(actual)
        && expectedStableTarget.target === resolveStableTarget(actualTarget(actual), records).target);
    const isDirect = !decision.issue && directMatch;
    const isEquivalent = !decision.issue && !isDirect && (routeEquivalent || refVariantEquivalent || stableTargetEquivalent);
    if (isDirect) direct.add(expected.archive_id);
    else if (isEquivalent) equivalent.add(expected.archive_id);
    else if (!allowed.has(expected.archive_id)) {
      mismatches.push({ id: expected.archive_id, action: expected.expected_action,
        target: expected.expected_target_ref, group: expected.expected_target_group || decision.ownerGroup || candidates[0]?._group || 'unknown',
        source: expected.review_source, sourceRank: expected.source_rank,
        supersededBy: expected.superseded_by || '',
        actual: candidates.map(row => `${row._group || 'unknown'}:${actualAction(row)}`).join('|') || 'missing',
        issue: decision.issue });
    }
  }
  const accepted = new Set(active.filter(row => allowed.has(row.archive_id)).map(row => row.archive_id));
  return { mismatches, direct, equivalent, allowed: accepted, total: expectations.length,
    superseded: expectations.length - active.length };
}

export function expectationCounts(result) {
  return { total: result.total, superseded: result.superseded,
    fulfilled_direct: result.direct.size, fulfilled_equivalent: result.equivalent.size,
    mismatches: result.mismatches.length, accepted_disagreements: result.allowed.size };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const expectations = csv(fs.readFileSync(EXPECTATIONS, 'utf8'));
  const disagreements = csv(fs.readFileSync(DISAGREEMENTS, 'utf8'));
  const result = compareExpectations(expectations, disagreements, rowsById());
  const summary = expectationCounts(result);
  const mismatches = result.mismatches;
  const mismatchCounts = mismatches.reduce((map, row) => {
    const key = `${row.group || 'unspecified'}|${row.action}`;
    return map.set(key, (map.get(key) || 0) + 1);
  }, new Map());
  console.log(`total=${summary.total} superseded=${summary.superseded} fulfilled_direct=${summary.fulfilled_direct} fulfilled_equivalent=${summary.fulfilled_equivalent} mismatches=${summary.mismatches} accepted_disagreements=${summary.accepted_disagreements}`);
  console.log(`mismatch_group_action=${[...mismatchCounts].map(([key, count]) => `${key}:${count}`).join(',') || 'none'}`);
  for (const row of mismatches.slice(0, 12)) {
    console.log(`- ${row.id}: expected ${row.action}${row.target ? ` target=${row.target}` : ''}${row.group ? ` group=${row.group}` : ''}; actual=${row.actual}; ${row.source} rank=${row.sourceRank}${row.supersededBy ? ` superseded_by=${row.supersededBy}` : ''}${row.issue ? ` issue=${row.issue}` : ''}`);
  }
  const reportArg = process.argv.find(arg => arg.startsWith('--mismatch-report='));
  if (reportArg) {
    const output = reportArg.slice('--mismatch-report='.length);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const quote = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    fs.writeFileSync(output, ['archive_id,expected_action,expected_target_ref,expected_target_group,review_source,source_rank,superseded_by,actual,issue',
      ...mismatches.map(row => [row.id, row.action, row.target, row.group, row.source, row.sourceRank, row.supersededBy, row.actual, row.issue].map(quote).join(','))].join('\n') + '\n');
  }
  if (mismatches.length) process.exitCode = 1;
}
