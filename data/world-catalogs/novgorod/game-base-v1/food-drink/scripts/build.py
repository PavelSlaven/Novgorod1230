#!/usr/bin/env python3
"""Build food-drink candidate datasets (collector collect-food-drink).

Deterministic: reads master food_system copies in sources/master-archive-v1,
the snapshot in scripts/source_snapshot, and curated JSON in scripts/curated;
writes CSV tables under food/ and dishes/ plus sources.csv. No network.
Run: python build.py   (from anywhere)
"""
import csv, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
NOV = OUT.parents[1]  # data/world-catalogs/novgorod
MASTER = NOV / 'sources/master-archive-v1/data/normalized_source_tables/food_system'
SNAP = HERE / 'source_snapshot'
CUR = json.loads((HERE / 'curated/curated.json').read_text(encoding='utf-8'))
RUL = json.loads((HERE / 'curated/curated_rules.json').read_text(encoding='utf-8'))
MASTER_REL = 'sources/master-archive-v1/data/normalized_source_tables/food_system'
SNAP_REL = 'game-base-v1/food-drink/scripts/source_snapshot'

MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split()
AVAIL = {'available', 'common', 'fresh_available', 'stored_available'}
FRESH = {'available', 'common', 'fresh_available'}
LIMITED = {'rare', 'conditional', 'context_only'}
RECON = {'ingredient_based_reconstruction', 'comparative_reconstruction', 'ethnographic_parallel'}
FREQ_ORDER = ['rare', 'contextual', 'common', 'ubiquitous']
FREQ_W = {'ubiquitous': 8, 'common': 4, 'contextual': 2, 'rare': 1}
RARITY_BASE = {'ubiquitous': 'ubiquitous', 'common': 'common', 'uncommon': 'contextual', 'seasonal': 'contextual',
               'rare': 'rare', 'exceptional': 'rare', 'context_bound': 'rare'}
QTY_BAND = {'ubiquitous': 'ample', 'common': 'some', 'contextual': 'little', 'rare': 'trace'}
ACCESS_ORDER = ['none', 'rare', 'occasional', 'ordinary']
ACCESS_STEP = {'ordinary': 0, 'occasional': -1, 'rare': -2}


def rd(p):
    with open(p, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))


def wr(p, rows, cols):
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction='raise')
        w.writeheader()
        for r in rows:
            w.writerow({k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else ('' if v is None else v)) for k, v in r.items()})
    return len(rows)


def jl(s):
    try:
        return json.loads(s) if s else []
    except Exception:
        return []


def uniq(xs):
    out = []
    for x in xs:
        if x and x not in out:
            out.append(x)
    return out


# ---------------- inputs
ING = rd(MASTER / 'ingredients.csv')
RCP = rd(MASTER / 'recipes.csv')
SEAS = rd(MASTER / 'food_seasonality.csv')
RFR = rd(MASTER / 'religious_food_rules.csv')
MSRC = {r['source_id']: r for r in rd(MASTER / 'sources.csv')}
STEPS = rd(SNAP / 'recipe_steps.csv')
LINKS = rd(SNAP / 'recipe_ingredient_links.csv')
MEALS = rd(SNAP / 'meal_sets.csv')

ing_by = {r['ingredient_id']: r for r in ING}
month_av = {}
for s in SEAS:
    if s['record_type'] == 'ingredient':
        month_av.setdefault(s['record_id'], {})[MONTHS.index(s['month']) + 1] = s['availability']
profile_pattern = {}
for r in ING:
    profile_pattern.setdefault(r['season_profile'], month_av.get(r['ingredient_id'], {}))

taxon_of = {}
for lat, t in CUR['taxa'].items():
    for i in t['ids']:
        taxon_of[i] = (lat, t)

