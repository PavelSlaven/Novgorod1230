// Builds narrator natural texts: 32 G4 x 4 seasons x 13 layers (with seasonal conditions), weather
// and light variants, habitat allowlists and pool-member phrases. node natural_presentation_texts/scripts/build.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, readTsv, readCsv, writeCsv, SEASONS, SHARED, GROUP_DIR } from '../../_shared/scripts/lib.mjs';
import * as L from '../authoring/lexicon.mjs';
import MEMBERS, { LANDSCAPE_TAXA, EXTRA_MEMBERS } from '../authoring/members.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const g4index = readJson(path.join(SHARED, 'g4_nature_index.json'));
const landscapes = Object.fromEntries(readTsv(path.join(SHARED, 'novgorod_landscape_templates.world_db.tsv')).map((l) => [l.id, l]));
const deny = readJson(path.join(SHARED, 'anachronism_denylist.json'));
const clim = readCsv(path.join(GROUP_DIR, 'weather_climate', 'weather_season_climatology.csv'));
const lightProfile = readCsv(path.join(GROUP_DIR, 'weather_climate', 'light_profile_by_month.csv'));
const ALL_MEMBERS = { ...MEMBERS, ...EXTRA_MEMBERS };
const SRC_G4 = 'pr98:data/world-catalogs/novgorod/m2c-natural/nature-successor-candidate-v2.json';
const SRC_PRES = 'pr98:data/world-catalogs/novgorod/m2c-natural-presentation/candidate.json';
const SRC_PHEN = 'game-base-v1/nature-materials-weather/weather_climate/seasonal_phenomena.csv';
const SRC_LEX = 'game-base-v1/nature-materials-weather/natural_presentation_texts/authoring/lexicon.mjs (editorial)';
const expandSrc = (s) => s.map((x) => (x === 'g4_members' ? SRC_G4 : x === 'lt_templates' ? 'world_db.world_base.landscape_templates.dominant_vegetation (draft)' : x));

// ---------- habitat allowlist per G4 ----------
const allow = [];
const allowSet = {};
const deniedWords = [];
for (const g of g4index.g4) {
  const set = new Map();
  for (const m of g.members) if (m.kind !== 'material') set.set(m.ref, { source: 'successor_member', frequency_category: m.frequency_category, layer: m.layer });
  const lt = landscapes[g.landscape_template_id];
  for (const tok of lt.dominant_vegetation.split(/[,;]\s*/).map((t) => t.trim()).filter(Boolean)) {
    const words = tok.split(/\s+/);
    for (const w of words) {
      if (deny.terms_ru.some((d) => w.startsWith(d.replace('!', '')))) { deniedWords.push({ g4: g.g4_short, word: w, landscape: lt.id }); continue; }
      const key = LANDSCAPE_TAXA[w];
      if (key && !set.has(key)) set.set(key, { source: 'landscape_dominant_vegetation', frequency_category: '', layer: '' });
    }
  }
  allowSet[g.g4_id] = set;
  for (const [ref, v] of set) allow.push({ row_id: `hab_${g.g4_short}__${ref.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}`, g4_ref: g.g4_id, g4_short: g.g4_short, member_ref: ref, taxon_words: (ALL_MEMBERS[ref]?.taxon_words || []).join('|'), source: v.source, frequency_category: v.frequency_category, seasons: SEASONS, source_refs: [v.source === 'successor_member' ? `${SRC_G4}#${g.g4_id}` : `world_db.world_base.landscape_templates#${lt.id}.dominant_vegetation`], confidence: 'C', status: 'candidate' });
}

// ---------- helpers ----------
const floodable = (g) => (g.water_body_type || ['floodplain', 'riverbank', 'marsh'].includes(landscapes[g.landscape_template_id].landscape_group)) && !['rolling_hills', 'flat_hill_or_mountain'].includes(g.relief);
const surfaceConds = (g, s) => ({ winter: ['snow', 'no_snow'], spring: floodable(g) ? ['flood', 'thawed'] : ['thawed'], summer: ['default'], autumn: ['default'] })[s];
const waterConds = (s) => ({ winter: ['ice'], spring: ['ice_breaking', 'high_water'], summer: ['open'], autumn: ['open', 'ice_forming'] })[s];
const REQ = { snow: 'ground_state=snow', no_snow: 'ground_state!=snow and season=winter', flood: 'phenomenon wxp_spring_flood active', thawed: 'no flood', ice: 'water_condition=ice', ice_breaking: 'water_condition=ice_breaking', high_water: 'water_condition=high_water', open: 'water_condition=open', ice_forming: 'water_condition=ice_forming', default: '', light_night: 'light_profile.light_night=true', dark_night: 'light_profile.light_night=false' };
const treeTaxa = (g) => [...allowSet[g.g4_id].keys()].filter((k) => L.TREE_NAMES[k]);
const joinRu = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' и ' + a[a.length - 1]);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const rows = [];
const add = (g, layer, season, condition, channel, clear, partial, extra = {}) => {
  if (!clear) return;
  rows.push({ npt_id: `npt_${g.g4_short}__${layer}__${season}__${condition}${extra.suffix ? '__' + extra.suffix : ''}`, g4_ref: g.g4_id, g4_short: g.g4_short, layer, season_period: season, condition, requires: extra.requires ?? REQ[condition] ?? '', channel, clear_text: clear, partial_text: partial, loudness: extra.loudness ?? '', member_ref: extra.member_ref || '', layer_class: extra.cls || '',
    source_refs: [`${SRC_G4}#${g.g4_id}/${layer}`, SRC_LEX, ...(extra.src || [])], confidence: 'C', status: 'candidate' });
};

