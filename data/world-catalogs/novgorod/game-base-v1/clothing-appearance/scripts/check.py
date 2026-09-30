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
import csv, json, re, shutil, subprocess, sys
from pathlib import Path
from build import HAIR_COVERAGE_EVIDENCE, HEAD_SLOTS, build_archive_inclusion_ledger, build_material_entities, normalized_name

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


def variant_disposition_errors(dispositions, garments):
    garment_ids = {row['gm_id'] for row in garments}
    errors = []
    for row in dispositions:
        if row.get('disposition') != 'variant':
            continue
        target = row.get('target', '')
        target_id = target.rsplit('#', 1)[-1]
        if not target.startswith('garments/garments.csv#') or target_id not in garment_ids:
            errors.append(f"{row.get('source_item_id', '<missing>')}: garment variant target does not resolve: {target}")
    return errors


def expected_basis(evidence, confidence, combination=False):
    if combination:
        return 'analogy'
    if confidence == 'A' and any(term in evidence for term in (
            'Прямые археологические', 'Прямые музейные', 'археологической обуви и музейных',
            'Берестяная грамота №438 прямо')):
        return 'sourced'
    if 'Исходная детализация уверенности' in evidence or ('форма' in evidence and 'Берестяная грамота' in evidence):
        return 'analogy'
    if any(term in evidence for term in ('Хорошо подтверждаемая реконструкция',
                                         'Общая древнерусская материальная культура',
                                         'Подтверждённые зимние материалы')):
        return 'logical_necessity'
    if any(term in evidence for term in ('гипотеза', 'правдоподобность контактов',
                                         'конкретные отличия требуют источника')):
        return 'analogy'
    return ''


def period_includes_1230(period):
    if re.search(r'(?:около|around)\s*1230', period, re.I) or '1230' in period:
        return True
    match = re.search(r'(\d{4})\s*[–—-]\s*(\d{4})', period)
    return bool(match and int(match.group(1)) <= 1230 <= int(match.group(2)))


def resolve_target(group, ref):
    if not ref:
        return False
    if ref.startswith('n1230:material_item:'):
        target_id = ref
        base = NOV / 'game-base-v1' / group
        return any(target_id in row.values() for path in base.rglob('*.csv') for row in rd(path))
    if '#' not in ref:
        return False
    path, target_id = ref.split('#', 1)
    prefix = f'{group}/'
    if path.startswith(prefix):
        path = path[len(prefix):]
    base = ROOT if group == 'clothing-appearance' else NOV / 'game-base-v1' / group
    source = base / path
    if not source.is_file():
        return False
    if source.suffix == '.json':
        data = json.loads(source.read_text(encoding='utf-8'))
        def contains_id(value):
            if isinstance(value, dict):
                return value.get('id') == target_id or any(contains_id(v) for v in value.values())
            if isinstance(value, list):
                return any(contains_id(v) for v in value)
            return False
        return contains_id(data)
    return any(target_id in row.values() for row in rd(source))


def archive_id(record):
    return record['archive_ref'].rsplit(':', 1)[-1].upper()


def group_has_decision(group, archive_ref):
    group_root = NOV / 'game-base-v1' / group
    wanted = archive_ref.rsplit(':', 1)[-1].upper()
    ledger_path = group_root / 'archive_inclusion_ledger.csv'
    if ledger_path.is_file() and any(
            archive_id(row) == wanted and row.get('inclusion_result') not in ('', 'routed', 'needs_check')
            for row in rd(ledger_path)):
        return True
    manifest_path = group_root / 'authoring/archive_inclusion_manifest.json'
    if manifest_path.is_file():
        records = json.loads(manifest_path.read_text(encoding='utf-8')).get('records', [])
        return any(archive_id(row) == wanted and row.get('expected_result') not in ('', 'routed', 'needs_check')
                   for row in records)
    return False