# ---------------- classification rules (stated)
def food_category(r):
    s, t = r['slug'], r['ingredient_type']
    if t == 'famine_substitute':
        return 'famine_substitute'
    if t == 'water':
        return 'water'
    if t in ('waste', 'byproduct') and ('chaff' in s or 'husk' in s or 'siftings' in s or 'spent' in s):
        return 'grain_byproduct'
    if s == 'natural_salt_brine':
        return 'seasoning'
    if 'brine' in s or s.startswith('broth'):
        return 'brine_broth'
    if t == 'drink':
        return 'drink'
    if s in ('salt_coarse', 'vinegar', 'hops', 'aromatic_herbs', 'dried_herbs', 'horseradish_uncertain', 'imported_spice_generic', 'natural_salt_brine'):
        return 'seasoning'
    if 'malt' in s or 'wort' in s or 'yeast' in s or s.startswith('sprouted'):
        return 'malt_brewing'
    if s.startswith('bread') or s.startswith('flatbread') or s in ('stale_bread', 'bread_crumbs', 'raw_flatbread'):
        return 'bread_baked'
    if s.startswith('porridge'):
        return 'porridge'
    if 'starter' in s or 'dough' in s or 'mash' in s:
        return 'dough_leaven'
    if 'flour' in s or 'groats' in s or s == 'bran':
        return 'groats_flour'
    if s.endswith('_grain') or s.startswith('grain_'):
        return 'grain'
    if s.startswith('pea') or 'legume' in s or 'bean' in s or 'lentil' in s:
        return 'legume'
    if s in ('turnip', 'cabbage', 'onion', 'garlic', 'onion_greens', 'garden_root', 'cucumber', 'fermented_cabbage', 'dried_turnip', 'cabbage_chopped', 'cabbage_in_brine'):
        return 'vegetable'
    if 'greens' in s:
        return 'wild_greens'
    if s.startswith('mushroom'):
        return 'mushroom'
    if s.startswith('apple') or s == 'cherry':
        return 'fruit'
    if 'berr' in s or s in ('raspberry', 'bilberry', 'lingonberry', 'cranberry', 'currant', 'wild_strawberry', 'cloudberry', 'rowan_berry', 'berry_juice'):
        return 'berry'
    if 'hazel' in s or 'seed' in s:
        return 'nut_seed'
    if s == 'plant_oil':
        return 'oil_fat'
    if t == 'fat' or s in ('pork_lard',):
        return 'oil_fat'
    if s.startswith('honey'):
        return 'honey'
    if s.startswith('egg'):
        return 'egg'
    if s.startswith('milk') or s in ('cream', 'sour_milk', 'milk_curd', 'fresh_curd', 'whey', 'butter_fresh', 'butter_washed', 'buttermilk', 'fresh_cheese', 'pressed_fresh_cheese', 'aged_cheese_uncertain'):
        return 'dairy'
    if s in ('liver', 'kidney', 'heart', 'tongue', 'stomach_cleaned', 'blood_animal'):
        return 'offal'
    if s in ('hare_meat', 'elk_meat', 'beaver_meat', 'wild_boar_meat', 'capercaillie_meat', 'waterfowl_meat'):
        return 'meat_game'
    if 'meat' in s or s in ('beef', 'veal', 'pork', 'mutton_goat', 'horsemeat_emergency'):
        return 'meat_domestic'
    if s.startswith('fish_') and s not in ('fish_generic',):
        return 'fish_product'
    if r['season_profile'] in ('fish_year_round_variable',):
        return 'fish'
    return 'other'


def fasting_class(r, cat):
    s = r['slug']
    if cat in ('meat_domestic', 'meat_game', 'offal'):
        return 'meat'
    if cat == 'brine_broth':
        return 'meat' if ('meat' in s) else ('fish' if 'fish' in s else 'plant')
    if cat == 'oil_fat':
        return 'plant_oil' if s == 'plant_oil' else 'animal_fat'
    if cat == 'dairy':
        return 'dairy'
    if cat == 'egg':
        return 'eggs'
    if cat in ('fish', 'fish_product'):
        return 'fish'
    if cat == 'drink':
        return 'alcohol'
    if cat == 'honey':
        return 'honey'
    if cat == 'water':
        return 'water'
    return 'plant'


def access_for(cost, social_scope, cat, famine=False):
    cls = CUR['classes']
    if famine:
        return {c: 'famine_only' for c in cls}
    base = dict(CUR['access_rule'].get(cost or 'low', CUR['access_rule']['low']))
    ss = jl(social_scope) if isinstance(social_scope, str) else (social_scope or [])
    if ss and 'common' not in ss:
        for c in ('poor', 'common_urban', 'rural', 'fisher'):
            base[c] = ACCESS_ORDER[max(0, ACCESS_ORDER.index(base[c]) - 1)]
    if cat in ('fish', 'fish_product'):
        base['fisher'] = ACCESS_ORDER[min(3, ACCESS_ORDER.index(base['fisher']) + 1)]
    if cat == 'meat_game':
        base['rural'] = ACCESS_ORDER[min(3, ACCESS_ORDER.index(base['rural']) + 1)]
    return base


PM = RUL['preservation_methods']
SPOIL = RUL['spoilage_lexicon']


def storage_forms(cat):
    return [p['pm_id'] for p in PM if cat in p['applies_to']]


def spoil_states(cat):
    return [s['state_id'] for s in SPOIL if cat in s['applies_to_categories'] or '*' in s['applies_to_categories']]


def refs_for_master(r, extra=()):
    out = ['master-food:' + x for x in jl(r.get('source_ids', ''))]
    out.append(f"{MASTER_REL}/ingredients.csv:{r['ingredient_id']}")
    return uniq(out + list(extra))


