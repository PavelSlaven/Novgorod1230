// Acceptance + integrity checks for fauna-mammals-birds (catalog acceptance_ru of fauna_mammals and fauna_birds).
// Exit code 1 on any hard failure; writes validation-report.json.
'use strict';
const fs = require('fs');
const path = require('path');
const DOM = path.resolve(__dirname, '..');
const GB = path.resolve(DOM, '..');
const REPO = path.resolve(GB, '../../../..');
const MAIN = process.env.NOVGOROD_MAIN || REPO;
const { climbingNest } = require('./src/hunting.cjs');

function readCsv(f) {
  const t = fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h, ...rest] = rows; return rest.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
const F = (n) => path.join(DOM, 'fauna', n);
const mammals = readCsv(F('mammals.csv')), birds = readCsv(F('birds.csv')), pres = readCsv(F('wild_habitat_presence.csv'));
const siblingFauna = path.join(GB, 'fauna-fish-invertebrates-livestock/fauna');
const herps = readCsv(path.join(siblingFauna, 'invertebrates_herps.csv'));
const fish = readCsv(path.join(siblingFauna, 'fish.csv'));
const siblingPres = readCsv(path.join(GB, 'fauna-fish-invertebrates-livestock/fauna/fauna_presence.csv'));
const siblingDeny = readCsv(path.join(GB, 'fauna-fish-invertebrates-livestock/fauna/anachronism_denylist_fauna.csv'));
const checkedTaxa = [...mammals, ...birds, ...herps, ...fish];
const checkedPresence = [...pres, ...siblingPres];
const huntingMethods = readCsv(F('hunting_methods.csv')), huntingTenure = readCsv(F('hunting_tenure_defaults.csv'));
const cats = new Set(readCsv(F('fauna_categories.csv')).map((r) => r.category_id));
const srcIds = new Set(readCsv(F('sources.csv')).map((r) => r.source_id));
const checks = readCsv(F('taxa_checks.csv'));
const pfs = new Set(readCsv(path.join(GB, 'places-binding/places/place_families.csv')).map((r) => r.pf_id));
const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
const LEVELS = { rare: 1, contextual: 2, common: 4, ubiquitous: 8 };
const errors = [], warnings = [];
const err = (m) => errors.push(m), warn = (m) => warnings.push(m);
// A deliberately small editorial guard against context leaking into narrator sound text.
const SOUND_CONTEXT = /(?:^|[^а-яё])(?:зим|весн|лет|осен|январ|феврал|март|апрел|ма[йяею]|июн|июл|август|сентябр|октябр|ноябр|декабр|лес|елов|ель|крон|гнезд|луг|болот|рек|озер|берег|вод[еуы]|пол[еяю]|неб|крыш|дерев|двор|трав|куст|трост|опуш|ноч|вечер|утр|сумерк|зар[еяю]|рассвет|дн[еёяю]|полет|полёт|взлет|взлёт|прилет|прилёт|ток|охот)[а-яё]*(?=$|[^а-яё])/i;
function soundIssue(sound, description, audibleSeasons) {
  if (!sound || !sound.trim()) return audibleSeasons && !/(?:молчалив|безмолвен|редко слышен)/i.test(description) ? 'empty' : '';
  const match = sound.match(SOUND_CONTEXT);
  return match ? `context word ${match[0].trim()}` : '';
}
function contextualFaunaIssues(mammalRows, birdRows, presenceRows) {
  const issues = [];
  const mole = mammalRows.find((row) => row.fa_id === 'fa_m_mole');
  const moleFlood = presenceRows.filter((row) => row.fa_id === 'fa_m_mole' && row.season === 'spring' && row.pf_id === 'pf_floodplain_meadow');
  if (!mole || !mole.source_refs.includes('book:498801 §406') || !mole.source_refs.includes('book:756203 §289')) issues.push('mole source refs');
  if (moleFlood.length !== 1 || moleFlood[0].frequency_class !== 'rare' || moleFlood[0].weight !== '1' ||
      !moleFlood[0].source_refs.includes('book:498801 §406') || !moleFlood[0].source_refs.includes('book:756203 §289')) issues.push('mole spring floodplain frequency');

  const mallard = birdRows.find((row) => row.fa_id === 'fa_b_mallard');
  if (!mallard || mallard.season_presence_conditions !== 'winter=open_water_only') issues.push('mallard winter condition');
  if (presenceRows.some((row) => row.fa_id === 'fa_b_mallard' && row.season === 'winter')) issues.push('mallard winter place-family row');
  return issues;
}
function reducedTaxaIssues(checkRows, birdRows) {
  const issues = [];
  const row = checkRows.find((check) => check.check_id === 'fchk_026');
  if (!row || row.verdict !== 'included_reduced') return ['missing fchk_026 included_reduced'];
  const birdsById = new Map(birdRows.map((bird) => [bird.fa_id, bird]));
  for (const id of row.fa_ids.split(';').filter(Boolean)) {
    const bird = birdsById.get(id);
    if (!bird) issues.push('fchk_026 unresolved bird ' + id);
    else if (['common', 'ubiquitous'].includes(bird.base_frequency_class) || bird.presence_1230_confidence !== 'C') issues.push('fchk_026 bird not reduced ' + id);
  }
  return issues;
}
function taxaCheckIssues(checkRows, taxonRows, presenceRows, denyRows) {
  const issues = [];
  const verdicts = new Set(['excluded_anachronism','excluded_doubtful','excluded_unattested','included_rare','included_rural_contextual','included_rural_only','included_reduced']);
  const taxaById = new Map(taxonRows.map((row) => [row.fa_id, row]));
  for (const check of checkRows) {
    if (!verdicts.has(check.verdict)) {
      issues.push('unknown taxa verdict ' + check.verdict);
      continue;
    }
    if (check.basis === 'analogy' && !check.derivation) issues.push('analogy without derivation ' + check.check_id);
    const ids = check.fa_ids.split(';').filter(Boolean);
    if (check.verdict.startsWith('excluded_')) {
      const latin = check.name_lat.trim().toLowerCase();
      const matchingTaxa = taxonRows.filter((row) => row.name_lat.trim().toLowerCase() === latin);
      const conflictingTaxa = matchingTaxa.filter((row) => row.status === 'candidate');
      if (conflictingTaxa.length) issues.push('excluded taxon present ' + check.check_id + ': ' + conflictingTaxa.map((row) => row.fa_id).join(','));
      const conflictingIds = new Set([...ids, ...matchingTaxa.map((row) => row.fa_id)]);
      if (presenceRows.some((row) => conflictingIds.has(row.fa_id))) issues.push('excluded taxon presence ' + check.check_id);
      continue;
    }
    if (!ids.length) issues.push('included check without fa_ids ' + check.check_id);
    for (const id of ids) {
      if (!taxaById.has(id)) issues.push('included taxon unresolved ' + check.check_id + ': ' + id);
      const taxonPresence = presenceRows.filter((row) => row.fa_id === id);
      if (!taxonPresence.length) issues.push('included taxon without presence ' + check.check_id + ': ' + id);
      if (check.verdict === 'included_rare' && taxonPresence.some((row) => LEVELS[row.frequency_class] > LEVELS.rare))
        issues.push('included_rare frequency above rare ' + check.check_id + ': ' + id);
    }
  }
  const brownRat = checkRows.find((row) => row.name_lat === 'Rattus norvegicus');
  const brownRatDenied = brownRat && brownRat.verdict === 'excluded_anachronism' && denyRows.some((row) =>
    row.scope === 'anachronism' && row.patterns.split(' | ').includes(brownRat.name_lat));
  if (!brownRatDenied) issues.push('brown rat denylist');
  return issues;
}
const MASTER_ITEMS = fs.readFileSync(path.join(REPO, 'data/world-catalogs/novgorod/sources/master-archive-v1/data/canonical/material_items.csv'), 'utf8');
const EVIDENCE_ROOT = path.resolve(GB, '..', 'sources');
function evidenceRefIssues(refs) {
  const issues = [];
  for (const ref of (refs || '').split(';').filter(x => x.startsWith('books-evidence-v1/'))) {
    const m = ref.match(/^(books-evidence-v1\/.+\.csv)#L(\d+)$/);
    if (!m) { issues.push('bad evidence ref ' + ref); continue; }
    const file = path.join(EVIDENCE_ROOT, m[1]);
    if (!fs.existsSync(file)) { issues.push('missing evidence file ' + ref); continue; }
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    if (!lines[+m[2] - 1]) issues.push('missing evidence line ' + ref);
  }
  return issues;
}
function huntingDataIssues(methodRows, tenureRows, mammalRows) {
  const issues = [];
  const ids = new Set([...mammalRows, ...birds, ...herps].map(r => r.fa_id));
  const required = new Set(['hm_snare','hm_wooden_trap_klyapets','hm_wooden_trap_very_small','hm_deadfall','hm_bird_net_pereves','hm_bird_snare','hm_birdlime','hm_bird_bow_trap','hm_bow','hm_hunting_self_shooter','hm_spear','hm_pit_trap','hm_ungulate_noose','hm_drive_hunt','hm_dogs','hm_dog_baiting','hm_falconry','hm_hawking','hm_baited_trap','hm_smoke_burrow','hm_dig_burrow','hm_hand_or_stick_small_fauna','hm_collect_bird_eggs_climbing','hm_collect_bird_eggs_ground','hm_collect_bird_eggs_winter']);
  const sizeClasses = new Set(['bird_egg','bird_very_small','bird_small','bird_large','mammal_very_small','mammal_small','mammal_medium','mammal_large','amphibian_very_small','reptile_very_small']);
  const bases = new Set(['sourced','sourced_tool_editorial_applicability','sourced_class_editorial_applicability','logical_necessity','editorial']);
  const seen = new Set();
  for (const r of methodRows) {
    if (seen.has(r.hm_id)) issues.push('duplicate method ' + r.hm_id); seen.add(r.hm_id);
    if (!['direct','set_and_check'].includes(r.setup_mode)) issues.push('bad setup_mode ' + r.hm_id);
    if (!r.applicable_size_classes || !r.seasons) issues.push('incomplete applicability ' + r.hm_id);
    if (!bases.has(r.basis)) issues.push('bad basis ' + r.hm_id);
    if (r.basis.startsWith('sourced') && !r.source_refs) issues.push('sourced method without source ' + r.hm_id);
    if (!r.derivation) issues.push('missing derivation ' + r.hm_id);
    if (!r.anachronism_check || !r.anachronism_check.startsWith('passed')) issues.push('missing anachronism check ' + r.hm_id);
    for (const t of (r.applicable_taxa || '').split(';').filter(Boolean)) if (!ids.has(t)) issues.push('unknown method taxon ' + t);
    for (const c of (r.applicable_categories || '').split(';').filter(Boolean)) if (!cats.has(c)) issues.push('unknown method category ' + c);
    for (const s of (r.applicable_size_classes || '').split(';').filter(Boolean)) if (!sizeClasses.has(s)) issues.push('unknown method size ' + s);
    for (const s of (r.seasons || '').split(';').filter(Boolean)) if (!SEASONS.includes(s)) issues.push('unknown method season ' + s);
    for (const f of (r.resource_family_refs || '').split(';').filter(Boolean)) if (!['F10','F29','F30'].includes(f)) issues.push('unknown resource family ' + f);
    for (const tool of (r.tool_refs || '').split(';').filter(Boolean)) {
      if (!MASTER_ITEMS.includes(tool + ',')) issues.push('unknown method tool ' + tool);
      if (/hnt00(10|21|22|24|28)$/.test(tool)) issues.push('product or D-rated item used as method tool ' + tool);
      if (!r.derivation.includes(tool)) issues.push('tool missing from derivation ' + tool + ' in ' + r.hm_id);
    }
    issues.push(...evidenceRefIssues(r.source_refs));
  }
  for (const id of required) if (!seen.has(id)) issues.push('missing method ' + id);
  const localNest = (row) => Boolean(row.nesting) && (
    ['breeding', 'resident'].some((state) => [row.migration_spring, row.migration_summer].includes(state))
    || (row.migration_winter === 'irregular' && /гнездится.*зимой/i.test(row.nesting))
  );
  const isWinterNest = (row) => row.migration_winter === 'irregular' && /гнездится.*зимой/i.test(row.nesting);
  const isClimbingNest = (row) => climbingNest(row.nesting);
  const climbingExamples = ['гнездо на старой сосне', 'в нишах стволов', 'в старых вороньих гнёздах', 'в старых гнёздах хищников'];
  const accessibleExamples = ['на земле в ельниках', 'под стрехами, в щелях построек', 'закрытые гнёзда под карнизами'];
  if (climbingExamples.some((nesting) => !climbingNest(nesting)) || accessibleExamples.some(climbingNest))
    issues.push('bird egg climbing nesting classifier');
  const expectedEggTaxa = (predicate) => new Set(birds.filter((row) => localNest(row) && predicate(row)).map((row) => row.fa_id));
  const actualEggTaxa = (id) => new Set((methodRows.find((row) => row.hm_id === id)?.applicable_taxa || '').split(';').filter(Boolean));
  const sameSet = (a, b) => a.size === b.size && [...a].every((id) => b.has(id));
  const expectedWinter = expectedEggTaxa(isWinterNest);
  const expectedClimbing = expectedEggTaxa((row) => !isWinterNest(row) && isClimbingNest(row));
  const expectedGeneral = expectedEggTaxa((row) => !isWinterNest(row) && !isClimbingNest(row));
  const eggMethods = [
    ['hm_collect_bird_eggs_climbing', 'spring;summer', expectedClimbing],
    ['hm_collect_bird_eggs_ground', 'spring;summer', expectedGeneral],
    ['hm_collect_bird_eggs_winter', 'winter', expectedWinter],
  ];
  for (const [id, seasons, expected] of eggMethods) {
    const row = methodRows.find((item) => item.hm_id === id);
    if (!row || row.applicable_categories || row.resource_family_refs !== 'F10' || !sameSet(actualEggTaxa(id), expected))
      issues.push('bird egg method property-derived taxa mismatch ' + id);
    if (row?.seasons !== seasons) issues.push('bird egg method season mismatch ' + id);
  }
  const methodTaxa = eggMethods.flatMap(([id]) => [...actualEggTaxa(id)]);
  if (new Set(methodTaxa).size !== methodTaxa.length || new Set(methodTaxa).size !== birds.filter(localNest).length)
    issues.push('bird egg methods must partition local nesting taxa');
  const groundKinds = new Set();
  for (const r of tenureRows) {
    if (groundKinds.has(r.ground_kind)) issues.push('duplicate ground kind ' + r.ground_kind); groundKinds.add(r.ground_kind);
    if (!pfs.has(r.place_family_ref)) issues.push('unknown tenure PF ' + r.place_family_ref);
    if (!['F29','F30'].includes(r.family_id) || r.tenure !== 'rights_holder') issues.push('bad hunting tenure ' + r.ground_kind);
    if (r.closed_months) issues.push('unsupported closed months ' + r.ground_kind);
    issues.push(...evidenceRefIssues(r.source_refs));
  }
  for (const id of ['lovishcha','beaver_runs','perevesishcha']) if (!groundKinds.has(id)) issues.push('missing ground kind ' + id);
  return issues;
}
function peltIssues(rows) {
  const issues = [];
  const required = new Set(['fa_m_wolf','fa_m_red_fox','fa_m_lynx','fa_m_wolverine','fa_m_pine_marten','fa_m_sable','fa_m_stoat','fa_m_polecat','fa_m_european_mink','fa_m_otter','fa_m_beaver','fa_m_red_squirrel','fa_m_mountain_hare','fa_m_mole','fa_m_water_vole','fa_m_flying_squirrel']);
  for (const id of required) {
    const r = rows.find(x => x.fa_id === id);
    if (!r || !r.pelt_prime_months) { issues.push('missing pelt calendar ' + id); continue; }
    if (r.pelt_calendar_basis !== 'editorial' || r.pelt_calendar_source_refs) issues.push('pelt months not explicitly source-free editorial ' + id);
    const prime = new Set(r.pelt_prime_months.split(';').map(Number));
    if ([...prime].some(m => !(m >= 1 && m <= 12))) issues.push('bad prime month ' + id);
    const quality = new Map((r.pelt_quality_by_month || '').split(';').filter(Boolean).map(x => x.split('=').map((v, i) => i ? v : +v)));
    if (quality.size !== 12 || [...quality.keys()].some(m => !(m >= 1 && m <= 12)) || [...quality.values()].some(v => !['winter','transitional','summer'].includes(v))) issues.push('bad 12-month quality ' + id);
    if ([...prime].some(m => quality.get(m) !== 'winter')) issues.push('prime month not winter quality ' + id);
    issues.push(...evidenceRefIssues(r.pelt_qualitative_source_refs));
  }
  return issues;
}
if (process.argv.includes('--self-test')) {
  for (const bad of ['весной «ки-ки»', 'в июне свист', 'над озером крик', 'ночью трель', 'на току щелчки']) if (!soundIssue(bad, 'крик', 'spring')) throw new Error('sound negative probe passed: ' + bad);
  if (!soundIssue('', 'звонкая песня', 'spring')) throw new Error('ordinary voice without sound passed');
  for (const good of ['громкое «ки-ки»', 'сухая трель и свист']) if (soundIssue(good, 'крик', 'spring')) throw new Error('sound positive probe failed: ' + good);
  for (const [description, seasons] of [['почти молчалив', ''], ['редко слышен', 'winter'], ['почти безмолвен', 'spring;summer']]) if (soundIssue('', description, seasons)) throw new Error('silent voice without sound failed: ' + description);
  if (contextualFaunaIssues(mammals, birds, pres).length) throw new Error('contextual fauna positive probe failed');
  if (reducedTaxaIssues(checks, birds).length) throw new Error('reduced taxa positive probe failed: ' + reducedTaxaIssues(checks, birds).join(' | '));
  if (taxaCheckIssues(checks, checkedTaxa, checkedPresence, siblingDeny).length) throw new Error('taxa checks positive probe failed: ' + taxaCheckIssues(checks, checkedTaxa, checkedPresence, siblingDeny).join(' | '));
  if (!taxaCheckIssues(checks.map((row, i) => i ? row : { ...row, verdict: 'unknown_probe' }), checkedTaxa, checkedPresence, siblingDeny).some((issue) => issue.includes('unknown taxa verdict'))) throw new Error('taxa verdict negative probe passed');
  const excludedProbe = checks.find((row) => row.name_lat === 'Desmana moschata');
  const conflictingProbe = { fa_id: 'negative_probe_excluded_taxon', name_lat: excludedProbe.name_lat, status: 'candidate' };
  if (!taxaCheckIssues(checks, [...checkedTaxa, conflictingProbe], checkedPresence, siblingDeny).some((issue) => issue.includes('excluded taxon present'))) throw new Error('cross-group excluded taxon negative probe passed');
  const blackRatCheck = checks.find((row) => row.name_lat === 'Rattus rattus');
  const rareId = blackRatCheck.fa_ids.split(';')[0];
  const commonRareProbe = checkedPresence.map((row) => row.fa_id === rareId ? { ...row, frequency_class: 'common' } : row);
  if (!taxaCheckIssues(checks, checkedTaxa, commonRareProbe, siblingDeny).some((issue) => issue.includes('included_rare frequency above rare'))) throw new Error('included rare frequency negative probe passed');
  if (!taxaCheckIssues(checks.map((row) => row.basis === 'analogy' ? { ...row, derivation: '' } : row), checkedTaxa, checkedPresence, siblingDeny).some((issue) => issue.includes('analogy without derivation'))) throw new Error('analogy derivation negative probe passed');
  if (!taxaCheckIssues(checks, checkedTaxa, checkedPresence, siblingDeny.filter((row) => !row.patterns.split(' | ').includes('Rattus norvegicus'))).includes('brown rat denylist')) throw new Error('brown rat denylist negative probe passed');
  const commonRedwing = birds.map((row) => row.fa_id === 'fa_b_redwing' ? { ...row, base_frequency_class: 'common' } : row);
  if (!reducedTaxaIssues(checks, commonRedwing).some((issue) => issue.includes('fa_b_redwing'))) throw new Error('reduced taxa negative probe passed');
  const winterMallard = { ...pres.find((row) => row.fa_id === 'fa_b_mallard'), presence_id: 'negative_probe_mallard_winter', season: 'winter' };
  if (!contextualFaunaIssues(mammals, birds, [...pres, winterMallard]).includes('mallard winter place-family row')) throw new Error('mallard winter negative probe passed');
  const commonMole = pres.map((row) => row.fa_id === 'fa_m_mole' && row.season === 'spring' && row.pf_id === 'pf_floodplain_meadow' ? { ...row, frequency_class: 'common', weight: '4' } : row);
  if (!contextualFaunaIssues(mammals, birds, commonMole).includes('mole spring floodplain frequency')) throw new Error('mole flood negative probe passed');
  if (huntingDataIssues(huntingMethods, huntingTenure, mammals).length) throw new Error('hunting data positive probe failed: ' + huntingDataIssues(huntingMethods, huntingTenure, mammals).join(' | '));
  if (!huntingDataIssues(huntingMethods.map(r => r.hm_id === 'hm_collect_bird_eggs_climbing' ? { ...r, applicable_taxa: 'fa_b_mallard' } : r), huntingTenure, mammals).some(x => x.includes('property-derived taxa mismatch'))) throw new Error('bird egg ownership negative probe passed');
  if (!huntingDataIssues(huntingMethods.map(r => r.hm_id === 'hm_collect_bird_eggs_winter' ? { ...r, seasons: 'spring;summer' } : r), huntingTenure, mammals).some(x => x.includes('season mismatch'))) throw new Error('bird egg winter season negative probe passed');
  if (!huntingDataIssues(huntingMethods.map((r, i) => i ? r : { ...r, setup_mode: 'instant' }), huntingTenure, mammals).some(x => x.includes('bad setup_mode'))) throw new Error('hunting setup negative probe passed');
  if (!huntingDataIssues(huntingMethods.map((r, i) => i ? r : { ...r, tool_refs: 'n1230:material_item:hnt0022' }), huntingTenure, mammals).some(x => x.includes('D-rated'))) throw new Error('hunting D-rated tool negative probe passed');
  if (!huntingDataIssues(huntingMethods.map((r, i) => i ? r : { ...r, derivation: '' }), huntingTenure, mammals).some(x => x.includes('missing derivation'))) throw new Error('hunting derivation negative probe passed');
  if (!huntingDataIssues(huntingMethods.map((r, i) => i ? r : { ...r, anachronism_check: 'unchecked' }), huntingTenure, mammals).some(x => x.includes('anachronism'))) throw new Error('hunting anachronism negative probe passed');
  if (!huntingDataIssues(huntingMethods.map((r, i) => i ? r : { ...r, resource_family_refs: 'F99' }), huntingTenure, mammals).some(x => x.includes('resource family'))) throw new Error('hunting resource family negative probe passed');
  if (!huntingDataIssues(huntingMethods, huntingTenure.map((r, i) => i ? r : { ...r, tenure: 'common' }), mammals).some(x => x.includes('bad hunting tenure'))) throw new Error('hunting tenure negative probe passed');
  if (peltIssues(mammals).length) throw new Error('pelt calendar positive probe failed: ' + peltIssues(mammals).join(' | '));
  if (!peltIssues(mammals.map(r => r.fa_id === 'fa_m_red_squirrel' ? { ...r, pelt_quality_by_month: '1=winter' } : r)).some(x => x.includes('bad 12-month quality'))) throw new Error('pelt calendar negative probe passed');
  console.log('fauna self-test ok');
  process.exit(0);
}
const phase = require('./validate-phase.cjs');
const phaseTable = phase.csv(F('phase_activity.csv'));
errors.push(...phase.validate('fauna-mammals-birds', phaseTable.rows, phaseTable.header));
errors.push(...contextualFaunaIssues(mammals, birds, pres));
errors.push(...reducedTaxaIssues(checks, birds));
errors.push(...taxaCheckIssues(checks, checkedTaxa, checkedPresence, siblingDeny));

// ids
const all = [...mammals, ...birds]; const ids = new Set();
for (const t of all) { if (ids.has(t.fa_id)) err('duplicate fa_id ' + t.fa_id); ids.add(t.fa_id); if (!/^fa_[mb]_[a-z0-9_]+$/.test(t.fa_id)) err('bad fa_id ' + t.fa_id); if (!cats.has(t.category_ref)) err('category_ref missing ' + t.category_ref); if (!t.source_refs) err('no source_refs ' + t.fa_id); if (t.status !== 'candidate') err('status not candidate ' + t.fa_id); }
const pids = new Set();
for (const p of pres) {
  if (pids.has(p.presence_id)) err('dup presence ' + p.presence_id); pids.add(p.presence_id);
  if (!ids.has(p.fa_id)) err('presence fa_id unknown ' + p.fa_id);
  if (!pfs.has(p.pf_id)) err('pf_id not in place_families ' + p.pf_id);
  if (!SEASONS.includes(p.season)) err('bad season ' + p.season);
  if (LEVELS[p.frequency_class] !== +p.weight) err('weight mismatch ' + p.presence_id);
  if (!cats.has(p.category_ref)) err('presence category missing ' + p.category_ref);
}
// source ids resolve
const srcTok = (s) => s.split(';').map((x) => x.split('#')[0]).filter((x) => x.startsWith('SRC_'));
for (const r of [...all, ...pres, ...checks]) for (const s of srcTok(r.source_refs || '')) if (!srcIds.has(s)) err('unknown source ' + s + ' in ' + (r.fa_id || r.presence_id || r.check_id));
for (const r of huntingMethods) for (const s of srcTok(r.source_refs || '')) if (!srcIds.has(s)) err('unknown source ' + s + ' in ' + r.hm_id);
for (const r of mammals) for (const s of srcTok(r.pelt_qualitative_source_refs || '')) if (!srcIds.has(s)) err('unknown pelt source ' + s + ' in ' + r.fa_id);

// WK refs resolve against WK production-v1
const wkDir = path.join(MAIN, 'data/world-catalogs/novgorod/world-knowledge/production-v1');
const wk = new Set();
let wkFiles = [];
try {
  if (!fs.statSync(wkDir).isDirectory()) throw new Error('not a directory');
  wkFiles = fs.readdirSync(wkDir).filter((x) => x.endsWith('.json'));
  if (!wkFiles.length) err('WK index has no JSON files: ' + wkDir);
} catch (e) {
  err('WK directory unavailable: ' + wkDir + ' (' + e.message + ')');
}
for (const f of wkFiles) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(wkDir, f), 'utf8'));
    if (!j || typeof j !== 'object' || Array.isArray(j)) throw new Error('expected an object');
    for (const c of j.concepts || []) if (c?.concept_ref) wk.add(c.concept_ref);
    for (const c of j.claims || []) if (c?.claim_ref) wk.add(c.claim_ref);
  } catch (e) {
    err('WK file unreadable or invalid: ' + f + ' (' + e.message + ')');
  }
}
if (!wk.size) err('WK index has no concept or claim refs: ' + wkDir);
for (const t of all) for (const r of (t.wk_refs || '').split(';').filter(Boolean)) if (!wk.has(r)) err('WK ref not found ' + r + ' (' + t.fa_id + ')');
// MASTER hunting refs resolve
for (const t of mammals) for (const r of (t.hunting_method_refs || '').split(';').filter(Boolean)) if (!MASTER_ITEMS.includes(r + ',')) err('MASTER item not found ' + r);
for (const t of mammals) for (const r of (t.hunting_method_refs || '').split(';').filter(Boolean)) if (/hnt00(22|24|28)/.test(r)) err('D-rated MASTER hunting item used ' + r);
for (const issue of huntingDataIssues(huntingMethods, huntingTenure, mammals)) err(issue);
for (const issue of peltIssues(mammals)) err(issue);