def validate_archive_decisions(manifest, ledger):
    ledger_fields = list(ledger[0]) if ledger else []
    expected_ledger = [{key: str(row.get(key, '')) for key in ledger_fields}
                       for row in build_archive_inclusion_ledger()]
    if len(ledger) != len(manifest) or ledger != expected_ledger:
        fail('archive ledger does not match manifest projection')
    seen = set()
    for row in manifest:
        archive_ref = row.get('archive_ref', '')
        if not archive_ref or archive_ref in seen:
            fail(f'archive manifest has missing/duplicate archive_ref: {archive_ref or "<empty>"}')
        seen.add(archive_ref)
        if row.get('expected_result') != 'routed':
            continue
        group = row.get('target_group', '')
        ref = row.get('target_ref', '')
        token = f'awaits_owner:{group}'
        if not group:
            fail(f'{archive_id(row)}: routed row has no target_group')
        elif ref:
            if not resolve_target(group, ref):
                fail(f'{archive_id(row)}: routed target does not resolve: {ref}')
            if token in row.get('reason', ''):
                fail(f'{archive_id(row)}: resolved routed target must not await owner')
        else:
            if token not in row.get('reason', ''):
                fail(f'{archive_id(row)}: routed row without target_ref needs {token}')
            if group_has_decision(group, archive_ref):
                fail(f'{archive_id(row)}: receiving group already has a decision; cannot await owner')

    projected, fields = build_material_entities()
    entity_path = ROOT / 'garments/material_entities.csv'
    actual = rd(entity_path)
    with open(entity_path, encoding='utf-8-sig', newline='') as stream:
        actual_fields = csv.DictReader(stream).fieldnames or []
    if fields != actual_fields:
        fail('material entity projection has unexpected columns or missing rows')
    elif actual != projected:
        fail('material_entities.csv does not match entity decisions in manifest')


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

    # ---- archive ownership ledger
    manifest = json.loads((ROOT / 'authoring/archive_inclusion_manifest.json').read_text(encoding='utf-8'))['records']
    ledger = rd(ROOT / 'reports/archive_inclusion_ledger.csv')
    master_items = {r['item_id']: r for r in rd(NOV / 'sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv')}
    costume_items = {r['item_id']: r for r in costume}
    costume_combinations = {r['combo_id']: r for r in rd(NOV / 'sources/costume-dataset-v1/data/combinations.csv')}
    validate_archive_decisions(manifest, ledger)

    # Common game-base checker: pass a resolved root and argv (no shell); surface concise diagnostics.
    checker = NOV / 'game-base-v1/scripts/check-archive-ownership.mjs'
    node = shutil.which('node')
    if not node:
        fail('common archive ownership checker: node executable not found')
    elif checker.is_file():
        result = subprocess.run([node, str(checker), str(NOV / 'game-base-v1')],
                                cwd=REPO, capture_output=True, text=True, check=False)
        if result.returncode:
            common_errors = [line for line in result.stderr.splitlines() if line.strip()]
            fail(f'common archive ownership checker failed ({result.returncode}; {len(common_errors)} diagnostics): '
                 + '; '.join(common_errors[:5]))
        else:
            info.append('common archive ownership checker: ' + result.stdout.strip())
    else:
        info.append('common archive ownership checker: unavailable in source checkout; clothing checks run locally')
    allowed = {'entity', 'variant', 'ref', 'rejected', 'routed'}
    required = ('archive_ref', 'archive_name', 'type', 'expected_result', 'basis', 'derivation',
                'confidence', 'period', 'region', 'reason', 'target_group', 'target_ref')
    if len({r.get('archive_ref', '') for r in manifest}) != len(manifest):
        fail('archive manifest has duplicate archive_ref')
    for r in manifest:
        if any(not str(r.get(k, '')).strip() for k in required if k not in ('target_group', 'target_ref')):
            fail(f'{r.get("archive_ref", "<missing>")}: incomplete archive decision')
        if r['expected_result'] not in allowed or r['type'] not in ('new', 'variant'):
            fail(f'{r["archive_ref"]}: invalid decision/type')
        if r['basis'] not in ('sourced', 'analogy', 'logical_necessity') or r['confidence'] not in ('A', 'B', 'C'):
            fail(f'{r["archive_ref"]}: invalid basis/confidence')
        if r['expected_result'] == 'routed' and not r['target_group']:
            fail(f'{r["archive_ref"]}: routed row needs target_group')
        if r['expected_result'] == 'ref' and (not r['target_group'] or not r['target_ref']):
            fail(f'{r["archive_ref"]}: ref row needs a stable target group and ref')
        if r['expected_result'] == 'ref' and r.get('game_base_ref'):
            fail(f'{r["archive_ref"]}: ref row cannot also be a variant target')
        if r['expected_result'] in ('entity', 'variant') and not r['target_group']:
            fail(f'{r["archive_ref"]}: entity/variant needs an explicit owner')
        if r['expected_result'] == 'rejected' and (r['target_group'] or r['target_ref']):
            fail(f'{r["archive_ref"]}: rejected row cannot claim a target')
        if r['expected_result'] == 'variant' and not r['target_ref']:
            fail(f'{r["archive_ref"]}: variant needs a stable target ref')
        if r['expected_result'] == 'variant' and r['target_ref'] != r.get('game_base_ref', ''):
            fail(f'{r["archive_ref"]}: variant target_ref and game_base_ref must identify the same stable target')
        if r['target_ref'] and not resolve_target(r['target_group'], r['target_ref']):
            fail(f'{r["archive_ref"]}: target does not resolve: {r["target_group"]} {r["target_ref"]}')
        archive_id = r['archive_ref'].rsplit(':', 1)[-1]
        if '/material_entities.csv:' in r['archive_ref']:
            canonical = master_items.get(archive_id)
            derivation = f'data/normalized_source_tables/material_entities/material_entities.csv#{archive_id}'
            period = f"{canonical['period_from']}–{canonical['period_to']}" if canonical else ''
            region = canonical['region_scope'] if canonical else ''
            confidence = canonical['historical_confidence'] if canonical else ''
            evidence = canonical['evidence_basis'] if canonical else ''
        elif '/catalog_items.csv:' in r['archive_ref']:
            canonical = costume_items.get(archive_id)
            derivation = archive_id
            period = canonical.get('period_scope', '') if canonical else ''
            region = canonical.get('region_scope', '') if canonical else ''
            confidence = canonical.get('historical_confidence', '') if canonical else ''
            evidence = canonical.get('evidence_basis', '') if canonical else ''
        elif '/combinations.csv:' in r['archive_ref']:
            canonical = costume_combinations.get(archive_id)
            derivation = archive_id
            period = '1180–1260'
            region = 'Великий Новгород и Новгородская земля; центр модели — около 1230 года'
            confidence = canonical.get('confidence', '') if canonical else ''
            evidence = canonical.get('description_ru', '') if canonical else ''
        else:
            canonical = None; derivation = period = region = confidence = evidence = ''
        if not canonical:
            fail(f'{r["archive_ref"]}: archive ID does not resolve in canonical source')
        else:
            for field, value in (('archive_name', canonical['name_ru']), ('derivation', derivation),
                                 ('confidence', confidence), ('period', period), ('region', region)):
                if normalized_name(r[field]) != normalized_name(value):
                    fail(f'{r["archive_ref"]}: {field} differs from canonical source')
            basis = expected_basis(evidence, confidence, '/combinations.csv:' in r['archive_ref'])
            if r['basis'] != basis:
                fail(f'{r["archive_ref"]}: basis {r["basis"]} mismatches canonical evidence ({basis})')
            if r['basis'] == 'sourced' and 'category-level evidence (category_form_material_process_or_context)' not in r.get('basis_note', '').lower():
                fail(f'{r["archive_ref"]}: A-source basis must say category-level evidence')
        if not period_includes_1230(r['period']):
            fail(f'{r["archive_ref"]}: 1230 is outside/absent from period')
        hit = next((d['deny_id'] for d in deny if re.search(d['pattern'], r['archive_name'], re.I)), '')
        if r['expected_result'] == 'entity' and hit:
            fail(f'{r["archive_ref"]}: denylisted entity candidate ({hit})')
    if any(r['inclusion_result'] not in allowed for r in ledger):
        fail('ledger contains unknown disposition')
    if any(r['inclusion_result'] != next(m['expected_result'] for m in manifest if m['archive_ref'] == r['archive_ref']) for r in ledger):
        fail('ledger disposition differs from authored expected_result')
    counts = {kind: sum(r['inclusion_result'] == kind for r in ledger) for kind in sorted(allowed)}
    info.append(f'archive ownership: {len(manifest)} reviewed; ' + ', '.join(f'{k}={v}' for k, v in counts.items()))

    # ---- garments
    ids = [r['item_id'] for r in costume]
    dids = [r['source_item_id'] for r in disp]
    if sorted(ids) != sorted(dids):
        fail(f'disposition covers {len(set(dids))} of {len(ids)} costume items')
    for r in disp:
        if r['disposition'] == 'reject' and not r['reason']:
            fail(f'reject without reason: {r["source_item_id"]}')
    gm = {g['gm_id']: g for g in garments}
    if {g['source_item_id'] for g in garments if g['covers_hair'] == 'yes'} != set(HAIR_COVERAGE_EVIDENCE):
        fail('covers_hair=yes must match source-backed evidence exactly')
    for g in garments:
        expected_coverage = ('yes' if g['source_item_id'] in HAIR_COVERAGE_EVIDENCE else
                             'unknown' if g['equipment_slot'] in HEAD_SLOTS else 'no')
        if g['covers_hair'] not in ('yes', 'no', 'unknown') or g['covers_hair'] != expected_coverage:
            fail(f'{g["gm_id"]}: invalid covers_hair={g["covers_hair"]!r}')
        if g['covers_hair'] == 'yes' and HAIR_COVERAGE_EVIDENCE[g['source_item_id']] not in g['source_refs'].split('|'):
            fail(f'{g["gm_id"]}: missing hair coverage source evidence')
    for g in garments + comps:
        if g['equipment_slot'] not in slots:
            fail(f'{g["gm_id"]}: slot {g["equipment_slot"]!r} not in equipment_slots.csv')
        if not g['season'] or any(s not in SEASONS for s in g['season'].split('|')):
            fail(f'{g["gm_id"]}: bad season {g["season"]!r}')
        if g['confidence'] not in ('A', 'B', 'C') or not g['source_refs']:
            fail(f'{g["gm_id"]}: confidence/source_refs missing')
        if g['status'] != 'candidate':
            fail(f'{g["gm_id"]}: status must be candidate')
    moved = {r['source_item_id'] for r in disp if r['target'].startswith('garments/') and r['disposition'] != 'variant'}
    have = {g['source_item_id'] for g in garments + comps if g['source_item_id']}
    if moved != have:
        fail(f'disposition/garments mismatch: {sorted(moved ^ have)}')
    for error in variant_disposition_errors(disp, garments):
        fail(error)
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