# ---------------- ingredients
ingredients = []
fd_by_master = {}
refined_ma = {}
for r in ING:
    iid = r['ingredient_id']
    if iid in CUR['excluded_master_ingredients']:
        continue
    ov = CUR['overrides'].get(iid, {})
    cat = food_category(r)
    fcls = fasting_class(r, cat)
    ma = dict(month_av.get(iid, {}))
    win = CUR['phenology_windows'].get(iid)
    mbasis = f'{MASTER_REL}/food_seasonality.csv:ingredient:{iid}'
    if win:
        moved = [m for m, v in ma.items() if v in FRESH and m not in win]
        for m in moved:
            ma[m] = 'rare'
        if moved:
            mbasis += f'; fresh months {sorted(moved)} moved to limited by phenology window {win} (ext:tzvelev2000, curated.json)'
    refined_ma[iid] = (ma, win)
    lat, t = taxon_of.get(iid, ('', {}))
    origin = ov.get('origin') or ('local' if r['local_or_imported'] == 'local' else r['local_or_imported'])
    notes = r['notes'] or ''
    if ov.get('note_add'):
        notes = (notes + '; ' if notes else '') + ov['note_add']
    if ov.get('origin_note'):
        notes = (notes + '; ' if notes else '') + ov['origin_note']
    freq = RARITY_BASE.get(r['rarity'], 'rare')
    fd = 'fd_' + r['slug']
    fd_by_master[iid] = fd
    ingredients.append(dict(
        fd_id=fd, master_ingredient_id=iid, name_ru=r['name_ru'], name_en=r['slug'].replace('_', ' '),
        name_lat=lat, source_taxon_ref=('taxon:' + lat) if lat else '', taxon_kind=t.get('kind', ''),
        food_category=cat, ingredient_type=r['ingredient_type'], fasting_class=fcls, fasting_status=r['fasting_status'],
        category_id=f'content_food.{cat}.{r["slug"]}', universal_category='true', region_id='novgorod_land',
        origin=origin, months_available=[m for m in range(1, 13) if ma.get(m) in AVAIL],
        months_fresh=[m for m in range(1, 13) if ma.get(m) in FRESH],
        months_limited=[m for m in range(1, 13) if ma.get(m) in LIMITED],
        season_profile=r['season_profile'], month_basis=mbasis,
        access_by_class=access_for(ov.get('relative_cost', r['relative_cost']), r['social_scope'], cat),
        storage_forms=storage_forms(cat), storage_container_ids=jl(r['storage_container_ids']),
        shelf_life=r['estimated_shelf_life'], spoilage_signs=jl(r['spoilage_signs']), spoilage_states=spoil_states(cat),
        rarity=r['rarity'], frequency_class=freq, frequency_weight=FREQ_W[freq], relative_cost=ov.get('relative_cost', r['relative_cost']),
        famine_1230_role='attested_substitute' if iid == 'ING0110' else ('analogy_substitute' if iid in ('ING0169', 'ING0054') else ''),
        recipe_evidence_type=r['recipe_evidence_type'],
        source_refs=refs_for_master(r, ov.get('add_refs', []) + (t.get('refs', []) if t else [])),
        confidence=r['historical_confidence'], status='candidate', notes=notes))

for a in CUR['additions']:
    lat, t = taxon_of.get(a['key'], ('', {}))
    pat = profile_pattern.get(a['season_profile'], {})
    ma = dict(pat)
    if a['key'] == 'ADD_elm_leaves':
        ma = {m: ('context_only' if m in (5, 6, 7, 8, 9) else 'unavailable') for m in range(1, 13)}
    cat = a['food_category']
    famine = cat == 'famine_substitute'
    freq = RARITY_BASE.get(a['rarity'], 'rare')
    fd = 'fd_' + a['slug']
    fd_by_master[a['key']] = fd
    ingredients.append(dict(
        fd_id=fd, master_ingredient_id='', name_ru=a['name_ru'], name_en=a['name_en'], name_lat=lat,
        source_taxon_ref=('taxon:' + lat) if lat else '', taxon_kind=t.get('kind', ''), food_category=cat,
        ingredient_type=a['ingredient_type'], fasting_class=a['fasting_class'], fasting_status='fasting_allowed',
        category_id=f'content_food.{cat}.{a["slug"]}', universal_category='true', region_id='novgorod_land', origin=a['origin'],
        months_available=[m for m in range(1, 13) if ma.get(m) in AVAIL], months_fresh=[m for m in range(1, 13) if ma.get(m) in FRESH],
        months_limited=[m for m in range(1, 13) if ma.get(m) in LIMITED], season_profile=a['season_profile'],
        month_basis=f'rule: season_profile pattern {a["season_profile"]} from {MASTER_REL}/food_seasonality.csv',
        access_by_class=access_for(a['relative_cost'], [], cat, famine=famine), storage_forms=storage_forms(cat),
        storage_container_ids=[], shelf_life='', spoilage_signs=[], spoilage_states=spoil_states(cat), rarity=a['rarity'],
        frequency_class=freq, frequency_weight=FREQ_W[freq], relative_cost=a['relative_cost'],
        famine_1230_role=('attested_substitute' if famine and a['confidence'] == 'A' else ('analogy_substitute' if famine else '')),
        recipe_evidence_type='direct_text' if a['confidence'] == 'A' else ('archaeological' if a['confidence'] == 'B' else 'comparative_reconstruction'),
        source_refs=uniq(a['refs'] + t.get('refs', [])), confidence=a['confidence'], status='candidate', notes=a['notes']))

ING_COLS = list(ingredients[0].keys())
fd_rows = {r['fd_id']: r for r in ingredients}

# per-month table
months_rows = []
for r in ING:
    iid = r['ingredient_id']
    if iid not in fd_by_master:
        continue
    for m in range(1, 13):
        ma, win = refined_ma[iid]
        v = ma.get(m)
        if v is None:
            continue
        months_rows.append(dict(fd_id=fd_by_master[iid], month=m, availability=v,
                                basis=r['season_profile'] + ('; refined by phenology window' if win and month_av[iid].get(m) != v else ''),
                                source_refs=[f'{MASTER_REL}/food_seasonality.csv:ingredient:{iid}:{MONTHS[m-1]}'],
                                confidence=r['historical_confidence'], status='candidate'))