// Acceptance fauna_mammals
const presBy = (fa) => pres.filter((p) => p.fa_id === fa);
for (const t of mammals) {
  if (!['signs_tracks', 'signs_droppings', 'signs_feeding', 'signs_dens_nests', 'signs_sounds', 'signs_smell'].some((k) => t[k])) err('mammal without signs ' + t.fa_id);
  if (!presBy(t.fa_id).length) err('mammal without habitat_presence ' + t.fa_id);
}
const FOREST_RIPARIAN = ['pf_conifer_woodland', 'pf_mixed_woodland', 'pf_broadleaf_woodland', 'pf_forest_edge', 'pf_riverbank', 'pf_lake_shore', 'pf_marshy_stream', 'pf_river_channel', 'pf_floodplain_meadow', 'pf_bog'];
const mset = new Set(mammals.map((m) => m.fa_id));
const accM = {};
for (const pf of FOREST_RIPARIAN) for (const s of SEASONS) {
  const n = new Set(pres.filter((p) => p.pf_id === pf && p.season === s && mset.has(p.fa_id) && p.observable_signs && p.observable_signs !== 'none').map((p) => p.fa_id)).size;
  accM[pf + '/' + s] = n; if (n < 6) err(`fewer than 6 mammal taxa with signs in ${pf} ${s}: ${n}`);
}
for (const t of mammals.filter((m) => m.dormant_seasons.includes('winter'))) for (const p of presBy(t.fa_id).filter((p) => p.season === 'winter')) if (p.state !== 'dormant' || p.audible !== 'false' || p.activity_time !== 'dormant') err('hibernator active in winter ' + p.presence_id);

