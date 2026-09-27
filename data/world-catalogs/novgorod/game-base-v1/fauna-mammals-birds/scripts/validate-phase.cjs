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
const refCache = new Map();
function resolves(group, ref) {
  const [name, target] = ref.split('#');
  if (!name || !target || ref.split('#').length !== 2) return false;
  const location = name.startsWith('books-evidence-v1/') ? path.join(GB, '..', 'sources', name) :
    name.startsWith('fauna-mammals-birds/') || name.startsWith('buildings-interiors-containers/') ? path.join(GB, name) : file(group, name.replace(/^fauna\//, ''));
  if (!fs.existsSync(location)) return false;
  const cacheKey = `${location}#${target}`;
  if (refCache.has(cacheKey)) return refCache.get(cacheKey);
  let result;
  if (name.endsWith('.json')) {
    const json = JSON.parse(fs.readFileSync(location, 'utf8'));
    const parts = target.split('.');
    result = target === json.id ||
      (parts.length === 3 && parts[0] === json.id && Object.hasOwn(json.rules?.[parts[1]] || {}, parts[2])) ||
      json.derived_rules?.some((r) => r.id === target);
  } else if (/^L\d+$/.test(target)) {
    const lines = fs.readFileSync(location, 'utf8').trimEnd().split(/\r?\n/);
    result = name.startsWith('books-evidence-v1/') && Number(target.slice(1)) > 1 && Number(target.slice(1)) <= lines.length;
  } else {
    const { header, rows } = csv(location);
    const parts = target.split('.');
    const [id, field] = parts;
    result = parts.length <= 2 && id && (parts.length === 1 || field && header.includes(field)) && rows.some((r) => r[header[0]] === id);
  }
  refCache.set(cacheKey, Boolean(result));
  return Boolean(result);
}
const startPf = new Set(csv(path.join(GB, 'places-binding/places/node_binding.csv')).rows.map((r) => r.pf_id).filter(Boolean));
const lights = csv(path.join(GB, 'nature-materials-weather/weather_climate/light_profile_by_month.csv')).rows;
const minutes = (clock) => { const [hour, minute] = clock.split(':').map(Number); return hour * 60 + minute; };
function roosterPhase(season) {
  const seasonName = season === 'spring_rasputitsa' ? 'spring' : season;
  const months = lights.filter((r) => r.season_period === seasonName).sort((a, b) => Number(a.julian_month) - Number(b.julian_month));
  const middle = months[Math.floor(months.length / 2)];
  const atFour = 4 * 60;
  if (atFour < minutes(middle.avg_civil_dawn_lmst)) return 'night';
  if (atFour < minutes(middle.avg_sunrise_lmst)) return 'civil_dawn';
  if (atFour < minutes(middle.avg_sunset_lmst)) return 'daylight';
  if (atFour < minutes(middle.avg_civil_dusk_lmst)) return 'civil_dusk';
  return 'night';
}
function criterionCR(row, activity, voiceText) {
  if (row.voice_state !== 'yes') return '';
  if (activity === 'nocturnal' && row.phase === 'daylight' &&
      !/днём|днем|днев/.test(voiceText.toLowerCase()) && !row.source_refs.includes('books-evidence-v1/')) return 'nocturnal daylight';
  if (activity === 'diurnal' && row.phase === 'night' &&
      !/ноч/.test(voiceText.toLowerCase()) && !row.source_refs.includes('books-evidence-v1/')) return 'diurnal night';
  return '';
}
function criterionFishCR(row, taxon) {
  if (row.voice_state !== 'yes' || taxon.table !== 'invertebrates_herps.csv') return '';
  const text = `${taxon.perceptual_cues} ${taxon.season_peak}`.toLowerCase();
  const night = /ноч|сумерк|вечер/.test(text);
  const day = /дн|полд|жар|солн|светл|утр|рассвет|зор/.test(text);
  if (row.phase === 'daylight' && night && !day) return 'night-only owner in daylight';
  if (row.phase === 'night' && day && !night) return 'day-only owner at night';
  return '';
}
function validate(group, rows, header, presenceOverride, cuesOverride) {
  const errors = [];
  if (header.join(',') !== HEADER.join(',')) errors.push('phase_activity schema');
  const presence = presenceOverride || csv(file(group, group === 'fauna-mammals-birds' ? 'wild_habitat_presence.csv' : 'fauna_presence.csv')).rows;
  const scope = new Set(presence.filter((r) => startPf.has(group === 'fauna-mammals-birds' ? r.pf_id : `pf_${r.pf_id}`))
    .map((r) => `${r.fa_id}|${r.season || r.season_period}`));
  const fish = group !== 'fauna-mammals-birds';
  const cues = fish ? cuesOverride || require('../../fauna-fish-invertebrates-livestock/scripts/src/phase_cues.json') : {};
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
    const families = csv(path.join(GB, 'places-binding/places/place_families.csv')).rows;
    const hasStartYard = families.some((r) => startPf.has(r.pf_id) && r.master_location_archetypes.split(';').includes('yard'));
    const profiles = new Set(csv(file(group, 'household_type_crosswalk.csv')).rows.map((r) => r.household_profile_ref));
    const herd = csv(file(group, 'herd_composition.csv')).rows;
    const linkedSpecies = new Set(herd.filter((r) => profiles.has(r.household_profile_ref)).map((r) => r.species_ref));
    if (hasStartYard) for (const r of herd.filter((r) => linkedSpecies.has(r.species_ref) && species.has(r.species_ref))) {
      if (!livestockRules.has(r.species_ref)) livestockRules.set(r.species_ref, new Set());
      livestockRules.get(r.species_ref).add(r.hc_id);
      for (const season of ['winter', 'spring_rasputitsa', 'summer', 'autumn']) scope.add(`${r.species_ref}|${season}`);
    }
  }
  if (fish) {
    const legacy = new Set(['fa_mamm_house_mouse', 'fa_mamm_striped_field_mouse', 'fa_mamm_voles', 'fa_mamm_black_rat']);
    for (const p of presence) if (p.fa_id.startsWith('fa_mamm_') && !legacy.has(p.fa_id)) errors.push(`unmapped legacy mammal ${p.fa_id}`);
    for (const pair of [...scope]) if (legacy.has(pair.split('|')[0])) scope.delete(pair);
  }
  const taxa = new Map();
  for (const name of group === 'fauna-mammals-birds' ? ['mammals.csv', 'birds.csv'] : ['fish.csv', 'invertebrates_herps.csv', 'livestock_species.csv'])
    for (const row of csv(file(group, name)).rows) taxa.set(row.fa_id, { ...row, table: name });
  if (!fish) for (const p of presence) {
    const taxon = taxa.get(p.fa_id);
    if (taxon?.table !== 'mammals.csv') continue;
    const dormant = taxon.dormant_seasons.split(';').includes(p.season);
    const expected = !dormant && rules.phases.some((phase) => ['yes', null].includes(voicePhase(taxon, p.season, phase, true, false)));
    if (p.audible !== String(expected)) errors.push(`presence audible owner ${p.fa_id}/${p.season}/${p.pf_id}`);
    if (expected && !p.source_refs.split(';').includes(`mammals.csv#${p.fa_id}.signs_sounds`))
      errors.push(`presence audible source ${p.fa_id}/${p.season}/${p.pf_id}`);
  }
  const keys = new Set(), ids = new Set();
  for (const row of rows) {
    const key = `${row.fa_id}|${row.season}|${row.phase}`;
    if (keys.has(key)) errors.push(`duplicate phase key ${key}`); keys.add(key);
    if (ids.has(row.phase_rule_id)) errors.push(`duplicate phase_rule_id ${row.phase_rule_id}`); ids.add(row.phase_rule_id);
    if (row.phase_rule_id !== `fpa_${row.fa_id}_${row.season}_${row.phase}`) errors.push(`phase_rule_id ${key}`);
    if (!scope.has(`${row.fa_id}|${row.season}`) || !rules.phases.includes(row.phase)) errors.push(`out of scope ${key}`);
    if (!['yes', 'no', 'no_source'].includes(row.visibility_state) || !['yes', 'no', 'no_source'].includes(row.voice_state)) errors.push(`state enum ${key}`);
    if ([row.source_refs, row.rule_ref, row.no_source].filter(Boolean).length !== 1) errors.push(`basis XOR ${key}`);
    const completeGap = row.visibility_state === 'no_source' && row.voice_state === 'no_source' && !row.rule_ref;
    if (completeGap !== Boolean(row.no_source)) errors.push(`gap basis ${key}`);
    if (!['A', 'B', 'C'].includes(row.confidence) || row.status !== 'candidate') errors.push(`confidence/status ${key}`);
    if ((row.no_source || row.rule_ref) && row.confidence !== 'C') errors.push(`editorial/gap confidence ${key}`);
    const rulePath = fish ? 'fauna-mammals-birds/fauna/activity_phase_rules.json#' : 'fauna/activity_phase_rules.json#';
    if (row.rule_ref && !row.rule_ref.startsWith(`${rulePath}${rules.id}.`) &&
        !rules.derived_rules.some((r) => row.rule_ref === `${rulePath}${r.id}`)) errors.push(`unknown rule ${key}`);
    if (row.rule_ref && !resolves(group, row.rule_ref)) errors.push(`unresolved rule ${key}`);
    for (const ref of row.source_refs.split(';').filter(Boolean)) if (!resolves(group, ref)) errors.push(`unresolved source ${key}: ${ref}`);
    for (const ref of row.voice_text_ref.split(';').filter(Boolean)) if (!resolves(group, ref)) errors.push(`unresolved voice text ${key}: ${ref}`);
    if (row.source_refs.includes('.activity_time')) errors.push(`activity class presented as source ${key}`);
    const taxon = taxa.get(row.fa_id);
    if (!taxon) { errors.push(`unknown taxon ${key}`); continue; }
    if ('ABC'.indexOf(row.confidence) < 'ABC'.indexOf(taxon.confidence) ||
        (taxon.presence_1230_confidence && 'ABC'.indexOf(row.confidence) < 'ABC'.indexOf(taxon.presence_1230_confidence))) errors.push(`confidence exceeds owner ${key}`);
    const knownActivity = !fish ? taxon.activity_time :
      ({ fa_ins_honeybee: 'diurnal', fa_amph_smooth_newt: 'nocturnal' }[row.fa_id] || '');
    if (!fish && (taxon.dormant_seasons || '').split(';').includes(row.season) &&
        (row.visibility_state !== 'no' || row.voice_state !== 'no' || !row.source_refs.endsWith('.dormant_seasons'))) errors.push(`dormant season ${key}`);
    if (fish && (taxon.dormant_seasons || '').split(';').includes(row.season) &&
        (row.visibility_state !== 'no' || row.voice_state !== 'no' || !row.source_refs.endsWith('.dormant_seasons'))) errors.push(`dormant season ${key}`);
    if ((taxon.dormant_seasons || '').split(';').includes(row.season) && row.confidence !== 'C') errors.push(`dormant confidence ${key}`);
    if (!fish) {
      const dormant = (taxon.dormant_seasons || '').split(';').includes(row.season);
      const expectedVisibility = dormant ? 'no' : rules.rules[knownActivity]?.[row.phase];
      const visibilityBook = (row.fa_id === 'fa_m_wild_boar' && row.season === 'summer' && row.phase === 'civil_dusk') ||
        (row.fa_id === 'fa_b_capercaillie' && row.season === 'spring' && row.phase === 'civil_dusk');
      if (row.visibility_state !== (visibilityBook ? 'yes' : expectedVisibility)) errors.push(`activity mapping ${key}`);
      const audible = taxon.table === 'birds.csv' ? taxon.audible_seasons.split(';').includes(row.season) :
        presence.some((p) => p.fa_id === row.fa_id && p.season === row.season && p.audible === 'true');
      if (taxon.table === 'mammals.csv' && row.voice_state === 'yes' && !audible) errors.push(`mammal presence audible ${key}`);
      const parsed = voicePhase(taxon, row.season, row.phase, audible, dormant);
      if (taxon.table === 'birds.csv' && !audible && row.voice_state === 'yes') errors.push(`audible season ${key}`);
      let expectedVoice = rules.voice_rules[knownActivity]?.[row.phase] && parsed !== 'yes' ? rules.voice_rules[knownActivity][row.phase] :
        parsed === null ? expectedVisibility : parsed;
      const voiceBook = (row.fa_id === 'fa_b_bittern' && ['spring', 'summer'].includes(row.season) && ['daylight', 'civil_dusk', 'night'].includes(row.phase)) ||
          (row.fa_id === 'fa_b_common_crane' && row.season === 'autumn' && row.phase === 'night') ||
          (row.fa_id === 'fa_b_swift' && row.season === 'summer' && row.phase === 'civil_dawn');
      if (voiceBook) expectedVoice = 'yes';
      if (row.voice_state !== expectedVoice) errors.push(`voice phase/season ${key}`);
      if ((!visibilityBook || !(parsed === 'yes' || voiceBook) || completeGap ||
           row.visibility_state === 'no_source' || row.voice_state === 'no_source') && row.confidence !== 'C') errors.push(`mixed facet confidence ${key}`);
    } else {
      if ((row.visibility_state === 'no_source' || row.voice_state === 'no_source') && row.confidence !== 'C') errors.push(`mixed facet confidence ${key}`);
      if (taxon.table === 'livestock_species.csv' && row.visibility_state !== 'no_source') errors.push(`livestock visibility ${key}`);
      if (row.fa_id === 'fa_ins_mosquitoes' && row.phase === 'civil_dawn' && activeScope.has(`${row.fa_id}|${row.season}`) &&
          (row.voice_state !== 'yes' || row.source_refs || row.rule_ref !== `${rulePath}mosquito-dawn-sound` ||
           row.voice_text_ref !== 'invertebrates_herps.csv#fa_ins_mosquitoes.perceptual_cues' || row.confidence !== 'C')) errors.push(`mosquito dawn channel ${key}`);
      if (row.fa_id === 'fa_dom_chicken') {
        const roosterRule = `${rulePath}rooster-four-am`;
        if (row.phase === roosterPhase(row.season) ? row.voice_state !== 'yes' || !row.source_refs.split(';').includes(roosterRule) || row.confidence !== 'C' : row.source_refs.split(';').includes(roosterRule))
          errors.push(`rooster phase/channel ${key}`);
        if (row.voice_state === 'yes' && [...livestockRules.get(row.fa_id) || []].some((ref) => !row.source_refs.split(';').includes(`${ref.startsWith('pl_') ? 'place_type_livestock.csv' : 'herd_composition.csv'}#${ref}`)))
          errors.push(`chicken occurrence refs ${key}`);
      }
      const cue = cues[row.fa_id];
      const cueActive = cue?.phases[row.phase] && (!cue.seasons || cue.seasons.includes(row.season)) && activeScope.has(`${row.fa_id}|${row.season}`);
      if (cueActive && row.fa_id !== 'fa_ins_dragonflies' &&
          (row.visibility_state !== cue.phases[row.phase][0] || row.voice_state !== cue.phases[row.phase][1])) errors.push(`cue phase ${key}`);
      const expectedVoice = (cueActive && cue.phases[row.phase][1] === 'yes') ||
        (row.fa_id === 'fa_ins_mosquitoes' && row.phase === 'civil_dawn' && activeScope.has(`${row.fa_id}|${row.season}`)) ||
        (row.fa_id === 'fa_ins_grasshoppers' && row.season === 'summer' && row.phase === 'daylight' && activeScope.has(`${row.fa_id}|${row.season}`)) ||
        (row.fa_id === 'fa_dom_chicken' && (row.phase === roosterPhase(row.season) || row.phase === 'daylight' && ['winter', 'spring_rasputitsa', 'summer'].includes(row.season)));
      if ((row.voice_state === 'yes') !== Boolean(expectedVoice)) errors.push(`fish voice owner ${key}`);
      if (row.fa_id === 'fa_amph_common_frog' && row.phase === 'night' && activeScope.has(`${row.fa_id}|${row.season}`) &&
          (row.visibility_state !== 'no_source' || row.rule_ref !== `${rulePath}frog-damp-night`)) errors.push(`conditional frog ${key}`);
      if ((row.fa_id === 'fa_fish_burbot' && row.season === 'winter' && row.phase === 'night' ||
           row.fa_id === 'fa_fish_zander' && row.season === 'spring_rasputitsa' && ['civil_dawn', 'night'].includes(row.phase)) && row.visibility_state !== 'no_source')
        errors.push(`fish spawning visibility ${key}`);
      if (row.fa_id === 'fa_crust_noble_crayfish' && row.phase === 'night' && row.visibility_state !== 'yes')
        errors.push(`fish activity owner ${key}`);
    }
    if (row.rule_ref.includes(`${rules.id}.`) && row.visibility_state !== rules.rules[knownActivity]?.[row.phase]) errors.push(`activity mapping ${key}`);
    if (row.rule_ref.includes(`${rules.id}.`) && rules.voice_rules[knownActivity]?.[row.phase] &&
        row.voice_state !== rules.voice_rules[knownActivity][row.phase]) errors.push(`voice rule ${key}`);
    const voiceText = !fish ? (taxon.table === 'birds.csv' ? taxon.voice_description : taxon.signs_sounds) : taxon.perceptual_cues || '';
    // Independent CR check: only the owner text or a direct book fact can license the opposite phase.
    const crFailure = criterionCR(row, knownActivity, voiceText);
    if (crFailure) errors.push(`criterion CR ${crFailure} ${key}`);
    if (fish) {
      const fishFailure = criterionFishCR(row, taxon);
      if (fishFailure) errors.push(`criterion fish CR ${fishFailure} ${key}`);
    }
    if (!fish && row.voice_state === 'yes' && /почти (?:безмолв|молчалив)|обычно (?:безмолв|молчалив)/.test(voiceText.toLowerCase())) errors.push(`silent owner ${key}`);
    if (row.voice_state === 'yes' && !row.voice_text_ref && !row.source_refs.includes('books-evidence-v1/')) errors.push(`missing voice text ${key}`);
    if (fish && row.no_source && livestockRules.has(row.fa_id)) {
      const occurrence = [...livestockRules.get(row.fa_id)].sort().join('|');
      if (!row.no_source.includes(`conditional occurrence refs: ${occurrence}`)) errors.push(`livestock occurrence refs ${key}`);
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
      expect('fa_b_wigeon', 'summer', 'daylight', 'voice_state', 'yes');
      expect('fa_b_wigeon', 'spring', 'night', 'voice_state', 'yes');
      expect('fa_b_wigeon', 'autumn', 'night', 'voice_state', 'yes');
      expect('fa_b_redwing', 'summer', 'night', 'voice_state', 'no_source');
      expect('fa_b_redwing', 'summer', 'daylight', 'voice_state', 'yes');
      expect('fa_b_redwing', 'autumn', 'night', 'voice_state', 'yes');
      expect('fa_b_blackbird', 'spring', 'civil_dawn', 'voice_state', 'yes');
      expect('fa_b_blackbird', 'spring', 'civil_dusk', 'voice_state', 'yes');
      expect('fa_b_ruff', 'autumn', 'daylight', 'voice_state', 'no_source');
      expect('fa_b_bittern', 'spring', 'night', 'voice_state', 'yes');
      expect('fa_b_bittern', 'summer', 'civil_dusk', 'voice_state', 'yes');
      expect('fa_b_bittern', 'summer', 'civil_dusk', 'source_refs', 'books-evidence-v1/fauna-mammals-birds.csv#L178');
      expect('fa_b_bittern', 'summer', 'civil_dusk', 'confidence', 'C');
      expect('fa_b_bittern', 'autumn', 'civil_dusk', 'voice_state', 'no_source');
      expect('fa_b_black_grouse', 'spring', 'daylight', 'voice_state', 'yes');
      expect('fa_b_black_grouse', 'autumn', 'daylight', 'voice_state', 'no_source');
      expect('fa_b_snipe', 'spring', 'civil_dusk', 'voice_state', 'yes');
      expect('fa_b_snipe', 'autumn', 'civil_dusk', 'voice_state', 'no_source');
      expect('fa_b_corncrake', 'autumn', 'night', 'voice_state', 'no');
      expect('fa_b_nightjar', 'autumn', 'night', 'voice_state', 'no');
      expect('fa_b_woodlark', 'autumn', 'night', 'voice_state', 'no');
      expect('fa_b_common_crane', 'autumn', 'night', 'voice_state', 'yes');
      expect('fa_m_wild_boar', 'summer', 'civil_dusk', 'visibility_state', 'yes');
      expect('fa_b_swift', 'summer', 'civil_dawn', 'voice_state', 'yes');
      expect('fa_m_wolf', 'spring', 'night', 'voice_state', 'yes');
      expect('fa_m_wolf', 'spring', 'civil_dawn', 'voice_state', 'yes');
      expect('fa_m_whiskered_bat', 'spring', 'civil_dusk', 'voice_state', 'yes');
      expect('fa_b_ural_owl', 'spring', 'night', 'voice_state', 'yes');
      expect('fa_b_goosander', 'spring', 'daylight', 'voice_state', 'yes');
      expect('fa_b_grey_heron', 'spring', 'daylight', 'voice_state', 'yes');
      expect('fa_b_white_fronted_goose', 'spring', 'night', 'voice_state', 'yes');
      expect('fa_b_white_fronted_goose', 'spring', 'daylight', 'voice_state', 'yes');
      expect('fa_b_black_throated_loon', 'spring', 'daylight', 'voice_state', 'yes');
      expect('fa_b_black_throated_loon', 'spring', 'civil_dusk', 'voice_state', 'yes');
      expect('fa_b_rook', 'summer', 'daylight', 'voice_state', 'yes');
      expect('fa_m_brown_long_eared_bat', 'summer', 'night', 'voice_state', 'no_source');
      expect('fa_m_mountain_hare', 'summer', 'night', 'voice_state', 'no_source');
      expect('fa_m_wolverine', 'summer', 'night', 'voice_state', 'no_source');
      expect('fa_m_red_squirrel', 'summer', 'daylight', 'voice_state', 'yes');
      expect('fa_m_wild_boar', 'summer', 'night', 'voice_state', 'yes');
      expect('fa_m_roe_deer', 'summer', 'civil_dusk', 'voice_state', 'no_source');
      expect('fa_m_beaver', 'summer', 'night', 'voice_state', 'yes');
      if (voicePhase({ class: 'Aves', activity_time: 'crepuscular', voice_description: 'крик в весенние сумерки' },
          'autumn', 'civil_dusk', true, false) === 'yes') errors.push('seasonal adjective probe accepted');
      if (voicePhase({ class: 'Aves', activity_time: 'crepuscular', voice_description: 'крик в осенних сумерках' },
          'spring', 'civil_dusk', true, false) === 'yes') errors.push('autumn adjective probe accepted');
      if (voicePhase({ class: 'Aves', activity_time: 'crepuscular', voice_description: 'крик в летние сумерки' },
          'winter', 'civil_dusk', true, false) === 'yes') errors.push('summer adjective probe accepted');
      if (voicePhase({ class: 'Aves', activity_time: 'crepuscular', voice_description: 'крик в зимние сумерки' },
          'summer', 'civil_dusk', true, false) === 'yes') errors.push('winter adjective probe accepted');
      const passageVoice = { class: 'Aves', activity_time: 'diurnal', migration_summer: 'breeding',
        voice_description: 'свист «фи», на пролёте голоса слышны ночью' };
      if (voicePhase(passageVoice, 'summer', 'daylight', true, false) !== null) errors.push('independent passage clause lost general song');
      if (voicePhase({ ...passageVoice, voice_description: 'свист на пролёте' },
          'summer', 'daylight', true, false) !== 'no_source') errors.push('single passage clause became general song');
      const owl = find('fa_b_eagle_owl', 'spring', 'daylight');
      const owlTaxon = csv(file(group, 'birds.csv')).rows.find((r) => r.fa_id === 'fa_b_eagle_owl');
      if (!criterionCR({ ...owl, voice_state: 'yes' }, owlTaxon.activity_time, owlTaxon.voice_description)) errors.push('independent CR probe accepted');
      reject('fa_b_eagle_owl', 'spring', 'daylight', 'voice_state', 'yes', 'criterion CR');
      reject('fa_b_common_crane', 'spring', 'night', 'voice_state', 'yes', 'criterion CR');
      reject('fa_m_elk', 'winter', 'daylight', 'confidence', 'B', 'editorial/gap confidence');
      reject('fa_b_bittern', 'spring', 'daylight', 'confidence', 'B', 'mixed facet confidence');
      reject('fa_b_corncrake', 'autumn', 'night', 'voice_state', 'yes', 'audible season');
      reject('fa_b_bittern', 'autumn', 'civil_dusk', 'voice_state', 'yes', 'voice phase/season');
      reject('fa_b_black_grouse', 'autumn', 'daylight', 'voice_state', 'yes', 'voice phase/season');
      reject('fa_b_snipe', 'autumn', 'civil_dusk', 'voice_state', 'yes', 'voice phase/season');
      const presenceRows = csv(file(group, 'wild_habitat_presence.csv')).rows;
      const altered = presenceRows.map((p) => ({ ...p }));
      altered.find((p) => p.fa_id === 'fa_m_wolf' && p.season === 'spring').audible = 'false';
      if (!validate(group, table.rows, table.header, altered).some((e) => e.startsWith('presence audible owner fa_m_wolf/spring/')))
        errors.push('mammal presence mutation accepted');
      for (const id of ['fa_m_brown_long_eared_bat', 'fa_m_mountain_hare', 'fa_m_wolverine'])
        if (presenceRows.some((p) => p.fa_id === id && p.audible === 'true')) errors.push(`unsupported mammal audible ${id}`);
      for (const id of ['fa_m_red_squirrel', 'fa_m_wild_boar'])
        if (!presenceRows.some((p) => p.fa_id === id && p.season === 'summer' && p.audible === 'true')) errors.push(`general mammal sound lost ${id}`);
      if (presenceRows.some((p) => p.fa_id === 'fa_m_roe_deer' && p.audible === 'true')) errors.push('roe deer alarm generalized');
      if (!presenceRows.some((p) => p.fa_id === 'fa_m_beaver' && p.season === 'summer' && p.audible === 'true')) errors.push('beaver independent splash lost');
      if (voicePhase({ class: 'Mammalia', activity_time: 'nocturnal', signs_sounds: 'хрюканье, резкое «фрук» при тревоге' },
          'summer', 'night', true, false) !== null) errors.push('general sound before alarm lost');
      if (voicePhase({ class: 'Mammalia', activity_time: 'nocturnal', signs_sounds: 'резкое «фрук» при тревоге' },
          'summer', 'night', true, false) !== 'no_source') errors.push('alarm-only sound generalized');
    } else {
      expect('fa_ins_mosquitoes', 'summer', 'civil_dusk', 'voice_state', 'yes');
      expect('fa_ins_mosquitoes', 'summer', 'night', 'voice_state', 'yes');
      expect('fa_ins_mosquitoes', 'spring_rasputitsa', 'night', 'voice_state', 'yes');
      expect('fa_ins_mosquitoes', 'autumn', 'night', 'voice_state', 'yes');
      expect('fa_ins_horseflies', 'summer', 'daylight', 'visibility_state', 'yes');
      expect('fa_ins_horseflies', 'summer', 'daylight', 'voice_state', 'yes');
      expect('fa_dom_cattle', 'summer', 'daylight', 'visibility_state', 'no_source');
      expect('fa_dom_cattle', 'summer', 'night', 'visibility_state', 'no_source');
      expect('fa_dom_chicken', 'summer', 'night', 'visibility_state', 'no_source');
      expect('fa_dom_horse', 'summer', 'night', 'visibility_state', 'no_source');
      expect('fa_dom_cat', 'summer', 'daylight', 'visibility_state', 'no_source');
      expect('fa_crust_noble_crayfish', 'summer', 'night', 'visibility_state', 'yes');
      expect('fa_ins_mosquitoes', 'summer', 'civil_dawn', 'voice_state', 'yes');
      expect('fa_ins_mosquitoes', 'summer', 'civil_dawn', 'rule_ref', 'fauna-mammals-birds/fauna/activity_phase_rules.json#mosquito-dawn-sound');
      expect('fa_ins_mosquitoes', 'summer', 'civil_dawn', 'voice_text_ref', 'invertebrates_herps.csv#fa_ins_mosquitoes.perceptual_cues');
      expect('fa_dom_chicken', 'winter', 'night', 'voice_state', 'yes');
      expect('fa_dom_chicken', 'summer', 'daylight', 'voice_state', 'yes');
      expect('fa_dom_chicken', 'winter', 'civil_dawn', 'voice_state', 'no_source');
      expect('fa_dom_chicken', 'summer', 'civil_dawn', 'voice_state', 'no_source');
      expect('fa_amph_common_frog', 'summer', 'night', 'visibility_state', 'no_source');
      expect('fa_amph_common_frog', 'summer', 'night', 'rule_ref', 'fauna-mammals-birds/fauna/activity_phase_rules.json#frog-damp-night');
      expect('fa_fish_burbot', 'winter', 'night', 'visibility_state', 'no_source');
      expect('fa_fish_zander', 'spring_rasputitsa', 'night', 'visibility_state', 'no_source');
      expect('fa_ins_mosquitoes', 'winter', 'night', 'confidence', 'C');
      reject('fa_ins_mosquitoes', 'summer', 'civil_dawn', 'rule_ref', '', 'mosquito dawn channel');
      reject('fa_dom_chicken', 'winter', 'night', 'source_refs', '', 'rooster phase/channel');
      reject('fa_ins_mosquitoes', 'summer', 'daylight', 'voice_state', 'yes', 'fish voice owner');
      reject('fa_ins_horseflies', 'summer', 'daylight', 'voice_state', 'no_source', 'cue phase');
      reject('fa_ins_grasshoppers', 'summer', 'daylight', 'voice_state', 'no_source', 'fish voice owner');
      reject('fa_ins_mosquitoes', 'summer', 'civil_dawn', 'voice_text_ref', 'invertebrates_herps.csv#invented.perceptual_cues', 'unresolved voice text');
      reject('fa_ins_horseflies', 'summer', 'daylight', 'source_refs', 'invertebrates_herps.csv#invented.perceptual_cues', 'unresolved source');
      reject('fa_ins_mosquitoes', 'winter', 'night', 'confidence', 'B', 'dormant confidence');
      reject('fa_amph_common_frog', 'summer', 'night', 'visibility_state', 'yes', 'conditional frog');
      reject('fa_fish_burbot', 'winter', 'night', 'visibility_state', 'yes', 'fish spawning visibility');
      reject('fa_fish_zander', 'spring_rasputitsa', 'night', 'visibility_state', 'yes', 'fish spawning visibility');
      reject('fa_ins_mosquitoes', 'summer', 'civil_dawn', 'rule_ref', 'fauna-mammals-birds/fauna/activity_phase_rules.json#invented', 'unresolved rule');
      reject('fa_ins_horseflies', 'summer', 'daylight', 'source_refs', 'invertebrates_herps.csv#fa_ins_horseflies.perceptual_cues.extra', 'unresolved source');
      reject('fa_ins_horseflies', 'summer', 'daylight', 'voice_text_ref', 'invertebrates_herps.csv#fa_ins_horseflies.perceptual_cues.extra', 'unresolved voice text');
      reject('fa_ins_horseflies', 'summer', 'daylight', 'source_refs', 'invertebrates_herps.csv#L2', 'unresolved source');
      reject('fa_ins_horseflies', 'summer', 'daylight', 'voice_text_ref', 'invertebrates_herps.csv#L2', 'unresolved voice text');
      reject('fa_crust_noble_crayfish', 'summer', 'night', 'source_refs', 'books-evidence-v1/fauna-fish-invertebrates-livestock.csv#L1', 'unresolved source');
      const legacyRows = csv(file(group, 'fauna_presence.csv')).rows.map((p) => ({ ...p }));
      legacyRows.find((p) => p.fa_id === 'fa_mamm_house_mouse').fa_id = 'fa_mamm_new_probe';
      if (!validate(group, table.rows, table.header, legacyRows).some((e) => e.startsWith('unmapped legacy mammal')))
        errors.push('new legacy mammal accepted');
      const changedHints = structuredClone(require('../../fauna-fish-invertebrates-livestock/scripts/src/phase_cues.json'));
      changedHints.fa_ins_mosquitoes.phases.daylight = ['no_source', 'yes'];
      const changedRows = table.rows.map((r) => ({ ...r }));
      const daytimeMosquito = changedRows.find((r) => r.fa_id === 'fa_ins_mosquitoes' && r.season === 'summer' && r.phase === 'daylight');
      Object.assign(daytimeMosquito, { voice_state: 'yes', voice_text_ref: 'invertebrates_herps.csv#fa_ins_mosquitoes.perceptual_cues',
        source_refs: 'invertebrates_herps.csv#fa_ins_mosquitoes.perceptual_cues', no_source: '' });
      if (!validate(group, changedRows, table.header, undefined, changedHints).some((e) => e.startsWith('criterion fish CR')))
        errors.push('daytime mosquito with altered hints accepted');
      const chicken = find('fa_dom_chicken', 'winter', 'night');
      reject('fa_dom_chicken', 'winter', 'night', 'source_refs', chicken.source_refs.split(';').filter((r) => !r.includes('#pl_')).join(';'), 'chicken occurrence refs');
      reject('fa_dom_cat', 'summer', 'daylight', 'confidence', 'B', 'editorial/gap confidence');
      reject('fa_dom_cattle', 'summer', 'daylight', 'visibility_state', 'yes', 'livestock visibility');
      reject('fa_dom_cattle', 'summer', 'night', 'visibility_state', 'yes', 'livestock visibility');
      reject('fa_dom_chicken', 'summer', 'night', 'visibility_state', 'no', 'livestock visibility');
      const missing = table.rows.filter((r) => r.phase_rule_id !== 'fpa_fa_dom_cattle_summer_daylight');
      if (!validate(group, missing, table.header).some((e) => e.startsWith('missing fa_dom_cattle|summer|daylight'))) errors.push('missing livestock probe accepted');
    }
  }
  console.log(JSON.stringify({ group, rows: table.rows.length, errors: errors.slice(0, 20) }));
  if (errors.length) process.exitCode = 1;
}
module.exports = { validate, csv, HEADER };