for (const g of g4index.g4) {
  const app = g.applicability;
  const hasWater = !!g.water_body_type;
  for (const s of SEASONS) {
    // surface
    if (app.surface === 'present') for (const c of surfaceConds(g, s)) { const p = L.SURFACE[g.surface]?.[s]?.[c] || L.SURFACE[g.surface]?.[s]?.thawed; add(g, 'surface', s, c, 'visual', p?.[0], p?.[1], { cls: g.surface, src: [SRC_PHEN] }); }
    // relief
    if (app.relief === 'present') for (const c of s === 'winter' ? ['snow', 'no_snow'] : ['default']) { const r = L.RELIEF[g.relief]; const p = c === 'snow' ? r.snow : r.any; add(g, 'relief', s, c, 'visual', p[0], p[1], { cls: g.relief }); }
    // water body
    if (app.water_body === 'present' && hasWater) for (const c of waterConds(s)) { const p = L.WATER[g.water_body_type]?.[s]?.[c]; add(g, 'water_body', s, c, 'visual', p?.[0], p?.[1], { cls: g.water_body_type, src: [SRC_PHEN] }); }
    // bank: split winter into snow/no_snow only for classes whose text names snow explicitly
    if (app.bank_structure === 'present' && hasWater) {
      const key = g.bank || g.surface; const b = L.BANK[key] || L.BANK[g.surface];
      if (s === 'winter' && b?.winter_no_snow) {
        add(g, 'bank_structure', s, 'snow', 'visual', b.winter[0], b.winter[1], { cls: key, requires: REQ.snow });
        add(g, 'bank_structure', s, 'no_snow', 'visual', b.winter_no_snow[0], b.winter_no_snow[1], { cls: key, requires: REQ.no_snow });
      } else { const p = b?.[s]; add(g, 'bank_structure', s, 'default', 'visual', p?.[0], p?.[1], { cls: key }); }
    }
    // trees: requires now falls through to REQ[condition] (ground_state=snow in winter); WK refs
    // are attached only for the species actually named in {taxa}/{taxa_winter}.
    if (app.tree_layer === 'present' && g.tree) {
      const tx = treeTaxa(g); const t = L.TREES[g.tree];
      let clear; if (tx.length) {
        const names = s === 'winter' ? tx.map((k) => L.TREE_NAMES[k].winter) : tx.map((k) => L.TREE_NAMES[k].plural);
        clear = t[s][0].replace('{taxa_winter}', joinRu(names)).replace('{taxa}', s === 'winter' ? '' : `среди них ${joinRu(names)}`);
      } else clear = t.generic[0];
      const taxaSrc = [...new Set(tx.flatMap((k) => expandSrc(ALL_MEMBERS[k]?.src || [])))];
      add(g, 'tree_layer', s, s === 'winter' ? 'snow' : 'default', 'visual', clear, t[s][1], { cls: g.tree, src: taxaSrc });
    }
    if (app.shrub_layer === 'present' && g.shrub) {
      const sh = L.SHRUB[g.shrub];
      if (s === 'winter') { add(g, 'shrub_layer', s, 'snow', 'visual', sh.winter[0], sh.winter[1], { cls: g.shrub, requires: REQ.snow }); add(g, 'shrub_layer', s, 'no_snow', 'visual', sh.winter_no_snow[0], sh.winter_no_snow[1], { cls: g.shrub, requires: REQ.no_snow }); }
      else { const p = sh[s]; add(g, 'shrub_layer', s, 'default', 'visual', p[0], p[1], { cls: g.shrub }); }
    }
    if (app.ground_cover === 'present' && g.ground) {
      const gr = L.GROUND[g.ground];
      if (s === 'winter' && gr?.winter_no_snow) { add(g, 'ground_cover', s, 'snow', 'visual', gr.winter[0], gr.winter[1], { cls: g.ground, requires: REQ.snow }); add(g, 'ground_cover', s, 'no_snow', 'visual', gr.winter_no_snow[0], gr.winter_no_snow[1], { cls: g.ground, requires: REQ.no_snow }); }
      else { const p = gr?.[s]; add(g, 'ground_cover', s, 'default', 'visual', p?.[0], p?.[1], { cls: g.ground }); }
    }
    if (app.riparian_vegetation === 'present' && g.riparian) {
      const tx = [...allowSet[g.g4_id].keys()].filter((k) => L.RIPARIAN_NAMES[k]);
      const rip = L.RIPARIAN[g.riparian];
      const withTaxa = (base, key) => { const suffix = tx.length ? ' ' + L.RIPARIAN_TAXA[key].replace('{taxa_riparian}', joinRu(tx.map((k) => (key === 'winter' ? L.RIPARIAN_NAMES[k].winter : L.RIPARIAN_NAMES[k].plural)))) : ''; return base + suffix; };
      if (s === 'winter' && rip.winter_no_snow) {
        add(g, 'riparian_vegetation', s, 'snow', 'visual', withTaxa(rip.winter[0], 'winter'), rip.winter[1], { cls: g.riparian, requires: REQ.snow });
        add(g, 'riparian_vegetation', s, 'no_snow', 'visual', withTaxa(rip.winter_no_snow[0], 'winter_no_snow'), rip.winter_no_snow[1], { cls: g.riparian, requires: REQ.no_snow });
      } else { const p = rip[s]; add(g, 'riparian_vegetation', s, 'default', 'visual', withTaxa(p[0], s), p[1], { cls: g.riparian }); }
    }
    // natural materials
    if (app.natural_materials === 'present') {
      const frags = g.ambient_materials.map((m) => L.MATERIALS[m]?.[s]).filter(Boolean);
      if (frags.length) {
        if (s === 'winter') {
          add(g, 'natural_materials', s, 'snow', 'visual', L.MATERIALS_FRAME.winter[0].replace('{list}', joinRu(frags)), L.MATERIALS_FRAME.winter[1], { cls: g.ambient_materials.join('+'), requires: REQ.snow });
          add(g, 'natural_materials', s, 'no_snow', 'visual', L.MATERIALS_FRAME.winter_no_snow[0].replace('{list}', joinRu(frags)), L.MATERIALS_FRAME.winter_no_snow[1], { cls: g.ambient_materials.join('+'), requires: REQ.no_snow });
        } else { const f = L.MATERIALS_FRAME[s]; add(g, 'natural_materials', s, 'default', 'visual', f[0].replace('{list}', joinRu(frags)), f[1], { cls: g.ambient_materials.join('+') }); }
      }
    }
    // seasonal state
    if (app.seasonal_state === 'present') {
      const grp = hasWater ? 'water' : g.light_exposure === 'limited' ? 'forest' : 'open';
      const conds = Object.keys(L.SEASONAL[grp][s]).filter((c) => c !== 'flood' || floodable(g));
      for (const c of conds) { const p = L.SEASONAL[grp][s][c]; add(g, 'seasonal_state', s, c, 'visual', p[0], p[1], { cls: grp, src: [SRC_PHEN] }); }
    }
    // light: season x phase (+ summer night light/dark variant; winter dawn/dusk/night snow/no_snow)
    if (app.light === 'present') for (const ph of Object.keys(L.LIGHT)) {
      const exp = L.LIGHT_EXPOSURE[g.light_exposure] || ['', ''];
      const lightSrc = ['main:data/world-catalogs/novgorod/temporal-v4/datasets/calendar_daylight_light_profiles.json', 'game-base-v1/nature-materials-weather/weather_climate/light_profile_by_month.csv'];
      if (s === 'winter' && L.LIGHT_NO_SNOW[ph]) {
        for (const c of ['snow', 'no_snow']) {
          const base = c === 'snow' ? L.LIGHT[ph][s] : L.LIGHT_NO_SNOW[ph];
          const clear = [base, ph === 'daylight' ? exp[1] : exp[0]].filter(Boolean).join(' ');
          add(g, 'light', s, c, 'visual', clear, L.LIGHT_PARTIAL[ph], { cls: g.light_exposure, suffix: ph, requires: `light_phase=${ph}; ${REQ[c]}`, src: lightSrc });
        }
        continue;
      }
      const conds = ph === 'night' && s === 'summer' ? ['light_night', 'dark_night'] : ['default'];
      for (const c of conds) {
        let base = L.LIGHT[ph][s];
        if (c === 'dark_night') base = 'Ночь короткая; темно лишь в глухие часы.';
        const clear = [base, ph === 'daylight' ? exp[1] : exp[0]].filter(Boolean).join(' ');
        add(g, 'light', s, c, 'visual', clear, L.LIGHT_PARTIAL[ph], { cls: g.light_exposure, suffix: ph, requires: `light_phase=${ph}${REQ[c] ? '; ' + REQ[c] : ''}`, src: lightSrc });
      }
    }
    // weather: available states in season x plausible phases x local modifier
    if (app.weather === 'present') {
      const local = g.light_exposure === 'limited' ? 'forest' : hasWater ? (s === 'winter' ? 'water_ice' : 'water_open') : 'open';
      const phases = { winter: ['snow', 'sleet'], spring: ['snow', 'sleet', 'rain'], summer: ['rain'], autumn: ['rain', 'sleet', 'snow'] }[s];
      for (const c of clim.filter((x) => x.season_period === s && Number(x.entry_weight) > 0)) {
        const st = c.wx_state_id;
        const keys = Object.keys(L.WEATHER).filter((k) => k.startsWith(st + '__') && (k.endsWith('__none') || phases.includes(k.split('__')[1])));
        for (const k of keys) {
          const ph = k.split('__')[1];
          const kind = st.includes('windy') ? 'wind' : st === 'wx_fog' ? 'fog' : ph !== 'none' ? 'precip' : '';
          const loc = kind ? L.WEATHER_LOCAL[local][kind] : '';
          add(g, 'weather', s, st, 'visual', [L.WEATHER[k][0], loc].filter(Boolean).join(' '), L.WEATHER[k][1], { cls: local, suffix: ph, requires: `weather_state=${st}; precipitation_phase=${ph}`, src: ['game-base-v1/nature-materials-weather/weather_climate/realized_weather_matrix.csv#wxr_' + st.slice(3) + '__' + ph, 'game-base-v1/nature-materials-weather/weather_climate/local_landscape_modifiers.csv'] });
        }
      }
    }
    // audible
    if (app.audible_context === 'present') {
      const a = L.AUDIBLE[g.audible]; const cs = Object.keys(a[s]);
      for (const c of cs) { if (c === 'high_water' && !floodable(g)) continue; const p = a[s][c]; add(g, 'audible_context', s, c, 'acoustic', p[0], p[1], { cls: g.audible, loudness: p[2], src: ['pr98:data/world-catalogs/novgorod/m2c-acoustic/approved/spatial_v3_g6_acoustic_baselines.json', SRC_PRES] }); }
    }
  }
}