// Acceptance fauna_birds
if (birds.length < 40) err('fewer than 40 bird taxa: ' + birds.length);
for (const b of birds) { if (!b.voice_description) err('bird without voice ' + b.fa_id); if (b.voice_description && soundIssue(b.voice_sound_ru, b.voice_description, b.audible_seasons)) err('bird voice_sound_ru ' + soundIssue(b.voice_sound_ru, b.voice_description, b.audible_seasons) + ' ' + b.fa_id); for (const s of SEASONS) if (!b['migration_' + s]) err('bird migration missing ' + b.fa_id + ' ' + s); if (!presBy(b.fa_id).length) err('bird without presence ' + b.fa_id); }
const INTERIOR = new Set(['pf_dwelling_interior', 'pf_cellar_granary', 'pf_mill', 'pf_grain_drying_shed_ovin', 'pf_outbuildings', 'pf_threshing_barn', 'pf_church_interior', 'pf_ordinary_workshop', 'pf_bathhouse', 'pf_smithy']);
const bset = new Set(birds.map((b) => b.fa_id));
const openPfs = [...new Set(pres.map((p) => p.pf_id))].filter((pf) => !INTERIOR.has(pf));
const accB = {};
for (const pf of openPfs) for (const s of SEASONS) {
  if (pf === 'pf_winter_ice_crossing' && s !== 'winter') continue; // seasonal overlay exists only in winter
  const n = new Set(pres.filter((p) => p.pf_id === pf && p.season === s && bset.has(p.fa_id) && p.audible === 'true').map((p) => p.fa_id)).size;
  accB[pf + '/' + s] = n;
  if (pf === 'pf_ferry_landing' && s === 'winter' && n === 2) warn('explicit gap: pf_ferry_landing winter has 2 audible birds; mallard requires scene-level open water');
  else if (n < 3) err(`fewer than 3 audible bird species in ${pf} ${s}: ${n}`);
}
const outdoorNotCovered = [...pfs].filter((pf) => !INTERIOR.has(pf) && !openPfs.includes(pf));
if (outdoorNotCovered.length) warn('outdoor place families without any fauna rows: ' + outdoorNotCovered.join(','));

