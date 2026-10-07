#!/usr/bin/env python3
"""Deterministic acceptance checks for food-drink candidate data.

Checks (domain acceptance from catalog.json + conventions):
 1. every plant/animal-derived ingredient has source_taxon_ref present in taxon_refs.csv;
    if sibling flora/fauna CSVs exist in game-base-v1 (column name_lat), report resolution.
 2. months_fresh of taxa with phenology windows lie inside the window.
 3. anachronism denylist over names/ingredients/sensory text of all outputs.
 4. every dish ingredient resolves to an fd_id.
 5. fasting_compatible=true -> no required meat/dairy/eggs/animal_fat; fish -> not 'true'.
 6. reconstructed recipes (evidence_type reconstruction/comparative/ethnographic) have confidence C.
 7. D46 resolves the 151 selected material rows into 94 new entities, 63 variants, and 4 merges;
    canonical ids, category-level evidence, confidence, dedup, and variant identity are enforced.
 8. recipe_months is the complete 268 x 12 logical relation and applies five reviewed refinements.
 9. every row: non-empty source_refs, confidence in A/B/C, status candidate.
10. refs resolve: wk:claim ids exist+approved in WK production-v1; master-food ids in sources.csv;
    ext ids defined; SQLite refs resolve exactly through the shared read-only resolver; file refs exist.
Exit code 1 on any failure. Prints counts.
"""
import csv, json, re, sys, glob
import sqlite3
import importlib.util
from pathlib import Path


HERE = Path(__file__).resolve().parent
SQLITE_SPEC = importlib.util.spec_from_file_location('food_sqlite_ref_checker', HERE.parents[1] / 'scripts/check-sqlite-refs.py')
SQLITE_RESOLVER = importlib.util.module_from_spec(SQLITE_SPEC)
SQLITE_SPEC.loader.exec_module(SQLITE_RESOLVER)
OUT = HERE.parent
GB = OUT.parent
NOV = GB.parent
sys.path.insert(0, str(GB / 'scripts'))
from material_view import apply_material_overrides, overlay_source_ref
WK = NOV / 'world-knowledge/production-v1'
MASTER = NOV / 'sources/master-archive-v1/data/normalized_source_tables/food_system'
MATERIAL_MASTER = NOV / 'sources/master-archive-v1/data/normalized_source_tables/material_entities'
MATERIAL_VALIDATION = json.loads((MATERIAL_MASTER / 'validation_report.json').read_text(encoding='utf-8'))
CUR = json.loads((HERE / 'curated/curated.json').read_text(encoding='utf-8'))
ARCHIVE = json.loads((HERE / 'curated/archive_inclusions.json').read_text(encoding='utf-8'))
REPORT = json.loads((HERE / 'build_report.json').read_text(encoding='utf-8'))
fails, warns = [], []