# taxon refs table
taxon_rows = []
for lat, t in CUR['taxa'].items():
    taxon_rows.append(dict(taxon_ref='taxon:' + lat, name_lat=lat, name_ru=t['name_ru'], kind=t['kind'], rank=t['rank'],
                           fd_ids=[fd_by_master[i] for i in t['ids'] if i in fd_by_master],
                           expected_sibling_domain={'flora': 'flora_* / cultivated_plants (fl_id)', 'fungi': 'flora_berries_mushrooms (fl_id)', 'fauna': 'fauna_* / livestock_husbandry (fa_id)'}[t['kind']],
                           sibling_id='', source_refs=t['refs'], confidence='B' if t['rank'] in ('species', 'subspecies', 'variety', 'form', 'genus', 'species_complex') else 'C', status='candidate'))

# household stock profiles
SEASONS = {k: v for k, v in CUR['seasons'].items() if not k.startswith('_')}
STOCK_TYPES = {'raw_product', 'processed_product', 'finished_food', 'seasoning', 'fat', 'drink'}
MONASTERY_EXCL = {'meat'}  # RFR005 allows no meat at all


def step(freq, k):
    i = FREQ_ORDER.index(freq) + k
    return FREQ_ORDER[i] if i >= 0 else None


stock = []
for hh in CUR['household_types']:
    cls = hh['class']
    for season, months in SEASONS.items():
        for r in ingredients:
            if r['ingredient_type'] not in STOCK_TYPES:
                continue
            if hh['id'] == 'hh_monastery' and r['fasting_class'] in MONASTERY_EXCL:
                continue
            acc = r['access_by_class'].get(cls, 'none')
            if acc not in ACCESS_STEP:
                continue
            if any(m in r['months_available'] for m in months):
                mstep = 0
            elif any(m in r['months_limited'] for m in months):
                mstep = -1
            else:
                continue
            f = step(r['frequency_class'], ACCESS_STEP[acc] + mstep)
            if not f:
                continue
            stock.append(dict(profile_id=f'hs_{hh["id"][3:]}_{season}_{r["fd_id"][3:]}', household_type=hh['id'], household_class=cls,
                              season_period=season, fd_id=r['fd_id'], world_phase='ordinary', presence_class=f, presence_weight=FREQ_W[f],
                              qty_band=QTY_BAND[f],
                              qty_rule=f'rarity {r["rarity"]}->{r["frequency_class"]}; access {acc} ({ACCESS_STEP[acc]}); months {mstep}; weight 8/4/2/1; qty_band ample/some/little/trace by class; exact mass by code owner',
                              source_refs=r['source_refs'][:3] + ['rule:curated_rules/household stock (build.py)'], confidence='C', status='candidate'))
# famine 1230 overlay rows
GRAIN_CATS = {'grain', 'groats_flour', 'bread_baked', 'porridge', 'malt_brewing', 'dough_leaven'}
FAM_SEASONS = {'autumn': 'autumn 1230', 'winter': 'winter 1230-1231', 'spring_rasputitsa': 'spring 1231', 'summer': 'summer 1231 (until harvest)'}
base_index = {(s['household_type'], s['season_period'], s['fd_id']): s for s in stock}
fam_stock = []
for (hht, season, fd), s in base_index.items():
    if season not in FAM_SEASONS:
        continue
    r = fd_rows[fd]
    k = -2 if r['food_category'] in GRAIN_CATS else -1
    if hht == 'hh_boyar_urban' or hht == 'hh_monastery':
        k += 1  # unequal access (famine rule: not all strata equal)
    f = step(s['presence_class'], k)
    if not f:
        continue
    fam_stock.append(dict(s, profile_id=s['profile_id'] + '_famine1230', world_phase='famine_1230:' + FAM_SEASONS[season],
                          presence_class=f, presence_weight=FREQ_W[f], qty_band=QTY_BAND[f],
                          qty_rule=s['qty_rule'] + f'; famine_1230 step {k} (grain -2, other -1, boyar/monastery +1)',
                          source_refs=['ext:npl1950_6738_6739', 'temporal-v4:record:historical_phase_local_effect_rules:novgorod_famine_1230_v2', f'{SNAP_REL}/famine_1230_context.csv:famine_1230_context'],
                          confidence='C'))
for hh in CUR['household_types']:
    if hh['class'] not in ('poor', 'rural', 'common_urban', 'fisher'):
        continue
    for season in ('winter', 'spring_rasputitsa', 'summer'):
        for r in ingredients:
            if r['food_category'] != 'famine_substitute':
                continue
            if r['fd_id'] == 'fd_elm_leaves_famine' and season == 'winter':
                continue
            fam_stock.append(dict(profile_id=f'hs_{hh["id"][3:]}_{season}_{r["fd_id"][3:]}_famine1230', household_type=hh['id'],
                                  household_class=hh['class'], season_period=season, fd_id=r['fd_id'],
                                  world_phase='famine_1230:' + FAM_SEASONS[season], presence_class='rare', presence_weight=1, qty_band='trace',
                                  qty_rule='famine substitute: rare for poor/common/rural/fisher households only in famine phase; no quantity authored',
                                  source_refs=r['source_refs'], confidence=r['confidence'] if r['confidence'] == 'C' else 'B', status='candidate'))
stock_all = stock + fam_stock

# ---------------- dishes
links_by = {}
for l in LINKS:
    links_by.setdefault(l['recipe_id'], []).append(l)