// Regional list / heading checks (warnings, not failures)
for (const b of birds) { if (b.panteleev_2001_listed !== 'true') warn('bird not matched in Пантелеев 2001 list: ' + b.fa_id + ' ' + b.name_lat); }
// Anachronism: excluded taxa must not appear as rows
const excluded = checks.filter((c) => c.verdict === 'excluded_anachronism' || c.verdict.startsWith('excluded_')).map((c) => c.name_lat.toLowerCase());
for (const t of all) if (excluded.some((e) => e && t.name_lat.toLowerCase() === e)) err('excluded taxon present ' + t.fa_id);
const DENY = /(Nyctereutes|Ondatra|Neogale|Rattus norvegicus|Oryctolagus|Phasianus|Streptopelia decaocto|Cervus nippon)/;
for (const t of all) if (DENY.test(t.name_lat)) err('denylist taxon ' + t.fa_id);
// town rows for magpie/starling forbidden (SRC_ZIN2025)
const TOWN = new Set(['pf_town_street', 'pf_town_courtyard', 'pf_town_wall_edge', 'pf_market_square', 'pf_river_wharf', 'pf_churchyard', 'pf_monastery_yard']);
for (const p of pres) if (['fa_b_magpie', 'fa_b_starling'].includes(p.fa_id) && TOWN.has(p.pf_id)) err('later-medieval town coloniser placed in town ' + p.presence_id);

