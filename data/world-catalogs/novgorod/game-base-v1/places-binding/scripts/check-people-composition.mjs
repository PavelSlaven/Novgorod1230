import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO, GROUP, readCsv, readJson, readTsv } from './lib.mjs';

const P = (...parts) => path.join(GROUP, ...parts);
const BASE = path.dirname(GROUP);
const SCHEDULES = path.join(BASE, 'time-calendar-church/time/schedules_routines.csv');
const PROFILES = path.join(BASE, 'occupations-activities/npc_runtime_profiles/npc_runtime_profiles.json');
const HOUSEHOLDS = path.join(BASE, 'households-psychology-speech/households_kinship/household_composition_profiles.csv');
const AUTHORING = P('presence/people_composition_authoring.json');
const PEOPLE = P('presence/people_presence_authoring.csv');
const DERIVED = P('presence/presence_rules.csv');
const exact = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
  Object.keys(object).sort().join('|') === keys.sort().join('|');
const named = (value) => typeof value === 'string' && value.trim().length > 0;
const reasoned = (value) => named(value) && value.trim().length >= 15 && value.trim().split(/\s+/u).length >= 2 &&
  !/^(?:x|n\/a|unknown|неизвестно|нет данных|нет сведений о причине)(?:$|[^\p{L}])/iu.test(value.trim());
const subjectKey = (kind, ref) => `${kind}:${ref}`;
const seasons = ['winter', 'spring', 'summer', 'autumn'];
const evidenceDir = path.join(BASE, '../sources/books-evidence-v1');
const bookEvidence = new Map();
const sexSources = new Map([
  ['data/novgorod-region/novgorod_occupations_v1_enriched.tsv',
    new Set(readTsv(path.join(REPO, 'data/novgorod-region/novgorod_occupations_v1_enriched.tsv')).map((r) => r.occupation_id))],
  ['data/world-catalogs/novgorod/sources/master-archive-v1/data/normalized_source_tables/occupations/professions.csv',
    new Set(readCsv(path.join(REPO, 'data/world-catalogs/novgorod/sources/master-archive-v1/data/normalized_source_tables/occupations/professions.csv')).map((r) => r.profession_id))],
]);
for (const file of fs.readdirSync(evidenceDir).filter((name) => name.endsWith('.csv'))) for (const row of readCsv(path.join(evidenceDir, file))) {
  const key = `${row.book_id}|${row.para_no}`;
  if (!bookEvidence.has(key)) bookEvidence.set(key, new Set());
  bookEvidence.get(key).add(row.section_path);
}