// ---------- member phrases ----------
// npm_id is built from the full member_ref (not just its first word / kind), so distinct members
// that share a first word (e.g. "alluvial sand and silt" vs "alluvial silt and clay") get distinct ids.
const slugRef = (ref) => ref.toLowerCase().replace(/\(.*?\)/g, '').trim().replace(/[^a-zа-яё0-9]+/gi, '_').replace(/^_+|_+$/g, '');
const memberRows = [];
const usedMembers = new Set(); for (const g of g4index.g4) for (const k of allowSet[g.g4_id].keys()) usedMembers.add(k);
for (const g of g4index.g4) for (const m of g.members) if (m.kind === 'material') usedMembers.add(m.ref);
for (const ref of [...usedMembers].sort()) {
  const m = ALL_MEMBERS[ref]; if (!m) { console.warn('no member lexicon for', ref); continue; }
  const slug = slugRef(ref);
  for (const s of SEASONS) {
    const [vc, vp, ac, ap, loud] = m[s];
    memberRows.push({ npm_id: `npm_${slug}__${s}__visual`, member_ref: ref, member_kind: m.kind, season_period: s, channel: 'visual', clear_text: vc, partial_text: vp, loudness: '', render_condition: m.kind === 'fauna' ? 'only with a committed current trace source (fauna_phase)' : 'member selected for this G4 and season', source_refs: expandSrc(m.src).concat([SRC_LEX]), confidence: 'C', status: 'candidate' });
    if (ac) memberRows.push({ npm_id: `npm_${slug}__${s}__acoustic`, member_ref: ref, member_kind: m.kind, season_period: s, channel: 'acoustic', clear_text: ac, partial_text: ap, loudness: loud, render_condition: m.kind === 'fauna' ? 'only with a committed current sound source' : 'member selected; audible within propagation limits', source_refs: expandSrc(m.src).concat([SRC_LEX]), confidence: 'C', status: 'candidate' });
  }
}

const counts = {
  presentation_texts: writeCsv(path.join(DIR, 'presentation_texts.csv'), rows),
  member_phrases: writeCsv(path.join(DIR, 'member_phrases.csv'), memberRows),
  habitat_allowlist: writeCsv(path.join(DIR, 'habitat_allowlist.csv'), allow),
  denied_landscape_words: writeCsv(path.join(DIR, 'reports', 'denied_landscape_words.csv'), deniedWords.length ? deniedWords : [{ g4: '', word: '', landscape: '' }]),
};
const byLayer = {}; for (const r of rows) byLayer[r.layer] = (byLayer[r.layer] || 0) + 1;
console.log(JSON.stringify(counts), JSON.stringify(byLayer));