const report = {
  checked_by: 'scripts/validate.cjs', ok: errors.length === 0,
  counts: { mammals: mammals.length, birds: birds.length, hunting_methods: huntingMethods.length, hunting_tenure_defaults: huntingTenure.length, pelt_calendars: mammals.filter(r => r.pelt_prime_months).length, presence_rows: pres.length, phase_activity_rows: phaseTable.rows.length, place_families_with_rows: new Set(pres.map((p) => p.pf_id)).size,
    presence_by_class: Object.fromEntries(Object.keys(LEVELS).map((k) => [k, pres.filter((p) => p.frequency_class === k).length])),
    presence_confidence: { B: pres.filter((p) => p.confidence === 'B').length, C: pres.filter((p) => p.confidence === 'C').length },
    taxa_presence_1230_confidence: ['A', 'B', 'C'].reduce((a, k) => ((a[k] = all.filter((t) => t.presence_1230_confidence === k).length), a), {}),
    birds_in_pantelev_2001: birds.filter((b) => b.panteleev_2001_listed === 'true').length, birds_petrov_1885: birds.filter((b) => b.petrov_1885_priilmenye === 'true').length },
  acceptance: { mammal_signs_min_per_forest_riparian_pf_season: Math.min(...Object.values(accM)), audible_birds_min_per_open_pf_season: Math.min(...Object.values(accB)), mammals_without_recorded_products: mammals.filter((row) => !row.products).length },
  errors, warnings,
};
const reportPath = path.join(DOM, 'validation-report.json');
const reportText = JSON.stringify(report, null, 1) + '\n';
const stale = process.argv.includes('--check')
  && (!fs.existsSync(reportPath) || fs.readFileSync(reportPath, 'utf8') !== reportText);