steps_by = {}
for s in STEPS:
    steps_by.setdefault(s['recipe_id'], []).append(s)

SUBCAT_DISH = {
    'bread': 'bread', 'flatbread': 'flatbread', 'batter_cake': 'flatbread', 'filled_baked_food': 'flatbread',
    'porridge': 'porridge', 'porridge_variant': 'porridge', 'grain_pottage': 'pottage', 'mixed_pottage': 'pottage',
    'vegetable_pottage': 'pottage', 'wild_green_pottage': 'pottage', 'legume_pottage': 'pottage', 'legume': 'pottage',
    'turnip': 'pottage', 'turnip_variant': 'sweet', 'allium_or_root': 'pottage', 'cabbage': 'pottage', 'mushrooms': 'pottage',
    'fish_pottage': 'fish', 'fish_species_variant': 'fish', 'fresh_fish': 'fish', 'preserved_fish_use': 'fish', 'pan_frying': 'fish',
    'boiled_meat': 'meat', 'roasted_meat': 'meat', 'meat_one_pot': 'meat', 'offal': 'meat', 'preserved_meat_use': 'meat',
    'egg': 'egg', 'sweet_food': 'sweet', 'leftovers': 'leftovers',
    'beer': 'drink_festive', 'honey_drink': 'drink_festive', 'wine': 'drink_festive',
    'kvass_like': 'drink_everyday', 'berry_drink': 'drink_everyday', 'dairy_drink': 'drink_everyday', 'milk': 'drink_everyday',
    'water': 'drink_everyday', 'kissel': 'porridge', 'honey_water': 'drink_everyday'}
PRESERV_MAP = {'drying': ['pm_drying'], 'fish_dried': ['pm_drying'], 'fish_drying': ['pm_drying'], 'herb_drying': ['pm_drying'],
               'meat_drying': ['pm_drying'], 'vegetable_drying': ['pm_drying'], 'fish_salted': ['pm_salting'], 'fish_salting': ['pm_salting'],
               'meat_salting': ['pm_salting'], 'roe': ['pm_salting'], 'fish_smoking': ['pm_smoking'], 'vegetable_fermentation': ['pm_fermenting'],
               'berry_storage': ['pm_cellar'], 'cold_storage': ['pm_cellar', 'pm_freezing_winter'], 'grain_storage': ['pm_dry_storage_grain'],
               'root_storage': ['pm_cellar'], 'dairy_fermentation': ['pm_fermenting'], 'bread_fermentation': ['pm_fermenting'],
               'cheese': ['pm_cellar'], 'butter': ['pm_cellar'], 'honey': ['pm_honey_wax']}
FORBID_FAST = {'meat', 'dairy', 'eggs', 'animal_fat'}
LEX = RUL['sensory_lexicon']


def sensory(subcat):
    for e in LEX:
        if subcat in e['match_subcategory']:
            return e
    return None


EXTRA_REFS = {'kvass_like': ['ext:pvl_6504_996'], 'honey_drink': ['ext:pvl_6504_996']}

dishes, step_rows, unresolved = [], [], []


def mk_dish(rid, slug, name_ru, rtype, subcat, desc, req, opt, social, season_scope, heating, servings, qty, storage,
            shelf, master_fast, attest, evtype, refs, notes, steps, cost='low'):
    dish_cat = SUBCAT_DISH.get(subcat, 'not_a_meal' if rtype in ('preservation', 'processing', 'storage') else 'pottage')
    if rtype in ('preservation', 'processing', 'storage'):
        dish_cat = 'not_a_meal'
    req_f = [fd_rows[f] for f in req if f in fd_rows]
    classes = {r['fasting_class'] for r in req_f}
    opt_forbid = [f for f in opt if f in fd_rows and fd_rows[f]['fasting_class'] in FORBID_FAST]
    if classes & FORBID_FAST:
        fc = 'false'
    elif 'fish' in classes:
        fc = 'fish_days_only'
    elif 'alcohol' in classes or subcat in ('beer', 'honey_drink', 'wine', 'kvass_like'):
        fc = 'conditional_alcohol'
    else:
        fc = 'true'
    fday = {'true': ['RFR001', 'RFR002', 'RFR003', 'RFR004', 'RFR007', 'RFR008', 'RFR009', 'RFR010', 'RFR011'],
            'fish_days_only': ['RFR001', 'RFR004', 'RFR012'], 'conditional_alcohol': ['RFR001', 'RFR002', 'RFR004', 'RFR012'],
            'false': ['RFR001', 'RFR012']}[fc]
    recipe_conf = 'C' if evtype in RECON else attest
    lx = sensory(subcat) or {}
    cats = {r['food_category'] for r in req_f}
    sp = uniq(s for c in cats for s in spoil_states(c))
    pm = PRESERV_MAP.get(subcat, [])
    grain_only = all(r['food_category'] in ('grain', 'groats_flour', 'water', 'legume', 'vegetable', 'wild_greens', 'seasoning', 'fish', 'fish_product', 'bread_baked') for r in req_f) and req_f
    famine_role = 'thin_version_ok' if (grain_only and dish_cat in ('porridge', 'pottage', 'bread', 'flatbread')) else ''
    body = []
    if dish_cat == 'drink_festive' or fc == 'conditional_alcohol':
        body.append('intoxication_possible')
    if any(r['food_category'] in ('meat_domestic', 'meat_game', 'offal', 'fish', 'egg') for r in req_f):
        body.append('undercooked_or_spoiled_illness_risk')
    return dict(
        ds_id='ds_' + slug, master_recipe_id=rid, name_ru=name_ru, name_en=slug.replace('_', ' '), recipe_type=rtype, subcategory=subcat,
        dish_category=dish_cat, description_ru=desc,
        ingredients=[{'fd_id': f, 'role': 'required', 'qty_rule': qty.get(f, 'unknown')} for f in req] +
                    [{'fd_id': f, 'role': 'optional', 'qty_rule': qty.get(f, 'as available')} for f in opt],
        process_ref=[f'{SNAP_REL}/recipe_steps.csv:{s}' for s in steps] or ['none'],
        craft_process_ref=f'pc_food_{subcat}', heating_method=heating,
        fasting_compatible=fc, fasting_day_rule_ids=fday, fasting_omit_optional=opt_forbid, master_fasting_status=master_fast,
        meal_slots=RUL['dish_slot_rule'].get(dish_cat, []), class_access=access_for(cost, social, 'dish'),
        social_scope=social, season_scope=season_scope, preservation_method=pm, storage_refs=storage, shelf_life=shelf,
        spoilage_states=sp, famine_role=famine_role,
        sensory_smell_ru=lx.get('smell_ru', ''), sensory_taste_ru=lx.get('taste_ru', ''), sensory_texture_ru=lx.get('texture_ru', ''),
        sensory_look_ru=lx.get('look_ru', ''), sensory_ref=('lex:' + lx['cue_key']) if lx else '',
        portion_rule=f'servings {servings} per batch (gameplay estimate); quantities modern reconstruction, not historical',
        satiety_band=RUL['satiety_rule'].get(dish_cat, 'n/a'), body_effects=body,
        attestation_confidence=attest, recipe_confidence=recipe_conf, recipe_evidence_type=evtype,
        source_refs=uniq(refs), confidence=recipe_conf, status='candidate', notes=notes)


