#!/usr/bin/env python3
"""Acceptance checks for clothing-appearance candidate data. Exit 1 on any failure.

garments:  every costume item (180) transferred or rejected with reason; every garment has slot and season;
           the 20 costume anti-patterns (+ extra anachronisms) are applied as a denylist.
outfits:   same rule as approved-procedural-npc.js approvedClothing(): for each (role, sex, age, season)
           at most one variant (exactly one where the sex is supported); each slot exactly one template;
           owner/holder/controller = actor; every role mapped to exactly one profile.
adornment: every appearance value is in ACTOR_BASE_APPEARANCE_VOCABULARY, else needs_vocabulary_extension=true;
           weights are positive integers given by the frequency-class rule.
"""
import csv, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NOV = ROOT.parents[1]
REPO = ROOT.parents[4]
ACTORS_JS = Path('C:/Users/Slaven/Documents/Novgorod-runtime/packages/actors/src/index.js')
SEASONS = ['summer', 'spring', 'spring_rasputitsa', 'autumn', 'winter']
FREQ = {'ubiquitous': 8, 'common': 4, 'contextual': 2, 'rare': 1}
fails, info = [], []


def rd(p, d=','):
    with open(p, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f, delimiter=d))


def fail(msg):
    fails.append(msg)


def vocab():
    if ACTORS_JS.exists():
        txt = ACTORS_JS.read_text(encoding='utf-8')
        block = re.search(r'ACTOR_BASE_APPEARANCE_VOCABULARY = deepFreeze\(\{(.*?)\}\);', txt, re.S).group(1)
        out = {k: re.findall(r"'([a-z_]+)'", v) for k, v in re.findall(r'(\w+):\s*\[([^\]]*)\]', block)}
        info.append(f'vocabulary read from {ACTORS_JS}')
        return out
    info.append('vocabulary: actors package not found, using embedded copy (2026-09-26)')
    return {'sex_category': ['male', 'female'], 'age_category': ['young_adult', 'adult', 'middle_aged', 'old'],
            'build': ['slim', 'average', 'stocky'], 'skin_tone': ['pale', 'light', 'warm', 'brown'],
            'face_shape': ['oval', 'round', 'broad', 'angular', 'long'],
            'hair_color': ['blond', 'light_brown', 'dark_brown', 'black', 'auburn', 'gray', 'white'],
            'hair_length': ['bald', 'short', 'medium', 'long'], 'hair_style': ['straight', 'wavy', 'loose', 'braided'],
            'facial_hair': ['none', 'moustache', 'short_beard', 'full_beard'],
            'eye_color': ['blue', 'gray', 'green', 'brown', 'dark']}