if (!process.argv.includes('--check')) {
  fs.writeFileSync(reportPath, reportText);
}
console.log(JSON.stringify({ ok: report.ok, counts: report.counts, acceptance: report.acceptance, errors: errors.length, warnings: warnings.length }, null, 1));
if (errors.length) { console.log(errors.slice(0, 40).join('\n')); process.exit(1); }
if (stale) { console.log('validation-report.json is stale; run scripts/validate.cjs to regenerate it'); process.exit(1); }
if (warnings.length) console.log(warnings.join('\n'));
// Post-check (warning): Мальчевский species heading epithet vs bird latin epithet (catches wrong mp numbers).
{
  const bad = [];
  for (const b of birds) {
    if (!b.malchevsky_heading_check) continue;
    const ep = (s) => (s.split(/\s+/)[1] || '').toLowerCase().replace(/^(korschun)$/, 'migrans');
    const cand = [b.name_lat, b.notes].join(' ').toLowerCase();
    if (!cand.includes(ep(b.malchevsky_heading_check).slice(0, 5))) bad.push(`${b.fa_id}: ${b.name_lat} vs heading ${b.malchevsky_heading_check}`);
  }
  if (bad.length) { console.log('malchevsky heading epithet mismatches (check synonyms):\n' + bad.join('\n')); }
}