for r in RCP:
    rid = r['recipe_id']
    ls = links_by.get(rid, [])
    req, opt = [], []
    for l in sorted(ls, key=lambda x: int(x['display_order'] or 0)):
        f = fd_by_master.get(l['ingredient_id'])
        if not f:
            unresolved.append((rid, l['ingredient_id']))
            continue
        (req if l['role'] == 'required' else opt).append(f)
    qr = {}
    for k, v in (json.loads(r['ingredient_quantities_reconstruction'] or '{}') or {}).items():
        if k in fd_by_master:
            qr[fd_by_master[k]] = json.dumps(v, ensure_ascii=False) if isinstance(v, dict) else str(v)
    refs = ['master-food:' + x for x in jl(r['source_ids'])] + [f'{MASTER_REL}/recipes.csv:{rid}'] + EXTRA_REFS.get(r['subcategory'], [])
    steps = [s['step_id'] for s in sorted(steps_by.get(rid, []), key=lambda x: int(x['step_number']))]
    d = mk_dish(rid, r['slug'], r['name_ru'], r['recipe_type'], r['subcategory'], r['description_ru'], req, opt, jl(r['social_scope']),
                jl(r['season_scope']), r['heating_method'], r['servings'], qr, jl(r['storage_location_ids']) + jl(r['storage_container_ids']),
                r['estimated_shelf_life'], r['fasting_status'], r['historical_confidence'], r['recipe_evidence_type'], refs,
                (r.get('notes_for_gameplay') or ''), steps, r['relative_cost'])
    dishes.append(d)
    for s in sorted(steps_by.get(rid, []), key=lambda x: int(x['step_number'])):
        step_rows.append(dict(step_id='st_' + s['step_id'].lower(), ds_id=d['ds_id'], step_no=int(s['step_number']), action_ru=s['action'],
                              input_fd_ids=[fd_by_master[i] for i in jl(s['input_ingredient_ids']) if i in fd_by_master],
                              tool_ids=jl(s['tool_ids']), vessel_ids=jl(s['vessel_ids']), duration=s['duration'], heat=s['heat'],
                              result_state=s['result_state'], source_refs=[f'{SNAP_REL}/recipe_steps.csv:{s["step_id"]}'],
                              confidence=d['recipe_confidence'], status='candidate'))

