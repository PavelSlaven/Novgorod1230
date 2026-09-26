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
 7. every row: non-empty source_refs, confidence in A/B/C, status candidate.
 8. refs resolve: wk:claim ids exist+approved in WK production-v1; master-food ids in sources.csv;
    ext ids defined; sqlite table:key exist (read-only) when the file is present; file refs exist.
Exit code 1 on any failure. Prints counts.
"""
import csv, json, re, sqlite3, sys, glob
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
GB = OUT.parent
NOV = GB.parent
WK = NOV / 'world-knowledge/production-v1'
MASTER = NOV / 'sources/master-archive-v1/data/normalized_source_tables/food_system'
SQLITE = Path('C:/Users/Slaven/Downloads/novgorod_1230(1) (1).sqlite')
CUR = json.loads((HERE / 'curated/curated.json').read_text(encoding='utf-8'))
fails, warns = [], []


def rd(p):
    with open(p, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def jl(s):
    try:
        return json.loads(s) if s else []
    except Exception:
        return None


files = sorted(p for p in OUT.rglob('*.csv') if 'source_snapshot' not in p.parts)
data = {p.relative_to(OUT).as_posix(): rd(p) for p in files}
ING = data['food/ingredients.csv']
TAX = data['food/taxon_refs.csv']
DSH = data['dishes/dishes_meals.csv']
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

# 7 row hygiene
for name, rows in data.items():
    if name == 'sources.csv':
        continue
    for r in rows:
        key = list(r.values())[0]
        refs = jl(r.get('source_refs', ''))
        if not refs:
            fails.append(f'7 no source_refs {name}:{key}')
        if r.get('confidence') not in ('A', 'B', 'C'):
            fails.append(f'7 bad confidence {name}:{key}:{r.get("confidence")}')
        if r.get('status') != 'candidate':
            fails.append(f'7 status not candidate {name}:{key}')

# 8 refs resolution
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
con = sqlite3.connect(f'file:{SQLITE.as_posix()}?mode=ro', uri=True) if SQLITE.exists() else None
SQL_KEY = {'economy': 'item', 'famine_prices': 'item', 'events': 'date'}
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
            fails.append(f'8 wk claim missing/not approved: {x} ({st})')
    elif x.startswith('master-food:'):
        if x.split(':', 1)[1] not in msrc:
            fails.append(f'8 master source missing {x}')
    elif x.startswith('ext:'):
        if x not in ext:
            fails.append(f'8 ext ref undefined {x}')
    elif x.startswith('sqlite:'):
        if con is None:
            warns.append(f'sqlite not present, unchecked {x}')
            continue
        _, _, table, key = x.split(':', 3)
        col = SQL_KEY[table]
        n = con.execute(f'select count(*) from {table} where {col} = ? or {col} like ?', (key, key + ' %')).fetchone()[0]
        if not n:
            fails.append(f'8 sqlite key not found {x}')
    elif x.startswith('temporal-v4:'):
        rec = x.split(':', 1)[1]
        txt = (NOV / 'temporal-v4/datasets/historical_phase_local_effect_rules.json').read_text(encoding='utf-8')
        if rec not in txt:
            fails.append(f'8 temporal record missing {x}')
    elif x.startswith('rule:') or x.startswith('taxon:'):
        pass
    elif '.csv' in x:
        path, _, rowkey = x.partition('.csv:')
        fp = NOV / (path + '.csv')
        if not fp.exists():
            fails.append(f'8 file ref missing {x}')
    else:
        fails.append(f'8 unknown ref form {x}')

print(json.dumps({k: len(v) for k, v in data.items()}, ensure_ascii=False, indent=1))
print(f'refs checked {len(allrefs)}; denylist hits {hits}; warnings {len(warns)}')
for w in warns[:20]:
    print('WARN', w)
for f in fails[:60]:
    print('FAIL', f)
print('RESULT', 'FAIL' if fails else 'PASS', len(fails))
sys.exit(1 if fails else 0)