def rd(p):
    with open(p, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def jl(s):
    try:
        return json.loads(s) if s else []
    except Exception:
        return None


def norm_name(value):
    return re.sub(r'[^a-zа-яё0-9]+', '', value.casefold())


def semantic_key(value):
    value = norm_name(value)
    return value[:-1] if len(value) > 3 and value.endswith('s') else value


def canonical_material_id(archive_id):
    return f'n1230:material_item:{archive_id.lower()}'


def canonical_id_errors(rows):
    return [row['item_id'] for row in rows if not re.fullmatch(r'n1230:material_item:omi[0-9]{5}', row['item_id'])]


def material_basis(source, action=''):
    role = ARCHIVE['material_source_role']
    if action == 'include_analogy':
        return 'analogy', f'analogy: {source["evidence_basis"]}'
    evidence = source['evidence_basis']
    if evidence.startswith('Прямые археологические, письменные или стратиграфически привязанные новгородские данные'):
        return 'sourced', f'category-level evidence ({role}): {evidence}'
    return 'logical_necessity', evidence


def identity_errors(material_rows, food_rows, dish_rows):
    errors = []
    seen_names, seen_family = {}, {}
    existing_names = {norm_name(r['name_ru']): r.get('fd_id') or r.get('ds_id') for r in food_rows + dish_rows}
    food_keys = {}
    for row in food_rows:
        food_keys[semantic_key(row['fd_id'].removeprefix('fd_'))] = row['fd_id']
        if row.get('name_en'):
            food_keys[semantic_key(row['name_en'])] = row['fd_id']
    for row in material_rows:
        item_id = row['item_id']
        name_key = norm_name(row['name_ru'])
        family_key = semantic_key(row['family_key'])
        if name_key in seen_names:
            errors.append(f'duplicate material name: {item_id} / {seen_names[name_key]}')
        if family_key in seen_family:
            errors.append(f'duplicate material family_key: {item_id} / {seen_family[family_key]}')
        if name_key in existing_names:
            errors.append(f'material name duplicates existing row: {item_id} / {existing_names[name_key]}')
        if family_key in food_keys:
            errors.append(f'material family_key duplicates fd identity: {item_id} / {food_keys[family_key]}')
        if row.get('name_en') and semantic_key(row['name_en']) in food_keys:
            errors.append(f'material name_en duplicates fd identity: {item_id} / {food_keys[semantic_key(row["name_en"])]}')
        seen_names[name_key] = item_id
        seen_family[family_key] = item_id
    return errors


SEMANTIC_STOP_WORDS = {'в', 'во', 'на', 'или', 'без', 'для', 'после', 'до', 'из', 'с', 'со', 'не', 'только', 'что', 'как', 'под'}
SEMANTIC_STOP_STEMS = (
    'мешоч', 'мешк', 'связк', 'пуч', 'комок', 'горст', 'куч', 'парт', 'мал', 'мелк', 'крупн',
    'сортирован', 'выловлен', 'мокр', 'жив', 'вод', 'садк', 'раздавлен', 'свеж', 'смешан',
    'категор', 'приманк', 'нажив', 'корм', 'смаз', 'свеч', 'назнач', 'осторож', 'вид', 'уточн', 'речн')
SEMANTIC_CORE_ROOTS = ('рыб', 'ягод', 'зерн', 'мук', 'мяс', 'жир', 'масл', 'кров', 'семен', 'отруб', 'дрожж', 'осад', 'хлеб', 'корк')
SPOILAGE_NAME_STEMS = ('заплесневел', 'подмоч', 'испорч', 'гнил', 'кисл', 'прогорк', 'мыш', 'подгнил', 'пересохш', 'проросш', 'слежавш')


def semantic_name_key(value):
    tokens = []
    for token in re.findall(r'[a-zа-яё0-9]+', value.casefold()):
        if token in SEMANTIC_STOP_WORDS or any(token.startswith(stem) for stem in SEMANTIC_STOP_STEMS):
            continue
        token = next((root for root in SEMANTIC_CORE_ROOTS if token.startswith(root)), token)
        tokens.append(token)
    return ' '.join(sorted(dict.fromkeys(tokens)))


def semantic_identity_errors(material_rows, food_rows, independent_reasons):
    errors, food_keys, material_keys = [], {}, {}
    for row in food_rows:
        for value in (row['name_ru'], row.get('name_en', ''), row['fd_id'].removeprefix('fd_').replace('_', ' ')):
            key = semantic_name_key(value)
            if key:
                food_keys.setdefault(key, set()).add(row['fd_id'])
    for row in material_rows:
        key = semantic_name_key(row['name_ru'])
        if not key:
            continue
        if key in food_keys and not independent_reasons.get(row['item_id']):
            errors.append(f'semantic fd collision without reason: {row["item_id"]} / {sorted(food_keys[key])}')
        material_keys.setdefault(key, []).append(row['item_id'])
    for key, item_ids in material_keys.items():
        if len(item_ids) > 1:
            for item_id in item_ids:
                if not independent_reasons.get(item_id):
                    errors.append(f'semantic material collision without reason: {item_id} / {item_ids}')
    return errors


def spoilage_name_errors(material_rows, spoilage_variant_ids):
    errors = []
    for row in material_rows:
        archive_id = row['item_id'].rsplit(':', 1)[-1].upper()
        hits = [stem for stem in SPOILAGE_NAME_STEMS if stem in row['name_ru'].casefold()]
        if hits and archive_id not in spoilage_variant_ids:
            errors.append(f'spoilage/state name emitted as entity: {archive_id} {hits}')
    return errors


def matrix_errors(rows, expected_pairs):
    errors = []
    try:
        pairs = [(r['ds_id'], int(r['month'])) for r in rows]
    except (KeyError, ValueError):
        return ['invalid recipe-month key']
    if len(pairs) != len(set(pairs)):
        errors.append('duplicate recipe-month pair')
    if set(pairs) != expected_pairs:
        errors.append('incomplete recipe-month relation')
    if any(r.get('basis') != 'logical_necessity' for r in rows):
        errors.append('recipe-month basis must be logical_necessity')
    return errors


if '--self-test' in sys.argv:
    assert norm_name('  Пшённая-крупа! ') == 'пшённаякрупа'
    assert canonical_material_id('OMI01417') == 'n1230:material_item:omi01417'
    assert canonical_id_errors([{'item_id': 'OMI01417'}]) == ['OMI01417']
    assert not canonical_id_errors([{'item_id': canonical_material_id('OMI01417')}])
    direct = {'evidence_basis': 'Прямые археологические, письменные или стратиграфически привязанные новгородские данные; тест.'}
    reconstructed = {'evidence_basis': 'Хорошо подтверждаемая реконструкция; тест.'}
    assert material_basis(direct)[0] == 'sourced'
    assert ARCHIVE['material_source_role'] in material_basis(direct)[1]
    assert material_basis(reconstructed)[0] == 'logical_necessity'
    assert material_basis(reconstructed, 'include_analogy')[0] == 'analogy'
    duplicate = [{'item_id': canonical_material_id('OMI00001'), 'name_ru': 'Не дубль', 'family_key': 'hazelnut_kernel'}]
    existing = [{'fd_id': 'fd_hazelnut_kernel', 'name_ru': 'Ядро ореха', 'name_en': 'hazelnut kernel'}]
    assert identity_errors(duplicate, existing, [])
    duplicate_name_en = [{'item_id': canonical_material_id('OMI00002'), 'name_ru': 'Тоже не дубль',
                          'family_key': 'different_key', 'name_en': 'hazelnut kernel'}]
    assert identity_errors(duplicate_name_en, existing, [])
    semantic_duplicate = [{'item_id': canonical_material_id('OMI00003'), 'name_ru': 'Малая рыба для приманки'}]
    assert semantic_identity_errors(semantic_duplicate, [{'fd_id': 'fd_fish_generic', 'name_ru': 'Речная рыба, вид не уточнён',
                                                           'name_en': 'fish generic'}], {})
    assert semantic_identity_errors(semantic_duplicate, [{'fd_id': 'fd_fish_generic', 'name_ru': 'Речная рыба, вид не уточнён',
                                                           'name_en': 'fish generic'}],
                                    {canonical_material_id('OMI00003'): ''})
    assert not semantic_identity_errors(semantic_duplicate, [{'fd_id': 'fd_fish_generic', 'name_ru': 'Речная рыба, вид не уточнён',
                                                               'name_en': 'fish generic'}],
                                        {canonical_material_id('OMI00003'): 'different physical role'})
    semantic_pair = [semantic_duplicate[0], {'item_id': canonical_material_id('OMI00005'), 'name_ru': 'Крупная рыба'}]
    assert semantic_identity_errors(semantic_pair, [], {})
    assert not semantic_identity_errors(semantic_pair, [], {
        canonical_material_id('OMI00003'): 'bait role', canonical_material_id('OMI00005'): 'large trade batch'})
    assert semantic_name_key('Мучная пыль') != semantic_name_key('Мука')
    spoiled = [{'item_id': canonical_material_id('OMI00004'), 'name_ru': 'Заплесневелое зерно'}]
    assert spoilage_name_errors(spoiled, set())
    assert not spoilage_name_errors(spoiled, {'OMI00004'})
    complete = [{'ds_id': 'ds_x', 'month': str(month), 'basis': 'logical_necessity'} for month in range(1, 13)]
    assert not matrix_errors(complete, {('ds_x', month) for month in range(1, 13)})
    assert matrix_errors(complete[:-1], {('ds_x', month) for month in range(1, 13)})
    assert matrix_errors(complete + [dict(complete[0])], {('ds_x', month) for month in range(1, 13)})
    wrong_basis = [dict(row) for row in complete]
    wrong_basis[0]['basis'] = 'sourced'
    assert matrix_errors(wrong_basis, {('ds_x', month) for month in range(1, 13)})
    print('SELF-TEST PASS')
    sys.exit(0)


# C002 crosswalk has typed no_source rows; its own --check validates that schema.
files = sorted(p for p in OUT.rglob('*.csv') if 'source_snapshot' not in p.parts and p.name != 'household_type_pf_crosswalk.csv')
data = {p.relative_to(OUT).as_posix(): rd(p) for p in files}
ING = data['food/ingredients.csv']
TAX = data['food/taxon_refs.csv']
DSH = data['dishes/dishes_meals.csv']
MAT = data['food/material_entities.csv']
RMONTH = data['dishes/recipe_months.csv']
fd = {r['fd_id']: r for r in ING}

# 1 taxon refs
tax = {r['taxon_ref'] for r in TAX}
NEED = {'grain', 'groats_flour', 'legume', 'vegetable', 'wild_greens', 'mushroom', 'berry', 'fruit', 'nut_seed', 'honey', 'dairy', 'egg',
        'meat_domestic', 'meat_game', 'offal', 'fish', 'fish_product', 'famine_substitute'}
for r in ING:
    if r['food_category'] in NEED and r['ingredient_type'] in ('raw_product', 'famine_substitute'):
        if not r['source_taxon_ref']:
            fails.append(f'1 no taxon: {r["fd_id"]}')
        elif r['source_taxon_ref'] not in tax:
            fails.append(f'1 taxon not in taxon_refs: {r["fd_id"]}')
sib_lat = set()
for p in glob.glob(str(GB / '**/*.csv'), recursive=True):
    if 'food-drink' in p.replace('\\', '/'):
        continue
    try:
        rows = rd(p)
    except Exception:
        continue
    if rows and 'name_lat' in rows[0]:
        sib_lat |= {x['name_lat'].strip() for x in rows}
resolved = sum(1 for t in TAX if t['name_lat'] in sib_lat)
print(f'1 taxon_refs {len(TAX)}; resolved in sibling domains {resolved}; pending {len(TAX)-resolved} (sibling files with name_lat: {len(sib_lat)} names)')

# 2 phenology
for fid, win in CUR['phenology_windows'].items():
    if fid.startswith('_'):
        continue
    row = next((r for r in ING if r['master_ingredient_id'] == fid), None)
    if not row:
        continue
    bad = [m for m in jl(row['months_fresh']) if m not in win]
    if bad:
        fails.append(f'2 months_fresh outside phenology window: {row["fd_id"]} {bad} window {win}')

# 3 denylist
DENY = ['картоф', 'кукуруз', 'томат', 'помидор', 'подсолнеч', 'табак', 'индейк', 'кролик', 'кофе', 'какао', 'шоколад', 'ваниль', 'рафинад',
        'сахар-песок', 'водк', 'чили', 'фасол', 'тыкв', 'чай ', 'potato', 'maize', 'tomato', 'sunflower', 'tobacco', 'turkey', 'rabbit', 'coffee', 'cocoa']
TEXT_COLS = {'name_ru', 'name_en', 'name_lat', 'description_ru', 'action_ru', 'sensory_smell_ru', 'sensory_taste_ru', 'sensory_texture_ru',
             'sensory_look_ru', 'smell_ru', 'taste_ru', 'texture_ru', 'look_ru', 'ingredients', 'game_use', 'value'}
hits = 0
for name, rows in data.items():
    for r in rows:
        for c in TEXT_COLS & set(r):
            v = (r[c] or '').lower()
            for d in DENY:
                if re.search(r'(?<![a-zа-яё])' + re.escape(d), v):
                    hits += 1
                    fails.append(f'3 denylist "{d}" in {name}:{c}:{list(r.values())[0]}')

# 4/5/6 dishes
FORB = {'meat', 'dairy', 'eggs', 'animal_fat'}
RECON = {'ingredient_based_reconstruction', 'comparative_reconstruction', 'ethnographic_parallel'}
for d in DSH:
    ings = jl(d['ingredients']) or []
    for i in ings:
        if i['fd_id'] not in fd:
            fails.append(f'4 unresolved ingredient {d["ds_id"]} {i["fd_id"]}')
    req = {fd[i['fd_id']]['fasting_class'] for i in ings if i['role'] == 'required' and i['fd_id'] in fd}
    if d['fasting_compatible'] == 'true' and (req & FORB or 'fish' in req):
        fails.append(f'5 fasting_compatible=true but requires {req & (FORB | {"fish"})}: {d["ds_id"]}')
    if d['recipe_evidence_type'] in RECON and d['confidence'] != 'C':
        fails.append(f'6 reconstructed recipe not C: {d["ds_id"]}')
for s in data['dishes/recipe_steps.csv']:
    for f in jl(s['input_fd_ids']) or []:
        if f not in fd:
            fails.append(f'4 step input unresolved {s["step_id"]} {f}')
for s in data['food/household_food_stock_profiles.csv']:
    if s['fd_id'] not in fd:
        fails.append(f'4 stock fd unresolved {s["profile_id"]}')
for m in data['dishes/meal_profiles.csv']:
    if jl(m['unresolved_recipe_ids']):
        warns.append(f'meal profile has unresolved recipes {m["mp_id"]}')

# 7 archive inclusions: 151 reviewed rows -> 94 new, 53 demoted variants, 4 merges.
material_path = MATERIAL_MASTER / 'material_entities.csv'
material_source = {r['item_id']: r for r in apply_material_overrides(rd(material_path), material_path)}
state_source = {r['state_id']: r for r in rd(MATERIAL_MASTER / 'state_variants.csv')}
if MATERIAL_VALIDATION.get('status') != 'PASS' or MATERIAL_VALIDATION.get('blocking_failures'):
    fails.append('7 material archive validation report is not PASS')

new_ids = ARCHIVE['material_entity_ids']
demoted_ids = ARCHIVE['demoted_material_entity_ids']
merge_ids = [spec['archive_ref'].rsplit(':', 1)[1] for spec in ARCHIVE['material_merges']]
original_scope = new_ids + demoted_ids + merge_ids
if len(new_ids) != 94 or len(demoted_ids) != 53 or len(merge_ids) != 4:
    fails.append(f'7 disposition count mismatch: new={len(new_ids)} variant={len(demoted_ids)} merge={len(merge_ids)}')
if len(original_scope) != ARCHIVE['original_material_scope_count'] or len(set(original_scope)) != len(original_scope):
    fails.append('7 original 151-row scope is incomplete or overlaps')
material_variant_ids = {
    spec['archive_ref'].rsplit(':', 1)[1]
    for spec in ARCHIVE['variants']
    if 'material_entities.csv:' in spec['archive_ref']
}
if not set(demoted_ids) <= material_variant_ids:
    fails.append('7 demoted material ids are not all represented as variants')
variant_archive_ids = [spec['archive_ref'].rsplit(':', 1)[1] for spec in ARCHIVE['variants']]
if len(set(variant_archive_ids)) != len(variant_archive_ids):
    fails.append('7 duplicate archive id in variants')
if any(not spec.get('reason', '').strip() for spec in ARCHIVE['variants'] + ARCHIVE['material_merges']):
    fails.append('7 variant/merge decision without reason')
independent_rows = ARCHIVE.get('independent_entities', [])
independent_ids = [row.get('archive_id') for row in independent_rows]
if len(independent_ids) != 11 or len(set(independent_ids)) != len(independent_ids) or not set(independent_ids) <= set(new_ids):
    fails.append('7 independent-entity decisions must be 11 unique retained ids')
if any(not row.get('reason', '').strip() for row in independent_rows):
    fails.append('7 independent-entity decision without reason')
source_relation_count = sum(len(jl(material_source[item_id]['source_ids']) or []) for item_id in original_scope)
if source_relation_count != ARCHIVE['original_material_source_relation_count'] or ARCHIVE['material_source_role'] != 'category_form_material_process_or_context':
    fails.append(f'7 source-relation policy mismatch: {source_relation_count}/{ARCHIVE["material_source_role"]}')

expected_material_ids = [canonical_material_id(item_id) for item_id in new_ids]
actual_material_ids = [r['item_id'] for r in MAT]
if actual_material_ids != expected_material_ids:
    fails.append('7 material_entities output ids differ from canonical authoring order/scope')
if canonical_id_errors(MAT):
    fails.append(f'7 material_entities contains non-canonical item_id: {canonical_id_errors(MAT)}')
for error in identity_errors(MAT, ING, DSH):
    fails.append(f'7 {error}')
independent_reasons = {canonical_material_id(row['archive_id']): row['reason'] for row in independent_rows}
for error in semantic_identity_errors(MAT, ING, independent_reasons):
    fails.append(f'7 {error}')
spoilage_variant_ids = {
    spec['archive_ref'].rsplit(':', 1)[1]
    for spec in ARCHIVE['variants']
    if spec['target_kind'] == 'spoilage_state'
}
for error in spoilage_name_errors(MAT, spoilage_variant_ids):
    fails.append(f'7 {error}')

merges_by_target = {}
for spec in ARCHIVE['material_merges']:
    merges_by_target.setdefault(spec['target_item_id'], []).append(spec)
material_variants_by_target = {}
for spec in ARCHIVE['variants']:
    if spec['target_kind'] == 'material':
        for target_id in spec['target_ids']:
            material_variants_by_target.setdefault(target_id, []).append(spec)

raw_by_canonical = {canonical_material_id(item_id): item_id for item_id in new_ids}
for row in MAT:
    raw_id = raw_by_canonical.get(row['item_id'])
    source = material_source.get(raw_id)
    if source is None:
        fails.append(f'7 material entity missing in archive: {row["item_id"]}')
        continue
    expected_function = source['function']
    expected_refs = [f'sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:{raw_id}']
    correction_ref = overlay_source_ref(raw_id, material_path)
    if correction_ref:
        expected_refs.append(correction_ref)
    expected_basis, expected_derivation = material_basis(source)
    for spec in merges_by_target.get(raw_id, []):
        merged_id = spec['archive_ref'].rsplit(':', 1)[1]
        expected_function += f'; вариант формы/назначения: {material_source[merged_id]["function"]}'
        expected_refs.append('sources/master-archive-v1/' + spec['archive_ref'])
        expected_derivation += f'; merged {merged_id}: {spec["reason"]}'
    for spec in material_variants_by_target.get(raw_id, []):
        variant_id = spec['archive_ref'].rsplit(':', 1)[1]
        variant_source = material_source.get(variant_id) or state_source.get(variant_id)
        expected_function += f'; вариант назначения: {variant_source["function"]}'
        expected_refs.append('sources/master-archive-v1/' + spec['archive_ref'])
        expected_derivation += f'; variant {variant_id}: {spec["reason"]}'
    changed = []
    for key, value in source.items():
        expected = canonical_material_id(raw_id) if key == 'item_id' else (expected_function if key == 'function' else value)
        if row.get(key) != expected:
            changed.append(key)
    if changed:
        fails.append(f'7 material archive properties changed: {row["item_id"]}:{changed}')
    if row['confidence'] != source['historical_confidence'] or row['basis'] != expected_basis:
        fails.append(f'7 material basis/confidence mismatch: {row["item_id"]}')
    if row['derivation'] != expected_derivation or jl(row['source_refs']) != expected_refs:
        fails.append(f'7 material provenance mismatch: {row["item_id"]}')
    safety = {'A': ('low', 'safe_with_context'), 'B': ('medium', 'safe_with_explicit_context'),
              'C': ('high', 'explicit_context_only')}.get(row['confidence'])
    if safety != (row['anachronism_risk'], row['generation_policy']):
        fails.append(f'7 material anachronism policy mismatch: {row["item_id"]}')

if len(ARCHIVE['variants']) != 63 or len(ARCHIVE['material_merges']) != 4:
    fails.append(f'7 archive dispositions expected 63 variants/4 merges, got {len(ARCHIVE["variants"])}/{len(ARCHIVE["material_merges"])}')
report_variants = {row['archive_id']: row for row in REPORT.get('archive_variants', [])}
for spec in ARCHIVE['variants']:
    archive_id = spec['archive_ref'].rsplit(':', 1)[1]
    source = material_source.get(archive_id) or state_source.get(archive_id)
    if source is None:
        fails.append(f'7 variant source unresolved: {archive_id}')
        continue
    basis, derivation = material_basis(source, spec['action'])
    expected_ref = 'sources/master-archive-v1/' + spec['archive_ref']
    report_row = report_variants.get(archive_id)
    if not report_row or report_row.get('basis') != basis or report_row.get('derivation') != derivation or report_row.get('confidence') != source['historical_confidence']:
        fails.append(f'7 variant report lacks basis/derivation/confidence: {archive_id}')
    if canonical_material_id(archive_id) in actual_material_ids:
        fails.append(f'7 variant incorrectly emitted as new entity: {archive_id}')
    for target_id in spec['target_ids']:
        if spec['target_kind'] == 'fd':
            target = fd.get(target_id)
            if target is None:
                fails.append(f'7 variant target unresolved: {archive_id} -> {target_id}')
                continue
            notes = target['notes']
            refs = jl(target['source_refs']) or []
            required = (source['name_ru'], f'basis={basis}', f'confidence={source["historical_confidence"]}',
                        f'reason={spec["reason"]}', f'identity {target_id}')
            if expected_ref not in refs or any(fragment not in notes for fragment in required):
                fails.append(f'7 fd variant row incomplete: {archive_id} -> {target_id}')
        elif spec['target_kind'] == 'material':
            target = next((row for row in MAT if row['item_id'] == canonical_material_id(target_id)), None)
            if target is None or expected_ref not in (jl(target['source_refs']) or []):
                fails.append(f'7 material variant target unresolved: {archive_id} -> {target_id}')
        elif spec['target_kind'] == 'spoilage_state':
            target = next((row for row in data['dishes/spoilage_states.csv'] if row['state_id'] == target_id), None)
            if target is None or expected_ref not in (jl(target['source_refs']) or []):
                fails.append(f'7 spoilage variant target unresolved: {archive_id} -> {target_id}')
        else:
            fails.append(f'7 unknown variant target kind: {spec["target_kind"]}')

report_merges = {row['archive_id']: row for row in REPORT.get('archive_merges', [])}
for spec in ARCHIVE['material_merges']:
    archive_id = spec['archive_ref'].rsplit(':', 1)[1]
    target_id = canonical_material_id(spec['target_item_id'])
    target = next((row for row in MAT if row['item_id'] == target_id), None)
    report_row = report_merges.get(archive_id)
    expected_ref = 'sources/master-archive-v1/' + spec['archive_ref']
    if target is None or expected_ref not in (jl(target['source_refs']) or []) or f'merged {archive_id}: {spec["reason"]}' not in target['derivation']:
        fails.append(f'7 merge target incomplete: {archive_id} -> {target_id}')
    if not report_row or report_row.get('confidence') != material_source[archive_id]['historical_confidence']:
        fails.append(f'7 merge report lacks confidence: {archive_id}')

expected_report_counts = {'new_entities': 94, 'variants': 63, 'merged': 4}
if REPORT.get('archive_disposition_counts') != expected_report_counts:
    fails.append(f'7 build report disposition mismatch: {REPORT.get("archive_disposition_counts")}')
if REPORT.get('independent_entities') != independent_rows:
    fails.append('7 build report independent-entity decisions mismatch')
if REPORT.get('material_source_relation_role') != ARCHIVE['material_source_role'] or REPORT.get('original_material_source_relation_count') != 914:
    fails.append('7 build report source-relation policy mismatch')

# 8 recipe × month matrix: complete logical relation plus reviewed ingredient refinements.
season_source = {r['seasonality_id']: r for r in rd(MASTER / 'food_seasonality.csv') if r['record_type'] == 'recipe'}
ds_by_recipe = {r['master_recipe_id']: r['ds_id'] for r in DSH if r['master_recipe_id']}
expected_pairs = {(ds, month) for ds in ds_by_recipe.values() for month in range(1, 13)}
for error in matrix_errors(RMONTH, expected_pairs):
    fails.append(f'8 {error}')
if len(RMONTH) != 3216:
    fails.append(f'8 recipe_months expected 3216 rows, got {len(RMONTH)}')
refinements = {(row['ds_id'], int(row['month'])): row for row in ARCHIVE['seasonality_refinements']}
if len(refinements) != 5:
    fails.append(f'8 expected five seasonality refinements, got {len(refinements)}')
allowed_availability = {'available', 'conditional', 'rare', 'unavailable'}
for row in RMONTH:
    refs = jl(row['source_refs']) or []
    sid = refs[0].rsplit(':', 1)[1] if len(refs) == 1 else ''
    source = season_source.get(sid)
    if source is None:
        fails.append(f'8 recipe month source missing: {row["ds_id"]}:{row["month"]}')
        continue
    month = int(row['month'])
    refinement = refinements.get((row['ds_id'], month))
    expected_availability = refinement['availability'] if refinement else source['availability']
    expected_derivation = source['basis'] + (f'; {refinement["reason"]}' if refinement else '')
    if ds_by_recipe.get(source['record_id']) != row['ds_id']:
        fails.append(f'8 recipe month foreign key mismatch: {sid} -> {row["ds_id"]}')
    if source['month'] != 'jan feb mar apr may jun jul aug sep oct nov dec'.split()[month - 1]:
        fails.append(f'8 recipe month value mismatch: {sid}:{row["month"]}')
    if row['availability'] != expected_availability or row['availability'] not in allowed_availability:
        fails.append(f'8 recipe availability mismatch: {sid}:{row["availability"]}')
    if row['confidence'] != source['historical_confidence'] or row['basis'] != 'logical_necessity':
        fails.append(f'8 recipe basis/confidence mismatch: {sid}')
    if row['derivation'] != expected_derivation:
        fails.append(f'8 recipe derivation mismatch: {sid}')
if ds_by_recipe.get('RCP0245') != 'ds_serve_imported_wine':
    fails.append(f'8 RCP0245 must resolve to ds_serve_imported_wine, got {ds_by_recipe.get("RCP0245")}')

# 9 row hygiene
for name, rows in data.items():
    if name == 'sources.csv':
        continue
    for r in rows:
        key = list(r.values())[0]
        refs = jl(r.get('source_refs', ''))
        if not refs:
            fails.append(f'9 no source_refs {name}:{key}')
        if r.get('confidence') not in ('A', 'B', 'C'):
            fails.append(f'9 bad confidence {name}:{key}:{r.get("confidence")}')
        if r.get('status') != 'candidate':
            fails.append(f'9 status not candidate {name}:{key}')

# 10 refs resolution
wk = {}
for p in WK.glob('*.json'):
    if p.name.startswith('verification') or p.name == 'runtime-bundle.json':
        continue
    try:
        j = json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        continue
    if isinstance(j, dict):
        for c in j.get('claims', []) or []:
            wk[c['claim_ref']] = c.get('review_status')
msrc = {r['source_id'] for r in rd(MASTER / 'sources.csv')}
ext = {s['id'] for s in CUR['new_sources']} | {'ext:pvl_6504_996', 'ext:pvl_6505_997'}
try:
    con = SQLITE_RESOLVER.open_database()
    sqlite_open_error = None
except (OSError, sqlite3.Error) as error:
    con = None
    sqlite_open_error = str(error)
allrefs = set()
for name, rows in data.items():
    if name == 'sources.csv':
        continue
    for r in rows:
        for x in jl(r.get('source_refs', '')) or []:
            allrefs.add(x)
for x in sorted(allrefs):
    if x.startswith('wk:claim:'):
        st = wk.get(x[3:])
        if st != 'approved':
            fails.append(f'10 wk claim missing/not approved: {x} ({st})')
    elif x.startswith('master-food:'):
        if x.split(':', 1)[1] not in msrc:
            fails.append(f'10 master source missing {x}')
    elif x.startswith('ext:'):
        if x not in ext:
            fails.append(f'10 ext ref undefined {x}')
    elif x.startswith('sqlite:'):
        if con is None:
            fails.append(f'10 sqlite source unavailable: {sqlite_open_error}')
            continue
        error = SQLITE_RESOLVER.reference_error(con, x)
        if error:
            fails.append(f'10 {error}')
    elif x.startswith('temporal-v4:'):
        rec = x.split(':', 1)[1]
        txt = (NOV / 'temporal-v4/datasets/historical_phase_local_effect_rules.json').read_text(encoding='utf-8')
        if rec not in txt:
            fails.append(f'10 temporal record missing {x}')
    elif x.startswith('rule:') or x.startswith('taxon:'):
        pass
    elif '.csv' in x:
        path, _, rowkey = x.partition('.csv:')
        fp = NOV / (path + '.csv')
        if not fp.exists():
            fails.append(f'10 file ref missing {x}')
    else:
        fails.append(f'10 unknown ref form {x}')

print(json.dumps({k: len(v) for k, v in data.items()}, ensure_ascii=False, indent=1))
print(f'refs checked {len(allrefs)}; denylist hits {hits}; warnings {len(warns)}')
for w in warns[:20]:
    print('WARN', w)
for f in fails[:60]:
    print('FAIL', f)
print('RESULT', 'FAIL' if fails else 'PASS', len(fails))
sys.exit(1 if fails else 0)