# curated extra dishes (text-attested)
EXTRA_DISHES = [
    dict(slug='kissel_oat', name_ru='Овсяный кисель', rtype='dish', subcat='kissel',
         desc='Кисель из цежа (заквашенной болтушки) овса, пшеницы или отрубей; летопись описывает приготовление цежа, «в немже варять кисель».',
         req=['fd_oat_flour', 'fd_water_well'], opt=['fd_bran', 'fd_wheat_flour', 'fd_honey_liquid'], social=['common'],
         heating='boiling', attest='B', ev='direct_text', refs=['ext:pvl_6505_997'],
         notes='Текст ПВЛ под 997 г. (Белгород, Киевская земля) — аналогия для Новгорода; пропорции и время брожения неизвестны.'),
    dict(slug='syta_honey_water', name_ru='Сыта (мёд, разведённый водой)', rtype='drink', subcat='honey_water',
         desc='Вода, «росыщенная» мёдом; несброженный медовый напиток.',
         req=['fd_honey_liquid', 'fd_water_well'], opt=[], social=['common', 'wealthy', 'merchant', 'boyar', 'monastery'],
         heating='none', attest='B', ev='direct_text', refs=['ext:pvl_6505_997'],
         notes='ПВЛ под 997 г.: мёд из княжьей медуши велено «росытити» водой. Аналогия для Новгорода 1230.'),
]
for e in EXTRA_DISHES:
    miss = [f for f in e['req'] + e['opt'] if f not in fd_rows]
    for f in miss:
        unresolved.append((e['slug'], f))
    dishes.append(mk_dish('', e['slug'], e['name_ru'], e['rtype'], e['subcat'], e['desc'], [f for f in e['req'] if f in fd_rows],
                          [f for f in e['opt'] if f in fd_rows], e['social'], ['spring', 'summer', 'autumn', 'winter'], e['heating'], '',
                          {}, [], '', 'fasting_allowed', e['attest'], e['ev'], e['refs'], e['notes'], [], 'medium' if 'honey' in e['slug'] else 'low'))

DISH_COLS = list(dishes[0].keys())
ds_by_master = {d['master_recipe_id']: d['ds_id'] for d in dishes if d['master_recipe_id']}

# meal profiles
meal_rows = []
for m in MEALS:
    rids = jl(m['recipe_ids']) + jl(m['drink_recipe_ids'])
    meal_rows.append(dict(mp_id='mp_' + m['slug'], master_meal_set_id=m['meal_set_id'], name_ru=m['name_ru'], context=m['context'],
                          social_scope=jl(m['social_scope']), season=jl(m['season']),
                          ds_ids=[ds_by_master[x] for x in rids if x in ds_by_master], unresolved_recipe_ids=[x for x in rids if x not in ds_by_master],
                          modifier_ref=m.get('modifier_ref', ''), source_refs=[f'{SNAP_REL}/meal_sets.csv:{m["meal_set_id"]}'],
                          confidence=m['historical_confidence'] if m['historical_confidence'] in 'ABC' else 'C', status='candidate', notes=m['notes']))
slot_rows = []
_slot_name_by_id = {x['slot_id']: x['name_ru'] for x in RUL['meal_slots']['slots']}
for i, s in enumerate(RUL['meal_slots']['by_class_season'], 1):
    slot_rows.append(dict(ms_id=f'ms_{i:02d}', household_class=s['class'], season_period=s['season'], day_kind=s['day_kind'], slots=s['slots'],
                          slot_names_ru=[_slot_name_by_id[sid] for sid in s['slots']],
                          source_refs=['rule:curated_rules.json/meal_slots', 'master-food:FSRC007'] if s['day_kind'] in ('fast', 'strict_fast') else ['rule:curated_rules.json/meal_slots'],
                          confidence='C', status='candidate', notes=RUL['meal_slots']['_about']))

# fasting rules
fast_rows = []
for r in RFR:
    fast_rows.append(dict(fr_id='fr_' + r['rule_id'].lower(), kind='rule', master_rule_id=r['rule_id'], name_ru=r['name_ru'], context=r['context'],
                          timing_rule='', allowed_classes=jl(r['allowed_classes']), conditional_classes=jl(r['conditional_classes']),
                          forbidden_classes=jl(r['forbidden_classes']), source_refs=[f'{MASTER_REL}/religious_food_rules.csv:{r["rule_id"]}', 'master-food:FSRC007'],
                          confidence=r['confidence'], status='candidate', notes=r['basis'] + '; ' + r['notes']))
for p in CUR['fasting_periods']:
    fast_rows.append(dict(fr_id=p['id'], kind='period', master_rule_id=p['rule_ref'], name_ru=p['name_ru'], context='calendar_period',
                          timing_rule=p['timing_rule'], allowed_classes=[], conditional_classes=p['conditional_classes'],
                          forbidden_classes=p['forbidden_classes'], source_refs=p['refs'], confidence=p['confidence'], status='candidate', notes=p['notes']))

# preservation, spoilage, sensory, famine
pres_rows = []
for p in PM:
    linked = [d['ds_id'] for d in dishes if p['pm_id'] in d['preservation_method']]
    pres_rows.append(dict(pm_id=p['pm_id'], name_ru=p['name_ru'], applies_to_categories=p['applies_to'], ds_ids=linked,
                          fd_ids=[r['fd_id'] for r in ingredients if p['pm_id'] in r['storage_forms']][:400], evidence_ru=p['evidence'],
                          source_refs=p['refs'], confidence=p['confidence'], status='candidate'))
spoil_rows = [dict(state_id=s['state_id'], is_spoilage='false' if s['state_id'] in ('soured',) else 'true', smell_ru=s['smell_ru'], look_ru=s['look_ru'],
                   applies_to_categories=s['applies_to_categories'], body_effect=s['body_effect'], source_refs=s['refs'], confidence='C', status='candidate') for s in SPOIL]
lex_rows = [dict(cue_key=e['cue_key'], match_subcategory=e['match_subcategory'], smell_ru=e['smell_ru'], taste_ru=e['taste_ru'], texture_ru=e['texture_ru'],
                 look_ru=e['look_ru'], source_refs=e['refs'] or ['rule:authored_prose_lexicon'], confidence='C', status='candidate') for e in LEX]
