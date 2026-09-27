'use strict';
const fs = require('fs');
const path = require('path');
const GB = path.resolve(__dirname, '../..');
const rules = require('../fauna/activity_phase_rules.json');
const voicePhase = require('./voice-phase.cjs');
const HEADER = ['phase_rule_id', 'fa_id', 'season', 'phase', 'visibility_state', 'voice_state', 'voice_text_ref', 'source_refs', 'rule_ref', 'no_source', 'confidence', 'status'];
function csv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const lines = []; let line = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c; }
    else if (c === '"') quoted = true;
    else if (c === ',') { line.push(cell); cell = ''; }
    else if (c === '\n') { line.push(cell); lines.push(line); line = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || line.length) { line.push(cell); lines.push(line); }
  const [header, ...body] = lines;
  return { header, rows: body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((key, i) => [key, r[i] ?? '']))) };
}
const file = (group, name) => path.join(GB, group, 'fauna', name);
const startPf = new Set(csv(path.join(GB, 'places-binding/places/node_binding.csv')).rows.map((r) => r.pf_id).filter(Boolean));
function validate(group, rows, header) {
  const errors = [];
  if (header.join(',') !== HEADER.join(',')) errors.push('phase_activity schema');
  const presence = csv(file(group, group === 'fauna-mammals-birds' ? 'wild_habitat_presence.csv' : 'fauna_presence.csv')).rows;
  const scope = new Set(presence.filter((r) => startPf.has(group === 'fauna-mammals-birds' ? r.pf_id : `pf_${r.pf_id}`))
    .map((r) => `${r.fa_id}|${r.season || r.season_period}`));
  const fish = group !== 'fauna-mammals-birds';
  const cues = fish ? require('../../fauna-fish-invertebrates-livestock/scripts/src/phase_cues.json') : {};
  const livestockRules = new Map();
  const activeScope = new Set(presence.filter((r) => startPf.has(`pf_${r.pf_id}`) && r.activity_state === 'active').map((r) => `${r.fa_id}|${r.season_period}`));
  if (fish) {
    const boundRules = new Set(csv(file(group, 'rpgr_pf_crosswalk.csv')).rows.filter((r) => startPf.has(r.pf_id) && r.rule_ref).map((r) => r.rule_ref));
    const species = new Set(csv(file(group, 'livestock_species.csv')).rows.map((r) => r.fa_id));
    for (const r of csv(file(group, 'place_type_livestock.csv')).rows.filter((r) => boundRules.has(r.rule_ref) && species.has(r.species_ref))) {
      if (!livestockRules.has(r.species_ref)) livestockRules.set(r.species_ref, new Set());
      livestockRules.get(r.species_ref).add(r.pl_id);
    }
    for (const faId of livestockRules.keys()) for (const season of ['winter', 'spring_rasputitsa', 'summer', 'autumn']) scope.add(`${faId}|${season}`);
  }
  const taxa = new Map();
  for (const name of group === 'fauna-mammals-birds' ? ['mammals.csv', 'birds.csv'] : ['fish.csv', 'invertebrates_herps.csv', 'livestock_species.csv'])
    for (const row of csv(file(group, name)).rows) taxa.set(row.fa_id, { ...row, table: name });
  const keys = new Set(), ids = new Set();
  for (const row of rows) {
    const key = `${row.fa_id}|${row.season}|${row.phase}`;
    if (keys.has(key)) errors.push(`duplicate phase key ${key}`); keys.add(key);
    if (ids.has(row.phase_rule_id)) errors.push(`duplicate phase_rule_id ${row.phase_rule_id}`); ids.add(row.phase_rule_id);
    if (row.phase_rule_id !== `fpa_${row.fa_id}_${row.season}_${row.phase}`) errors.push(`phase_rule_id ${key}`);
    if (!scope.has(`${row.fa_id}|${row.season}`) || !rules.phases.includes(row.phase)) errors.push(`out of scope ${key}`);
    if (!['yes', 'no', 'no_source'].includes(row.visibility_state) || !['yes', 'no', 'no_source'].includes(row.voice_state)) errors.push(`state enum ${key}`);
    if ([row.source_refs, row.rule_ref, row.no_source].filter(Boolean).length !== 1) errors.push(`basis XOR ${key}`);
    const completeGap = row.visibility_state === 'no_source' && row.voice_state === 'no_source';
    if (completeGap !== Boolean(row.no_source)) errors.push(`gap basis ${key}`);
    if (!['A', 'B', 'C'].includes(row.confidence) || row.status !== 'candidate') errors.push(`confidence/status ${key}`);
    const taxon = taxa.get(row.fa_id);
    if (!taxon) { errors.push(`unknown taxon ${key}`); continue; }
    if ('ABC'.indexOf(row.confidence) < 'ABC'.indexOf(taxon.confidence) ||
        (taxon.presence_1230_confidence && 'ABC'.indexOf(row.confidence) < 'ABC'.indexOf(taxon.presence_1230_confidence))) errors.push(`confidence exceeds owner ${key}`);
    const knownActivity = !fish ? taxon.activity_time :
      ({ fa_ins_honeybee: 'diurnal', fa_amph_smooth_newt: 'nocturnal' }[row.fa_id] || '');
    if (!fish) {
      const dormant = (taxon.dormant_seasons || '').split(';').includes(row.season);
      const expected = dormant ? 'no' : rules.rules[knownActivity]?.[row.phase];
      if (!expected || row.visibility_state !== expected) errors.push(`activity mapping ${key}`);
      const audible = taxon.table === 'birds.csv' ? taxon.audible_seasons.split(';').includes(row.season) :
        presence.some((p) => p.fa_id === row.fa_id && p.season === row.season && p.audible === 'true');
      const voiceFact = taxon.table === 'birds.csv' ? 'voice_description' : 'signs_sounds';
      const evidence = voicePhase(taxon, row.season, row.phase, audible, dormant);
      const voiceExpected = evidence === null ? expected : evidence;
      if (row.voice_state !== voiceExpected) errors.push(`voice phase/season ${key}`);
      const ref = voiceExpected === 'yes' ? `${taxon.table}#${row.fa_id}.${voiceFact}` : '';
      if (row.voice_text_ref !== ref) errors.push(`voice_text_ref ${key}`);
      const expectedSource = completeGap ? '' : voiceExpected === 'yes' && expected === 'no_source' ? ref : `${taxon.table}#${row.fa_id}.activity_time`;
      if (row.source_refs !== expectedSource || row.rule_ref || row.no_source !== (completeGap ? 'visibility and voice phase unknown' : '')) errors.push(`activity source ${key}`);
    } else {
      let visibility = knownActivity ? rules.rules[knownActivity][row.phase] : 'no_source';
      let voice = 'no_source', voiceRef = '';
      let source = row.fa_id === 'fa_ins_honeybee' ? 'claim:fauna-bee-diurnal' :
        row.fa_id === 'fa_amph_smooth_newt' ? 'books-evidence-v1/fauna-fish-invertebrates-livestock.csv#L152' :
        '';
      const cue = cues[row.fa_id];
      if (cue?.phases[row.phase] && (!cue.seasons || cue.seasons.includes(row.season)) && activeScope.has(`${row.fa_id}|${row.season}`)) {
        [visibility, voice] = cue.phases[row.phase];
        source = `invertebrates_herps.csv#${row.fa_id}.perceptual_cues`;
        if (voice === 'yes') voiceRef = source;
        if (cue.seasons) source += `;invertebrates_herps.csv#${row.fa_id}.season_peak`;
      }
      if (row.fa_id === 'fa_rept_adder' && row.phase === 'night' && ['spring_rasputitsa', 'autumn'].includes(row.season)) {
        visibility = 'no'; source = 'books-evidence-v1/fauna-fish-invertebrates-livestock.csv#L139';
      }
      const fullGap = visibility === 'no_source' && voice === 'no_source';
      if (fullGap) source = '';
      if (row.visibility_state !== visibility) errors.push(`activity mapping ${key}`);
      if (row.voice_state !== voice || row.voice_text_ref !== voiceRef) errors.push(`voice phase/season ${key}`);
      if (row.source_refs !== source) errors.push(`phase source ${key}`);
      const occurrence = [...(livestockRules.get(row.fa_id) || [])].sort().join('|');
      const expectedGap = fullGap ? `phase visibility and voice unknown${occurrence ? `; conditional occurrence refs: ${occurrence}` : ''}` : '';
      if (row.rule_ref || row.no_source !== expectedGap) errors.push(`livestock occurrence refs ${key}`);
    }
  }
  for (const pair of scope) for (const phase of rules.phases) if (!keys.has(`${pair}|${phase}`)) errors.push(`missing ${pair}|${phase}`);
  return errors;
}
if (require.main === module) {
  const group = process.argv[2];
  if (!['fauna-mammals-birds', 'fauna-fish-invertebrates-livestock'].includes(group)) throw new Error('group required');
  const table = csv(file(group, 'phase_activity.csv'));
  const errors = validate(group, table.rows, table.header);
  if (process.argv.includes('--self-test')) {
    const find = (id, season, phase) => table.rows.find((r) => r.fa_id === id && r.season === season && r.phase === phase);
    const expect = (id, season, phase, field, value) => {
      const row = find(id, season, phase);
      if (!row || row[field] !== value) errors.push(`independent example ${id}/${season}/${phase}/${field}`);
    };
    const reject = (id, season, phase, field, value, error) => {
      const bad = table.rows.map((r) => ({ ...r }));
      const row = bad.find((r) => r.fa_id === id && r.season === season && r.phase === phase);
      if (!row) { errors.push(`probe missing ${id}/${season}/${phase}`); return; }
      row[field] = value;
      if (!validate(group, bad, table.header).some((e) => e.startsWith(error))) errors.push(`negative probe accepted ${id}/${field}`);
    };
    if (group === 'fauna-mammals-birds') {
      expect('fa_b_common_crane', 'spring', 'civil_dawn', 'voice_state', 'yes');
      expect('fa_b_black_stork', 'spring', 'daylight', 'voice_state', 'no_source');
      expect('fa_b_great_crested_grebe', 'summer', 'daylight', 'voice_state', 'yes');
      expect('fa_b_willow_tit', 'winter', 'daylight', 'voice_state', 'yes');
      expect('fa_b_wigeon', 'summer', 'night', 'voice_state', 'no_source');
      expect('fa_b_wigeon', 'spring', 'night', 'voice_state', 'yes');
      expect('fa_b_wigeon', 'autumn', 'night', 'voice_state', 'yes');
      expect('fa_b_redwing', 'summer', 'night', 'voice_state', 'no_source');
      expect('fa_b_redwing', 'autumn', 'night', 'voice_state', 'yes');
      reject('fa_b_black_stork', 'spring', 'daylight', 'voice_state', 'yes', 'voice phase/season');
      reject('fa_b_common_crane', 'spring', 'civil_dawn', 'voice_state', 'no_source', 'voice phase/season');
      reject('fa_b_eagle_owl', 'spring', 'daylight', 'voice_state', 'yes', 'voice phase/season');
      reject('fa_b_common_crane', 'spring', 'night', 'voice_state', 'yes', 'voice phase/season');
      reject('fa_b_redwing', 'summer', 'night', 'voice_state', 'yes', 'voice phase/season');
      reject('fa_b_common_crane', 'spring', 'daylight', 'visibility_state', 'no_source', 'activity mapping');
    } else {
      expect('fa_ins_mosquitoes', 'summer', 'civil_dusk', 'voice_state', 'yes');
      expect('fa_ins_mosquitoes', 'summer', 'night', 'voice_state', 'yes');
      expect('fa_ins_mosquitoes', 'spring_rasputitsa', 'night', 'voice_state', 'yes');
      expect('fa_ins_mosquitoes', 'autumn', 'night', 'voice_state', 'yes');
      expect('fa_ins_horseflies', 'summer', 'daylight', 'visibility_state', 'yes');
      expect('fa_ins_horseflies', 'summer', 'daylight', 'voice_state', 'yes');
      expect('fa_dom_cattle', 'summer', 'daylight', 'visibility_state', 'no_source');
      expect('fa_dom_horse', 'summer', 'night', 'visibility_state', 'no_source');
      reject('fa_ins_mosquitoes', 'summer', 'night', 'voice_state', 'no_source', 'voice phase/season');
      reject('fa_ins_horseflies', 'summer', 'daylight', 'visibility_state', 'no_source', 'activity mapping');
      const missing = table.rows.filter((r) => r.phase_rule_id !== 'fpa_fa_dom_cattle_summer_daylight');
      if (!validate(group, missing, table.header).some((e) => e.startsWith('missing fa_dom_cattle|summer|daylight'))) errors.push('missing livestock probe accepted');
    }
  }
  console.log(JSON.stringify({ group, rows: table.rows.length, errors: errors.slice(0, 20) }));
  if (errors.length) process.exitCode = 1;
}
module.exports = { validate, csv, HEADER };