def main():
    V = vocab()
    ages = V['age_category']
    costume = rd(NOV / 'sources/costume-dataset-v1/data/catalog_items.csv')
    disp = rd(ROOT / 'garments/costume_disposition.csv')
    garments = rd(ROOT / 'garments/garments.csv')
    comps = rd(ROOT / 'garments/garment_components.csv')
    slots = {r['slot_key'] for r in rd(ROOT / 'garments/equipment_slots.csv')}
    deny = rd(ROOT / 'garments/denylist.csv')
    outfits = rd(ROOT / 'outfits_by_role/outfits.csv')
    rmap = rd(ROOT / 'outfits_by_role/role_clothing_map.csv')
    prof = json.loads((ROOT / 'outfits_by_role/runtime_clothing_profiles.json').read_text(encoding='utf-8'))['clothing_profiles']
    adorn = rd(ROOT / 'adornment_appearance/adornment.csv')
    roles = rd(REPO / 'data/novgorod-region/novgorod_social_roles_v1_enriched.tsv', '\t')

    # ---- garments
    ids = [r['item_id'] for r in costume]
    dids = [r['source_item_id'] for r in disp]
    if sorted(ids) != sorted(dids):
        fail(f'disposition covers {len(set(dids))} of {len(ids)} costume items')
    for r in disp:
        if r['disposition'] == 'reject' and not r['reason']:
            fail(f'reject without reason: {r["source_item_id"]}')
    gm = {g['gm_id']: g for g in garments}
    for g in garments + comps:
        if g['equipment_slot'] not in slots:
            fail(f'{g["gm_id"]}: slot {g["equipment_slot"]!r} not in equipment_slots.csv')
        if not g['season'] or any(s not in SEASONS for s in g['season'].split('|')):
            fail(f'{g["gm_id"]}: bad season {g["season"]!r}')
        if g['confidence'] not in ('A', 'B', 'C') or not g['source_refs']:
            fail(f'{g["gm_id"]}: confidence/source_refs missing')
        if g['status'] != 'candidate':
            fail(f'{g["gm_id"]}: status must be candidate')
    moved = {r['source_item_id'] for r in disp if r['target'].startswith('garments/')}
    have = {g['source_item_id'] for g in garments + comps if g['source_item_id']}
    if moved != have:
        fail(f'disposition/garments mismatch: {sorted(moved ^ have)}')
    adorn_moved = {r['source_item_id'] for r in disp if r['disposition'] == 'adornment'}
    adorn_have = {a['source_item_id'] for a in adorn if a['source_item_id']}
    if adorn_moved != adorn_have:
        fail(f'disposition/adornment mismatch: {sorted(adorn_moved ^ adorn_have)}')
    # denylist
    deny_hits = 0
    for d in deny:
        rx = re.compile(d['pattern'], re.I)
        for g in garments + comps:
            if d['deny_id'] == 'ANTI005' and g['gm_id'] == 'gm_new_lapti':
                continue
            for f in ('name_ru', 'material', 'dye_color', 'decoration'):
                if rx.search(g.get(f, '')):
                    fail(f'denylist {d["deny_id"]} hit in {g["gm_id"]}.{f}: {g[f][:60]}'); deny_hits += 1
        for a in adorn:
            if rx.search(a['name_ru'] + ' ' + a['material']):
                fail(f'denylist {d["deny_id"]} hit in adornment {a["ad_id"]}'); deny_hits += 1
    info.append(f'denylist: {len(deny)} patterns applied, {deny_hits} hits')

    # ---- outfits.csv
    slot_cols = [c for c in outfits[0] if c.startswith('slot_')]
    for o in outfits:
        for c in slot_cols:
            v = o[c]
            if not v:
                continue
            g = gm.get(v)
            if not g:
                fail(f'{o["of_id"]}.{c}: {v} unresolved'); continue
            if v == 'gm_new_lapti':
                fail(f'{o["of_id"]}: lapti used in outfit (ANTI005 / disputed dating)')
            if g['runtime_daily_eligible'] != 'true':
                fail(f'{o["of_id"]}.{c}: {v} not daily-eligible')
            if g['equipment_slot'] != c[5:]:
                fail(f'{o["of_id"]}.{c}: {v} has slot {g["equipment_slot"]}')
        req = o['required_clothing_slot_refs'].split('|')
        filled = [c[5:] for c in slot_cols if o[c]]
        if sorted(req) != sorted(filled):
            fail(f'{o["of_id"]}: required slots {req} != filled {filled}')
    # uniqueness of (class, sex, season, marital) in outfits.csv
    keys = {}
    for o in outfits:
        for s in o['seasons'].split('|'):
            for a in o['age_categories'].split('|'):
                k = (o['costume_class'], o['sex_categories'], a, s, o['marital_status'])
                keys[k] = keys.get(k, 0) + 1
    dup = [k for k, n in keys.items() if n > 1]
    if dup:
        fail(f'outfits.csv duplicate combinations: {dup[:5]}')

    # ---- runtime projection (approvedClothing rule)
    role_ids = {r['role_id'] for r in roles}
    mapped = {}
    for r in rmap:
        if r['clothing_profile_id']:
            mapped.setdefault(r['role_ref'], []).append(r['clothing_profile_id'])
    unmapped = sorted(role_ids - set(mapped))
    if unmapped:
        fail(f'roles without clothing profile: {unmapped}')
    for rid, ps in mapped.items():
        if len(ps) != 1:
            fail(f'role {rid} mapped to {len(ps)} profiles')
    pid = {p['id']: p for p in prof}
    for rid, ps in mapped.items():
        if ps and rid not in pid[ps[0]]['allowed_role_refs']:
            fail(f'role {rid} missing from {ps[0]}.allowed_role_refs')
    combos_checked = 0
    for p in prof:
        pb = p['property_binding']
        if any(pb.get(k) != 'actor' for k in ('owner', 'holder', 'controller')) or not pb.get('source_ref'):
            fail(f'{p["id"]}: property_binding must be owner/holder/controller=actor with source_ref')
        if not p['allowed_occupation_refs']:
            fail(f'{p["id"]}: no allowed_occupation_refs')
        sexes = {v['sex_categories'][0] for v in p['variants']}
        for sex in V['sex_category']:
            for age in ages:
                for season in SEASONS:
                    m = [v for v in p['variants'] if sex in v['sex_categories'] and age in v['age_categories']
                         and season in v['seasons']]
                    combos_checked += 1
                    if len(m) > 1 or (sex in sexes and len(m) != 1):
                        fail(f'{p["id"]}: {sex}/{age}/{season} -> {len(m)} variants')
        for v in p['variants']:
            sl = v['required_clothing_slot_refs']
            t = v['equipment_templates']
            if not sl or len(set(sl)) != len(sl):
                fail(f'{v["id"]}: empty/duplicate slots')
            if len({x['equipment_candidate_id'] for x in t}) != len(t):
                fail(f'{v["id"]}: duplicate equipment_candidate_id')
            for s in sl:
                if sum(1 for x in t if x['equipment_slot_category_id'] == s) != 1:
                    fail(f'{v["id"]}: slot {s} must have exactly one template')
            for x in t:
                if x['physical_position'] != 'equipped' or x['equipment_slot_category_id'] not in sl:
                    fail(f'{v["id"]}: template {x["equipment_candidate_id"]} invalid')
                if x['gm_id'] not in gm:
                    fail(f'{v["id"]}: {x["gm_id"]} unresolved')
    info.append(f'runtime rule: {len(prof)} profiles, {sum(len(p["variants"]) for p in prof)} variants, {combos_checked} (profile, sex, age, season) combinations checked')
    unsupported = [(p['id'], s) for p in prof for s in V['sex_category'] if s not in {v['sex_categories'][0] for v in p['variants']}]
    info.append(f'profiles without variants for a sex (by design, runtime will report PROCEDURAL_NPC_CLOTHING_DATA_GAP): {unsupported}')

    # ---- adornment / appearance
    for a in adorn:
        if a['appearance_facet']:
            inv = a['vocabulary_value'] in V.get(a['appearance_facet'], [])
            if not inv and a['needs_vocabulary_extension'] != 'true':
                fail(f'{a["ad_id"]}: value outside vocabulary without needs_vocabulary_extension')
            if inv and a['needs_vocabulary_extension'] != 'false':
                fail(f'{a["ad_id"]}: value in vocabulary but flagged for extension')
        if a['weight'] != '':
            if not re.fullmatch(r'[1-9]\d*', a['weight']) or int(a['weight']) != FREQ.get(a['frequency_class']):
                fail(f'{a["ad_id"]}: weight {a["weight"]} does not follow frequency rule')
            if not a['source_refs']:
                fail(f'{a["ad_id"]}: weight without source')
        if a['confidence'] not in ('A', 'B', 'C'):
            fail(f'{a["ad_id"]}: bad confidence')
        for s in (a['age'] or '').split('|'):
            if s and s not in ages:
                fail(f'{a["ad_id"]}: age {s} outside vocabulary')

    # ---- counts
    counts = {}
    for p in sorted(ROOT.rglob('*.csv')):
        counts[str(p.relative_to(ROOT)).replace('\\', '/')] = len(rd(p))
    counts['outfits_by_role/runtime_clothing_profiles.json (profiles/variants)'] = f'{len(prof)}/{sum(len(p["variants"]) for p in prof)}'
    print(json.dumps(dict(result='FAIL' if fails else 'PASS', failures=fails, info=info, row_counts=counts),
                     ensure_ascii=False, indent=1))
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