fam_rows = [dict(fam_id=f['id'], kind=f['kind'], name_ru=f['name_ru'], value=f['value'],
                 fd_id=(fd_by_master.get(f['value'][3:]) or f['value'][3:]) if f['value'].startswith('fd:') else '',
                 game_use=f['game_use'], materialization_policy=f['materialization_policy'], source_refs=f['refs'], confidence=f['confidence'], status='candidate')
            for f in CUR['famine_1230']]

# ---------------- write
counts = {}
counts['food/ingredients.csv'] = wr(OUT / 'food/ingredients.csv', ingredients, ING_COLS)
counts['food/ingredient_months.csv'] = wr(OUT / 'food/ingredient_months.csv', months_rows, list(months_rows[0].keys()))
counts['food/taxon_refs.csv'] = wr(OUT / 'food/taxon_refs.csv', taxon_rows, list(taxon_rows[0].keys()))
counts['food/household_food_stock_profiles.csv'] = wr(OUT / 'food/household_food_stock_profiles.csv', stock_all, list(stock_all[0].keys()))
counts['dishes/dishes_meals.csv'] = wr(OUT / 'dishes/dishes_meals.csv', dishes, DISH_COLS)
counts['dishes/recipe_steps.csv'] = wr(OUT / 'dishes/recipe_steps.csv', step_rows, list(step_rows[0].keys()))
counts['dishes/meal_profiles.csv'] = wr(OUT / 'dishes/meal_profiles.csv', meal_rows, list(meal_rows[0].keys()))
counts['dishes/meal_slot_rules.csv'] = wr(OUT / 'dishes/meal_slot_rules.csv', slot_rows, list(slot_rows[0].keys()))
counts['dishes/fasting_rules.csv'] = wr(OUT / 'dishes/fasting_rules.csv', fast_rows, list(fast_rows[0].keys()))
counts['dishes/preservation_storage.csv'] = wr(OUT / 'dishes/preservation_storage.csv', pres_rows, list(pres_rows[0].keys()))
counts['dishes/spoilage_states.csv'] = wr(OUT / 'dishes/spoilage_states.csv', spoil_rows, list(spoil_rows[0].keys()))
counts['dishes/sensory_lexicon.csv'] = wr(OUT / 'dishes/sensory_lexicon.csv', lex_rows, list(lex_rows[0].keys()))
counts['dishes/famine_1230.csv'] = wr(OUT / 'dishes/famine_1230.csv', fam_rows, list(fam_rows[0].keys()))

# sources register: every ref used
used = set()
for p, _ in counts.items():
    for row in rd(OUT / p):
        for x in jl(row.get('source_refs', '')):
            used.add((x.split('.csv:')[0] + '.csv') if '.csv:' in x else x)
ext = {s['id']: s for s in CUR['new_sources']}
ext['ext:pvl_6504_996'] = {'title': 'Повесть временных лет, под 6504 (996): Владимир велит развозить хлебы, мясо, рыбу, овощь, мёд в бочках и квасы', 'url': 'http://lib.pushkinskijdom.ru/Default.aspx?tabid=4869', 'trust': 'A text; B as analogy for Novgorod 1230'}
ext['ext:pvl_6505_997'] = {'title': 'Повесть временных лет, под 6505 (997): белгородский кисель — цеж из овса, пшеницы или отрубей; мёд «росытити»', 'url': 'http://lib.pushkinskijdom.ru/Default.aspx?tabid=4869', 'trust': 'A text; B as analogy for Novgorod 1230'}
src_rows = []
for u in sorted(used):
    kind, title, url, trust = u.split(':', 1)[0], '', '', ''
    if u.startswith('master-food:'):
        m = MSRC.get(u.split(':', 1)[1], {})
        title, url, trust = m.get('title', 'MISSING'), m.get('url', ''), m.get('trust_level', '')
    elif u.startswith('ext:'):
        m = ext.get(u, {})
        title, url, trust = m.get('title', 'MISSING'), m.get('url', ''), m.get('trust', '')
    elif u.startswith('wk:claim:'):
        title, trust = 'WK production-v1 approved claim', 'approved (WK)'
    elif u.startswith('sqlite:'):
        title, url, trust = 'Curated SQLite novgorod_1230 (owner Downloads), table:key', 'C:/Users/Slaven/Downloads/novgorod_1230(1) (1).sqlite', 'A/B/C per row (see table confidence)'
    elif u.startswith('temporal-v4:'):
        title, trust = 'Temporal v4 approved record', 'approved'
    elif u.startswith('rule:'):
        title, trust = 'Stated derivation rule in scripts/curated or build.py', 'C (rule)'
    else:
        title, trust = 'Repository file row', 'see file'
        kind = 'file'
    src_rows.append(dict(ref=u, kind=kind, title=title, url=url, trust=trust))
ext_used = {k: v for k, v in ext.items()}
counts['sources.csv'] = wr(OUT / 'sources.csv', src_rows, ['ref', 'kind', 'title', 'url', 'trust'])
(OUT / 'scripts/build_report.json').write_text(json.dumps({'counts': counts, 'unresolved_recipe_ingredients': unresolved}, ensure_ascii=False, indent=1), encoding='utf-8')
print(json.dumps(counts, ensure_ascii=False, indent=1))
print('unresolved', len(unresolved), unresolved[:10])