export function checkPeopleComposition(data, startTerritory = null, people = readCsv(PEOPLE), derived = readCsv(DERIVED), profileCatalog = readJson(PROFILES), scheduleRows = readCsv(SCHEDULES)) {
  const errors = [];
  const binding = readCsv(P('places/node_binding.csv'));
  const bound = new Set(binding.map((r) => r.pf_id).filter(Boolean));
  const occupations = new Set([
    ...readTsv(path.join(REPO, 'data/novgorod-region/novgorod_occupations_v1.tsv')),
    ...readCsv(path.join(BASE, 'occupations-activities/occupations/occupations_additions.csv')),
  ].map((r) => r.occupation_id));
  const roles = new Set(readTsv(path.join(REPO, 'data/novgorod-region/novgorod_social_roles_v1.tsv')).map((r) => r.role_id));
  const profiles = new Map(profileCatalog.profiles.map((p) => [p.profile_id, p]));
  const sexConstraints = (s) => profileCatalog.subject_applicability
    .filter((entry) => entry.subject_id === s.subject_ref &&
      entry.subject_kind === (s.subject_kind === 'social_role' ? 'role' : s.subject_kind))
    .map((entry) => entry.actor_applicability);
  const households = new Map(readCsv(HOUSEHOLDS).map((h) => [h.hh_id, h]));
  if (data?.schema !== 'people_composition_authoring.v1' || !Array.isArray(data.compositions) || !Array.isArray(data.never_created_gaps)) return ['schema/compositions/gaps'];
  if (bound.size !== 16) errors.push(`node_binding has ${bound.size} primary PF, expected 16`);
  if (startTerritory) {
    const fromBridge = new Set(startTerritory.place_types);
    const bridgeNodes = [...(startTerritory.g4 ?? []), ...(startTerritory.g5 ?? [])];
    const bridgeRefs = new Map(bridgeNodes.map((r) => [r.ref, r]));
    if (!Array.isArray(startTerritory.place_types) || fromBridge.size !== 16 ||
        [...bound].some((pf) => !fromBridge.has(pf)) || [...fromBridge].some((pf) => !bound.has(pf)))
      errors.push('start-territory place_types differ from primary node_binding PF');
    if (bridgeRefs.size !== binding.length || binding.some((r) => !bridgeRefs.has(r.node_ref)))
      errors.push('start-territory G4/G5 refs differ from node_binding');
    for (const row of binding) {
      const node = bridgeRefs.get(row.node_ref);
      if (!node) continue;
      if (row.node_level === 'G4' ?
          (!Array.isArray(node.place_types) || (row.pf_id ? !node.place_types.includes(row.pf_id) : node.place_types.length !== 0)) :
          (node.place_type ?? '') !== row.pf_id)
        errors.push(`start-territory place_type mismatch ${row.node_ref}: ${row.pf_id}`);
    }
  }
  const seenPf = new Set();
  const seenGroups = new Set();
  const compositionPairs = new Set();
  const compositionSubjects = new Set();
  const scheduled = new Map();
  const scheduledBySeason = new Map();
  const subjectSeasons = new Map();
  const allScheduledSubjects = new Set();
  for (const row of scheduleRows) {
    const kind = row.occupation_ref ? 'occupation' : row.role_ref ? 'social_role' : 'household_member';
    const ref = row.occupation_ref || row.role_ref || 'child';
    const key = subjectKey(kind, ref);
    allScheduledSubjects.add(key);
    if (!subjectSeasons.has(key)) subjectSeasons.set(key, new Set());
    subjectSeasons.get(key).add(row.season);
    for (const block of JSON.parse(row.time_blocks)) if (block.location_ref && ['on_site', 'nearby'].includes(block.presence_state)) {
      if (!scheduled.has(block.location_ref)) scheduled.set(block.location_ref, new Set());
      scheduled.get(block.location_ref).add(key);
      if (!scheduledBySeason.has(block.location_ref)) scheduledBySeason.set(block.location_ref, new Map());
      if (!scheduledBySeason.get(block.location_ref).has(row.season)) scheduledBySeason.get(block.location_ref).set(row.season, new Set());
      scheduledBySeason.get(block.location_ref).get(row.season).add(key);
    }
  }
  if (scheduledBySeason.get('pf_ferry_landing')?.get('winter')?.size)
    errors.push('pf_ferry_landing: winter on_site/nearby schedule');
  for (const c of data.compositions) {
    if (!exact(c, ['pf_id', 'population_groups', 'scheduled_absences', ...(c.empty_reason === undefined ? [] : ['empty_reason'])])) { errors.push(`${c?.pf_id}: composition fields`); continue; }
    if (!bound.has(c.pf_id) || seenPf.has(c.pf_id)) errors.push(`${c.pf_id}: unknown/duplicate PF`);
    seenPf.add(c.pf_id);
    if (!Array.isArray(c.population_groups) || !Array.isArray(c.scheduled_absences)) { errors.push(`${c.pf_id}: groups/absences arrays`); continue; }
    if ((c.population_groups.length === 0) !== reasoned(c.empty_reason)) errors.push(`${c.pf_id}: empty_reason must be substantive exactly for empty composition`);
    const covered = new Set();
    const present = new Set();
    const absentSeasons = new Map();
    for (const g of c.population_groups) {
      const id = g?.group_id;
      if (!exact(g, ['group_id', 'group_kind', 'min_count', 'max_count', 'count_weights', 'weighted_subjects', 'household_profile_ref', 'source_refs', 'rule_ref', 'no_source', 'confidence'])) { errors.push(`${id}: group fields`); continue; }
      if (!named(id) || !id.startsWith(`${c.pf_id}.`) || seenGroups.has(id)) errors.push(`${id}: invalid/duplicate group_id`);
      seenGroups.add(id);
      if (!['workers', 'household', 'residents'].includes(g.group_kind)) errors.push(`${id}: group_kind`);
      if (!Number.isInteger(g.min_count) || g.min_count < 1 || !Number.isInteger(g.max_count) || g.max_count < g.min_count || !Array.isArray(g.count_weights) || g.count_weights.length !== g.max_count - g.min_count + 1 || g.count_weights.some((w) => !Number.isInteger(w) || w <= 0)) errors.push(`${id}: count range/weights`);
      if ((g.group_kind === 'household') !== named(g.household_profile_ref)) errors.push(`${id}: household_profile_ref required exactly for household`);
      if (g.household_profile_ref && !households.has(g.household_profile_ref)) errors.push(`${id}: unknown household profile`);
      if (!['A', 'B', 'C'].includes(g.confidence) || ['source_refs', 'rule_ref', 'no_source'].filter((k) => named(g[k])).length !== 1 || ['source_refs', 'rule_ref', 'no_source'].some((k) => typeof g[k] !== 'string')) errors.push(`${id}: confidence/basis XOR`);
      if (g.confidence !== 'C') errors.push(`${id}: fixed count inference requires confidence C`);
      if (g.group_kind === 'household') {
        const h = households.get(g.household_profile_ref);
        if (!h || !/^\d+$/.test(h.members_estimate_min) || !/^\d+$/.test(h.members_estimate_max) ||
            g.min_count !== Number(h.members_estimate_min) || g.max_count !== Number(h.members_estimate_max) ||
            !named(g.source_refs) || !g.source_refs.includes(g.household_profile_ref))
          errors.push(`${id}: household count requires matching numeric profile and source_ref`);
        if (h && (!Array.isArray(g.weighted_subjects) || !g.weighted_subjects.some((s) =>
          s.subject_kind === ({ occupation_linked: 'occupation', role_linked: 'social_role' })[h.household_type] &&
          s.subject_ref === h.pf_id)))
          errors.push(`${id}: household profile does not match weighted subject`);
      } else if (!((named(g.source_refs) && !named(g.rule_ref)) ||
          (['rule:one_per_work_role_v1', 'rule:one_per_resident_role_v1'].includes(g.rule_ref) &&
          (g.group_kind === 'workers') === (g.rule_ref === 'rule:one_per_work_role_v1'))) ||
          g.min_count !== 1 || g.max_count !== 1 || g.count_weights.length !== 1 || g.count_weights[0] !== 1)
        errors.push(`${id}: unsupported count basis/range/weights`);
      if (named(g.rule_ref) && g.confidence !== 'C') errors.push(`${id}: editorial rule requires confidence C`);
      if (named(g.source_refs)) for (const ref of g.source_refs.split(';').map((s) => s.trim())) {
        if (ref === g.household_profile_ref) continue;
        const book = /^book:(\d+) §(?:(.+) ¶)?(\d+)$/u.exec(ref);
        const paths = bookEvidence.get(`${book?.[1]}|${book?.[3]}`);
        if (!book || !paths || (book[2] && !paths.has(book[2]))) errors.push(`${id}: unresolved source_ref ${ref}`);
      }
      if (!Array.isArray(g.weighted_subjects) || !g.weighted_subjects.length) { errors.push(`${id}: weighted_subjects`); continue; }
      for (const s of g.weighted_subjects) {
        const sexFields = ['sex', 'sex_confidence', 'sex_reason', 'sex_source_refs'];
        const hasSex = sexFields.some((field) => Object.hasOwn(s, field));
        if (!exact(s, ['subject_kind', 'subject_ref', 'profile_ref', 'household_member_class', 'weight', ...(hasSex ? sexFields : [])])) { errors.push(`${id}: subject fields`); continue; }
        if (!({ occupation: occupations, social_role: roles })[s.subject_kind]?.has(s.subject_ref)) errors.push(`${id}: unknown subject ${s.subject_kind}:${s.subject_ref}`);
        if (!Number.isInteger(s.weight) || s.weight <= 0) errors.push(`${id}: subject weight`);
        if (s.household_member_class !== null && !['adult', 'child', 'elder'].includes(s.household_member_class)) errors.push(`${id}: household_member_class`);
        if (s.household_member_class !== null && !['household', 'residents'].includes(g.group_kind)) errors.push(`${id}: household_member_class requires household/residents`);
        if (s.profile_ref !== null && (!profiles.has(s.profile_ref) || profiles.get(s.profile_ref)?.[s.subject_kind === 'occupation' ? 'occupation_ref' : 'role_ref'] !== s.subject_ref)) errors.push(`${id}: unknown/mismatched profile ${s.profile_ref}`);
        if (hasSex) {
          if (!['male', 'female'].includes(s.sex) || s.sex_confidence !== 'C' || !reasoned(s.sex_reason) ||
              !Array.isArray(s.sex_source_refs) || !s.sex_source_refs.length || new Set(s.sex_source_refs).size !== s.sex_source_refs.length)
            errors.push(`${id}: invalid sex slot`);
          for (const ref of s.sex_source_refs ?? []) {
            const [file, sourceId, extra] = String(ref).split('#');
            if (extra || !sexSources.get(file)?.has(sourceId) || (file.endsWith('novgorod_occupations_v1_enriched.tsv') && sourceId !== s.subject_ref))
              errors.push(`${id}: unresolved sex_source_ref ${ref}`);
          }
        }
        const constraints = sexConstraints(s);
        if (!constraints.length && !hasSex) errors.push(`${id}: no sourced sex for ${s.subject_ref}`);
        if (hasSex && profiles.get(s.profile_ref)?.actor_applicability?.sex_category &&
            !profiles.get(s.profile_ref).actor_applicability.sex_category.includes(`nov_1200_1250_sex_category_${s.sex}`))
          errors.push(`${id}: sex incompatible with NPC actor applicability`);
        const values = [];
        for (const applicability of constraints) {
          const options = applicability?.sex_category;
          if (!Array.isArray(options) || !options.length || !Array.isArray(applicability.source_refs) ||
              !applicability.source_refs.length || !named(applicability.rule) ||
              options.some((option) => !['nov_1200_1250_sex_category_male', 'nov_1200_1250_sex_category_female'].includes(option))) {
            errors.push(`${id}: unsourced sex applicability ${s.subject_ref}`);
            continue;
          }
          if (hasSex && !options.includes(`nov_1200_1250_sex_category_${s.sex}`))
            errors.push(`${id}: sex incompatible with NPC actor applicability`);
          values.push(...options);
          if (!hasSex && options.length !== 1) errors.push(`${id}: ambiguous sex requires slot ${s.subject_ref}`);
        }
        if (!hasSex && new Set(values).size !== 1) errors.push(`${id}: conflicting sex applicability ${s.subject_ref}`);
        const key = subjectKey(s.subject_kind, s.subject_ref);
        if (covered.has(key)) errors.push(`${c.pf_id}: duplicate composition subject ${key}`);
        covered.add(key);
        present.add(key);
        compositionSubjects.add(key);
        compositionPairs.add(`${c.pf_id}|${key}`);
        if (!scheduled.get(c.pf_id)?.has(key) && !named(g.source_refs)) errors.push(`${id}: subject lacks D1 schedule at PF or source_refs ${key}`);
      }
    }
    for (const absence of c.scheduled_absences) {
      if (!exact(absence, ['subject_kind', 'subject_ref', 'reason', ...(absence.seasons === undefined ? [] : ['seasons'])]) || !reasoned(absence.reason)) { errors.push(`${c.pf_id}: absence fields/reason`); continue; }
      if (absence.seasons !== undefined && (!Array.isArray(absence.seasons) || !absence.seasons.length || new Set(absence.seasons).size !== absence.seasons.length || absence.seasons.some((season) => !seasons.includes(season)))) errors.push(`${c.pf_id}: invalid absence seasons`);
      if (absence.subject_kind !== 'household_member' && !({ occupation: occupations, social_role: roles })[absence.subject_kind]?.has(absence.subject_ref)) errors.push(`${c.pf_id}: unknown absent subject ${absence.subject_kind}:${absence.subject_ref}`);
      if (absence.subject_kind === 'household_member' && absence.subject_ref !== 'child') errors.push(`${c.pf_id}: unknown household member absence`);
      const key = subjectKey(absence.subject_kind, absence.subject_ref);
      if (covered.has(key) && absence.seasons === undefined) errors.push(`${c.pf_id}: subject both present and absent ${key}`);
      if (covered.has(`absence:${key}`)) errors.push(`${c.pf_id}: duplicate absence ${key}`);
      covered.add(`absence:${key}`);
      const activeSeasons = Array.isArray(absence.seasons) ? absence.seasons : seasons;
      absentSeasons.set(key, activeSeasons);
      if (absence.seasons !== undefined) for (const season of activeSeasons) {
        if (scheduledBySeason.get(c.pf_id)?.get(season)?.has(key)) errors.push(`${c.pf_id}: seasonal absence overlaps schedule ${key}:${season}`);
        if (!subjectSeasons.get(key)?.has(season)) errors.push(`${c.pf_id}: seasonal absence lacks subject schedule ${key}:${season}`);
        if (present.has(key) && ![...scheduledBySeason].some(([pf, bySeason]) => pf !== c.pf_id && bySeason.get(season)?.has(key)))
          errors.push(`${c.pf_id}: seasonal absence lacks alternate PF schedule ${key}:${season}`);
      }
      if (present.has(key)) for (const season of activeSeasons) if (scheduledBySeason.get(c.pf_id)?.get(season)?.has(key))
        errors.push(`${c.pf_id}: present subject absent during scheduled season ${key}:${season}`);
    }
    for (const key of present) for (const season of subjectSeasons.get(key) ?? []) {
      if (!scheduledBySeason.get(c.pf_id)?.get(season)?.has(key) && !absentSeasons.get(key)?.includes(season))
        errors.push(`${c.pf_id}: missing seasonal absence ${key}:${season}`);
    }
    for (const key of scheduled.get(c.pf_id) ?? []) {
      if (!covered.has(key) && !covered.has(`absence:${key}`)) errors.push(`${c.pf_id}: scheduled subject missing ${key}`);
    }
  }
  for (const pf of bound) if (!seenPf.has(pf)) errors.push(`${pf}: missing composition`);
  if (startTerritory) {
    const expectedSlots = new Set([
      'pf_ferry_landing|occupation:nov_occ_ferryman',
      'pf_ferry_landing|occupation:nov_occ_crossing_guard',
      'pf_outbuildings|occupation:nov_occ_household_servant',
      'pf_peasant_homestead|social_role:nov_role_smerd_householder',
      'pf_peasant_homestead|social_role:nov_role_household_mistress',
    ]);
    for (const slot of expectedSlots) if (!compositionPairs.has(slot)) errors.push(`missing start-territory slot ${slot}`);
    for (const slot of compositionPairs) if (!expectedSlots.has(slot)) errors.push(`unexpected start-territory slot ${slot}`);
  }
  const presenceSubjects = new Set();
  // Owners classify existing presence rows only; a D1-backed composition subject may have no row here.
  for (const row of people) {
    const key = `${row.scope_ref}|${subjectKey(row.subject_kind, row.subject_ref)}`;
    if (!['composition', 'presence_rule'].includes(row.creation_owner)) errors.push(`${key}: invalid creation_owner`);
    if (row.creation_owner === 'composition' && !compositionPairs.has(key)) errors.push(`${key}: composition owner has no matching group`);
    if (row.creation_owner === 'presence_rule') {
      presenceSubjects.add(subjectKey(row.subject_kind, row.subject_ref));
      if (compositionPairs.has(key)) errors.push(`${key}: presence_rule overlaps composition`);
    }
  }
  for (const row of derived.filter((r) => r.subject_kind !== 'category')) {
    if (compositionPairs.has(`${row.scope_ref}|${subjectKey(row.subject_kind, row.subject_ref)}`)) errors.push(`${row.pr_id}: derived presence overlaps composition`);
  }
  const actualGaps = new Set();
  for (const gap of data.never_created_gaps) {
    if (!exact(gap, ['subject_kind', 'subject_ref', 'reason']) || !reasoned(gap.reason)) { errors.push('invalid never_created gap'); continue; }
    const key = subjectKey(gap.subject_kind, gap.subject_ref);
    if (actualGaps.has(key)) errors.push(`duplicate never_created gap ${key}`);
    actualGaps.add(key);
  }
  const expectedGaps = new Set([...allScheduledSubjects].filter((key) => !compositionSubjects.has(key) && !presenceSubjects.has(key)));
  for (const key of expectedGaps) if (!actualGaps.has(key)) errors.push(`missing never_created gap ${key}`);
  for (const key of actualGaps) if (!expectedGaps.has(key)) errors.push(`unexpected never_created gap ${key}`);
  return [...new Set(errors)];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const arg = process.argv.indexOf('--start-territory');
  if (arg >= 0 && !process.argv[arg + 1]) throw new Error('--start-territory requires a JSON path');
  const original = readJson(AUTHORING);
  const bridge = arg >= 0 ? readJson(path.resolve(process.argv[arg + 1])) : null;
  const errors = checkPeopleComposition(original, bridge);
  for (const error of errors) console.error(error);
  if (process.argv.includes('--self-test')) {
    const probe = (name, diagnostic, change) => {
      const data = structuredClone(original);
      change(data);
      if (!checkPeopleComposition(data, bridge).some((error) => error.includes(diagnostic))) errors.push(`negative probe failed: ${name} (${diagnostic})`);
    };
    probe('missing PF', 'missing composition', (d) => d.compositions.pop());
    probe('unknown PF', 'unknown/duplicate PF', (d) => { d.compositions[0].pf_id = 'pf_unknown'; });
    const group = () => original.compositions.find((c) => c.population_groups.length);
    probe('unknown subject', 'unknown subject', (d) => { d.compositions.find((c) => c.pf_id === group().pf_id).population_groups[0].weighted_subjects[0].subject_ref = 'unknown'; });
    probe('unknown profile', 'unknown/mismatched profile', (d) => { d.compositions.find((c) => c.pf_id === group().pf_id).population_groups[0].weighted_subjects[0].profile_ref = 'unknown'; });
    const servant = (d) => d.compositions.find((c) => c.pf_id === 'pf_outbuildings').population_groups[0].weighted_subjects[0];
    probe('partial sex slot', 'subject fields', (d) => { delete servant(d).sex_reason; });
    probe('invalid sex', 'invalid sex slot', (d) => { servant(d).sex = 'unknown'; });
    probe('unresolved sex source', 'unresolved sex_source_ref', (d) => { servant(d).sex_source_refs[0] = 'data/novgorod-region/novgorod_occupations_v1_enriched.tsv#unknown'; });
    const femaleProfile = readJson(PROFILES).profiles.find((p) => p.actor_applicability?.sex_category?.includes('nov_1200_1250_sex_category_female') &&
      !p.actor_applicability.sex_category.includes('nov_1200_1250_sex_category_male'));
    if (!femaleProfile) errors.push('negative probe lacks female-only NPC profile');
    else probe('NPC sex applicability', 'sex incompatible with NPC actor applicability', (d) => { servant(d).profile_ref = femaleProfile.profile_id; });
    probe('servant sex ambiguity', 'ambiguous sex requires slot', (d) => {
      for (const key of ['sex', 'sex_confidence', 'sex_reason', 'sex_source_refs']) delete servant(d)[key];
    });
    {
      const badProfiles = structuredClone(readJson(PROFILES));
      badProfiles.subject_applicability.find((entry) => entry.subject_id === 'nov_occ_ferryman').actor_applicability.sex_category = [];
      if (!checkPeopleComposition(original, bridge, readCsv(PEOPLE), readCsv(DERIVED), badProfiles)
        .some((error) => error.includes('unsourced sex applicability nov_occ_ferryman')))
        errors.push('negative probe failed: tampered single-sex source');
    }
    {
      const badProfiles = structuredClone(readJson(PROFILES));
      badProfiles.subject_applicability = badProfiles.subject_applicability.filter((entry) => entry.subject_id !== 'nov_role_household_mistress');
      if (!checkPeopleComposition(original, bridge, readCsv(PEOPLE), readCsv(DERIVED), badProfiles)
        .some((error) => error.includes('no sourced sex for nov_role_household_mistress')))
        errors.push('negative probe failed: missing household mistress authoring');
    }
    probe('unknown household', 'unknown household profile', (d) => { const g = d.compositions.find((c) => c.pf_id === group().pf_id).population_groups[0]; g.group_kind = 'household'; g.household_profile_ref = 'unknown'; });
    probe('invalid weights', 'count range/weights', (d) => { d.compositions.find((c) => c.pf_id === group().pf_id).population_groups[0].count_weights = [0]; });
    probe('invalid range', 'count range/weights', (d) => { d.compositions.find((c) => c.pf_id === group().pf_id).population_groups[0].max_count = 0; });
    probe('invalid XOR', 'confidence/basis XOR', (d) => { d.compositions.find((c) => c.pf_id === group().pf_id).population_groups[0].no_source = 'duplicate'; });
    probe('editorial 1–99', 'unsupported count basis/range/weights', (d) => { const g = d.compositions.find((c) => c.pf_id === group().pf_id).population_groups[0]; g.max_count = 99; g.count_weights = Array(99).fill(1); });
    probe('unknown rule', 'unsupported count basis/range/weights', (d) => { d.compositions.find((c) => c.pf_id === group().pf_id).population_groups[0].rule_ref = 'rule:unknown'; });
    probe('editorial confidence A', 'editorial rule requires confidence C', (d) => { d.compositions.find((c) => c.pf_id === 'pf_ferry_landing').population_groups[0].confidence = 'A'; });
    probe('duplicate subject on PF', 'duplicate composition subject', (d) => { const c = d.compositions.find((x) => x.pf_id === 'pf_ferry_landing'); c.population_groups[1].weighted_subjects[0] = structuredClone(c.population_groups[0].weighted_subjects[0]); });
    probe('composition without D1 or source', 'subject lacks D1 schedule at PF or source_refs', (d) => { const c = d.compositions.find((x) => x.pf_id === 'pf_ferry_landing'); c.population_groups[0].weighted_subjects[0].subject_ref = 'nov_occ_potter'; });
    probe('missing never-created gap', 'missing never_created gap', (d) => { d.never_created_gaps.pop(); });
    probe('unresolved book paragraph', 'unresolved source_ref', (d) => { d.compositions.find((c) => c.pf_id === 'pf_peasant_homestead').population_groups.find((g) => g.source_refs).source_refs = 'book:622242 §999999'; });
    probe('wrong book section', 'unresolved source_ref', (d) => { d.compositions.find((c) => c.pf_id === 'pf_peasant_homestead').population_groups.find((g) => g.source_refs).source_refs = 'book:622242 §wrong section ¶519'; });
    probe('worker with household class', 'household_member_class requires household/residents', (d) => { d.compositions.find((c) => c.pf_id === 'pf_ferry_landing').population_groups[0].weighted_subjects[0].household_member_class = 'adult'; });
    probe('vague gap reason', 'invalid never_created gap', (d) => { d.never_created_gaps[0].reason = 'too vague'; });
    probe('one-word gap reason', 'invalid never_created gap', (d) => { d.never_created_gaps[0].reason = 'unsubstantiated'; });
    probe('missing-data gap reason', 'invalid never_created gap', (d) => { d.never_created_gaps[0].reason = 'Нет данных'; });
    probe('no-reason gap placeholder', 'invalid never_created gap', (d) => { d.never_created_gaps[0].reason = 'Нет сведений о причине'; });
    probe('vague absence reason', 'absence fields/reason', (d) => { d.compositions.find((c) => c.scheduled_absences.length).scheduled_absences[0].reason = 'too vague'; });
    probe('missing-data absence reason', 'absence fields/reason', (d) => { d.compositions.find((c) => c.scheduled_absences.length).scheduled_absences[0].reason = 'Нет данных'; });
    probe('missing-data empty reason', 'empty_reason', (d) => { d.compositions.find((c) => !c.population_groups.length).empty_reason = 'Нет данных'; });
    {
      const people = readCsv(PEOPLE);
      if (checkPeopleComposition(original, bridge, people.filter((row) => row.creation_owner !== 'composition')).length)
        errors.push('positive probe failed: composition groups without presence authoring rows');
      for (const ref of ['nov_occ_crossing_guard', 'nov_role_household_mistress'])
        if (people.some((row) => row.subject_ref === ref)) errors.push(`positive probe failed: ${ref} unexpectedly has a presence authoring row`);
      const badOwner = structuredClone(people);
      badOwner[0].creation_owner = 'invalid';
      if (!checkPeopleComposition(original, bridge, badOwner).some((e) => e.includes('invalid creation_owner'))) errors.push('negative probe failed: invalid creation_owner');
      const overlap = structuredClone(people);
      overlap.find((r) => r.scope_ref === 'pf_ferry_landing').creation_owner = 'presence_rule';
      if (!checkPeopleComposition(original, bridge, overlap).some((e) => e.includes('presence_rule overlaps composition'))) errors.push('negative probe failed: wrong owner overlap');
    }
    probe('unspecified household profile', 'household count requires matching numeric profile', (d) => { const g = d.compositions.find((c) => c.pf_id === group().pf_id).population_groups[0]; g.group_kind = 'household'; g.household_profile_ref = 'hh_occ_nov_occ_ferryman'; g.source_refs = 'hh_occ_nov_occ_ferryman'; g.rule_ref = ''; });
    {
      const d = structuredClone(original);
      const g = d.compositions.find((c) => c.pf_id === 'pf_ferry_landing').population_groups[0];
      g.group_kind = 'household';
      g.household_profile_ref = 'hh_role_nov_role_boyar';
      g.min_count = 15;
      g.max_count = 24;
      g.count_weights = Array(10).fill(1);
      g.source_refs = 'hh_role_nov_role_boyar';
      g.rule_ref = '';
      if (!checkPeopleComposition(d, bridge).some((e) => e.includes('household profile does not match weighted subject')))
        errors.push('negative probe failed: foreign household profile');
    }
    probe('missing scheduled subject', 'scheduled subject missing', (d) => { d.compositions.find((c) => c.pf_id === 'pf_bog').scheduled_absences = []; });
    probe('missing winter ferryman absence', 'missing seasonal absence', (d) => { d.compositions.find((c) => c.pf_id === 'pf_ferry_landing').scheduled_absences.shift(); });
    probe('unscoped winter absence', 'subject both present and absent', (d) => { delete d.compositions.find((c) => c.pf_id === 'pf_ferry_landing').scheduled_absences[0].seasons; });
    probe('invalid absence season', 'invalid absence seasons', (d) => { d.compositions.find((c) => c.pf_id === 'pf_ferry_landing').scheduled_absences[0].seasons = ['winter', 'winter']; });
    {
      const schedules = readCsv(SCHEDULES);
      const winter = schedules.find((row) => row.occupation_ref === 'nov_occ_ferryman' && row.season === 'winter');
      winter.time_blocks = JSON.stringify(JSON.parse(winter.time_blocks).map((block) =>
        block.location_ref === 'pf_winter_ice_crossing' ? { ...block, location_ref: '' } : block));
      if (!checkPeopleComposition(original, bridge, readCsv(PEOPLE), readCsv(DERIVED), readJson(PROFILES), schedules)
        .some((error) => error.includes('seasonal absence lacks alternate PF schedule')))
        errors.push('negative probe failed: seasonal absence without alternate PF schedule');
    }
    {
      const schedules = readCsv(SCHEDULES);
      const winter = schedules.find((row) => row.occupation_ref === 'nov_occ_ferryman' && row.season === 'winter');
      const blocks = JSON.parse(winter.time_blocks);
      blocks.find((block) => block.presence_state === 'on_site').location_ref = 'pf_ferry_landing';
      winter.time_blocks = JSON.stringify(blocks);
      if (!checkPeopleComposition(original, bridge, readCsv(PEOPLE), readCsv(DERIVED), readJson(PROFILES), schedules)
        .some((error) => error.includes('winter on_site/nearby schedule')))
        errors.push('negative probe failed: winter subject at ferry landing');
    }
    if (bridge) {
      const nodes = bridge.g5.filter((node) => node.place_type);
      const other = nodes.find((node) => node.place_type !== nodes[0].place_type);
      [nodes[0].place_type, other.place_type] = [other.place_type, nodes[0].place_type];
      if (!checkPeopleComposition(original, bridge).some((e) => e.includes('place_type mismatch'))) errors.push('negative probe failed: swapped bridge place_type');
      [nodes[0].place_type, other.place_type] = [other.place_type, nodes[0].place_type];
    }
  }
  if (!errors.length) console.log(`PASS people composition: ${original.compositions.length} PF, ${original.compositions.reduce((n, c) => n + c.population_groups.length, 0)} groups${process.argv.includes('--self-test') ? `, ${bridge ? 42 : 41} negative probes` : ''}`);
  process.exitCode = errors.length ? 1 : 0;
}
