#!/usr/bin/env python3
"""Build candidate datasets for group clothing-appearance (Novgorod ~1230).

Deterministic: reads costume-dataset-v1 (candidate, PASS), social roles and
occupations TSV, and encodes the authoring rules below as data tables.
Stdlib only.  Run:  python scripts/build.py   then   python scripts/check.py
"""
import csv, json, re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent                                   # clothing-appearance/
NOV = ROOT.parents[1]                                # data/world-catalogs/novgorod
REPO = ROOT.parents[4]
COSTUME = NOV / 'sources' / 'costume-dataset-v1' / 'data'
REGION = REPO / 'data' / 'novgorod-region'
REGION_ID = 'region_novgorod_land'
STATUS = 'candidate'

SEASONS = ['summer', 'spring', 'spring_rasputitsa', 'autumn', 'winter']
ADULT_AGES = ['young_adult', 'adult', 'middle_aged', 'old']   # ACTOR_BASE_APPEARANCE_VOCABULARY.age_category
BANDS = ['low', 'middle', 'high', 'elite']


def read_csv(p, delim=','):
    with open(p, encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f, delimiter=delim))


def write_csv(p, rows, fields):
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator='\n')
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, '') for k in fields})


def split(s):
    return [x.strip() for x in re.split(r'\s*\|\s*', s or '') if x.strip()]


# ---------------------------------------------------------------- slots
# in_runtime_code: slot key already used by v17 runtime data/code
# (m2c-npc runtime-bindings.json variants; actor-portrait-spec-v1.js SLOT map).
SLOTS = [
    ('base_garment', 'нательная рубаха/сорочица', 'body base layer', True, 'wearable'),
    ('lower_garment', 'порты/штаны', 'legwear', True, 'wearable'),
    ('outer_garment', 'верхняя шерстяная одежда (свита, туника)', 'outer layer', True, 'wearable'),
    ('over_garment_winter', 'кожух/шуба поверх одежды', 'winter over-layer', False, 'wearable'),
    ('cloak', 'плащ/накидка', 'cloak', False, 'wearable'),
    ('waist', 'пояс', 'belt', False, 'wearable'),
    ('waist_garment', 'поясная женская одежда (понёва, гипотеза)', 'wrap skirt', False, 'wearable'),
    ('apron', 'передник', 'apron', False, 'wearable'),
    ('headwear', 'головной убор (верхний)', 'headwear', True, 'wearable'),
    ('head_under', 'нижний женский убор (повой/чепец)', 'under-cap', False, 'wearable'),
    ('headband', 'налобная повязка/очелье', 'headband', False, 'wearable'),
    ('handwear', 'рукавицы/перчатки', 'mittens/gloves', False, 'wearable'),
    ('leg_wrap', 'обмотки голени', 'shin wraps', False, 'wearable'),
    ('foot_layer', 'онуча/носок', 'foot wrap/sock', False, 'wearable'),
    ('insole', 'стелька', 'insole', False, 'wearable'),
    ('footwear', 'обувь', 'footwear', True, 'wearable'),
    ('over_footwear', 'поршни поверх обуви', 'overshoe', False, 'wearable'),
    ('footwear_attachment', 'ледоход/шпора на обуви', 'shoe attachment', False, 'situational'),
    ('vestment_base', 'стихарь', 'liturgical base vestment', False, 'liturgy_only'),
    ('vestment_stole', 'епитрахиль/орарь', 'liturgical stole', False, 'liturgy_only'),
    ('vestment_outer', 'фелонь', 'liturgical outer vestment', False, 'liturgy_only'),
    ('vestment_cuffs', 'поручи', 'liturgical cuffs', False, 'liturgy_only'),
    ('vestment_omophorion', 'омофор', 'omophorion', False, 'liturgy_only'),
    ('trim', 'отделка (компонент, не слот экипировки)', 'trim component', False, 'component'),
    ('component', 'деталь вещи (пряжка, завязки)', 'item component', False, 'component'),
    # adornment slots (used by adornment_appearance)
    ('neck', 'шея (ожерелье, гривна)', 'neck', False, 'adornment'),
    ('chest_pendant', 'нательный/нагрудный привес', 'pendant', False, 'adornment'),
    ('ear_temple', 'височные украшения/серьги', 'temple/ear', False, 'adornment'),
    ('head_ornament', 'украшения головного убора', 'headdress ornament', False, 'adornment'),
    ('wrist', 'браслет', 'wrist', False, 'adornment'),
    ('finger', 'перстень/кольцо', 'finger', False, 'adornment'),
    ('garment_fastener', 'фибула/застёжка/булавка/пуговица', 'fastener', False, 'adornment'),
]
SLOT_KEYS = {s[0] for s in SLOTS}

# ------------------------------------------------ costume subcategory map
# subcategory -> (disposition, slot, universal garment category, name_en, usage_context)
# disposition: garment | component | adornment | reject:<target_domain>:<reason>
G = 'garment'
SUB = {
    'base_layer': (G, 'base_garment', 'garment.kind.tunic_shirt', 'linen shirt (sorochitsa)', 'daily'),
    'base_layer_work': (G, 'base_garment', 'garment.kind.tunic_shirt', 'coarse work shirt', 'daily'),
    'middle_layer': (G, 'outer_garment', 'garment.kind.wool_tunic', 'wool upper tunic', 'daily'),
    'legwear': (G, 'lower_garment', 'garment.kind.trousers_porty', 'trousers (porty)', 'daily'),
    'legwear_winter': (G, 'lower_garment', 'garment.kind.trousers_porty', 'wool winter trousers', 'daily'),
    'leg_wraps': (G, 'leg_wrap', 'garment.kind.leg_wraps', 'shin wraps', 'daily'),
    'outerwear': (G, 'outer_garment', 'garment.kind.svita', 'svita (wool outer coat)', 'daily'),
    'outerwear_winter': (G, 'over_garment_winter', 'garment.kind.sheepskin_coat_kozhukh', 'sheepskin coat (kozhukh)', 'daily'),
    'outerwear_winter_common': (G, 'over_garment_winter', 'garment.kind.sheepskin_coat_kozhukh', 'sheepskin coat (female)', 'daily'),
    'outerwear_winter_status': (G, 'over_garment_winter', 'garment.kind.fur_coat_shuba', 'cloth-covered fur coat (shuba)', 'daily'),
    'cloak': (G, 'cloak', 'garment.kind.cloak', 'cloak', 'daily'),
    'cloak_documented_color': (G, 'cloak', 'garment.kind.cloak', 'red-brown wool cloak', 'daily'),
    'travel_cloak': (G, 'cloak', 'garment.kind.cloak', 'heavy travel cloak', 'travel'),
    'hood': (G, 'headwear', 'garment.kind.hood', 'hood', 'daily'),
    'workwear': (G, 'apron', 'garment.kind.apron', 'textile work apron', 'work'),
    'workwear_protective': (G, 'apron', 'garment.kind.apron', 'leather craft apron', 'work'),
    'status_garment': (G, 'outer_garment', 'garment.kind.wool_tunic', 'fine wool status garment', 'daily'),
    'trim': ('component', 'trim', 'garment.component.trim', 'silk / gold-thread trim', 'daily'),
    'travel_bedding': (G, 'cloak', 'garment.kind.blanket_wrap', 'wool blanket used as a wrap', 'travel'),
    'overdress': (G, 'outer_garment', 'garment.kind.long_wool_garment', 'long wool overgarment (female)', 'daily'),
    'overdress_work': (G, 'outer_garment', 'garment.kind.long_wool_garment', 'work wool overgarment (female)', 'daily'),
    'status_overdress': (G, 'outer_garment', 'garment.kind.long_wool_garment', 'fine wool garment (wealthy woman)', 'daily'),
    'documented_color': ('reject:colour_evidence_only:тип вещи в описи приданого не определён; используется только как свидетельство цвета (COL002/COL004)', '', '', 'dowry textile of unknown type', ''),
    'waist_garment_hypothesis': (G, 'waist_garment', 'garment.kind.wrap_skirt_poneva', 'poneva-type wrap skirt (hypothesis)', 'hypothesis'),
    'winter_outerwear': (G, 'over_garment_winter', 'garment.kind.sheepskin_coat_kozhukh', 'child fur winter layer', 'daily'),
    'belt': (G, 'waist', 'garment.kind.belt', 'belt', 'daily'),
    'handwear': (G, 'handwear', 'garment.kind.mittens', 'child wool mittens', 'daily'),
    'male_textile_cap': (G, 'headwear', 'garment.kind.soft_cap', 'soft wool cap', 'daily'),
    'male_felt_cap': (G, 'headwear', 'garment.kind.felt_cap', 'felt cap (kolpak)', 'daily'),
    'male_fur_cap': (G, 'headwear', 'garment.kind.fur_cap', 'fur winter cap', 'daily'),
    'male_status_cap': (G, 'headwear', 'garment.kind.fur_trimmed_cap', 'status cap with fur trim', 'daily'),
    'work_headcloth': (G, 'headwear', 'garment.kind.headcloth', 'linen work headcloth', 'work'),
    'married_under_cap': (G, 'head_under', 'garment.kind.under_cap_povoi', 'married woman under-cap (povoi)', 'daily'),
    'married_veil': (G, 'headwear', 'garment.kind.head_veil_ubrus', 'head veil (ubrus)', 'daily'),
    'headband': (G, 'headband', 'garment.kind.headband_ochelye', 'headband (ochelye)', 'daily'),
    'documented_uncertain': ('reject:type_undetermined:головной убор из описи приданого, тип не установлен (C); оставлен как пробел', '', '', 'dowry headdress of unknown type', ''),
    'maiden_headband': (G, 'headwear', 'garment.kind.maiden_band', 'maiden ribbon / soft headband', 'daily'),
    'female_winter_cap': (G, 'headwear', 'garment.kind.fur_cap', 'female fur cap over under-cap', 'daily'),
    'soft_cap': (G, 'headwear', 'garment.kind.soft_cap', 'soft textile cap (female)', 'daily'),
    'monastic_hood': (G, 'headwear', 'garment.kind.monastic_hood', 'monastic hood (kukol)', 'daily'),
    'clerical_liturgical': (G, 'headwear', 'garment.kind.liturgical_mitre', 'early mitre (liturgical)', 'liturgy'),
    'under_helmet': ('reject:weapons_armor:подшлемник — часть защитного снаряжения, не повседневная одежда', '', '', 'helmet liner', ''),
    'child_cap': (G, 'headwear', 'garment.kind.soft_cap', 'child soft cap', 'daily'),
    'child_winter_cap': (G, 'headwear', 'garment.kind.fur_cap', 'child fur cap', 'daily'),
    'porshen': (G, 'footwear', 'garment.kind.porshni', 'porshni (one-piece leather shoes)', 'daily'),
    'low_shoe': (G, 'footwear', 'garment.kind.low_shoe', 'soft low leather shoe', 'daily'),
    'fastened_low_shoe': (G, 'footwear', 'garment.kind.low_shoe', 'low shoe with side strap', 'daily'),
    'ankle_shoe': (G, 'footwear', 'garment.kind.ankle_shoe', 'ankle shoe', 'daily'),
    'decorated_shoe': (G, 'footwear', 'garment.kind.low_shoe', 'openwork decorated shoe', 'daily'),
    'polychrome_shoe': (G, 'footwear', 'garment.kind.low_shoe', 'polychrome decorated shoe', 'daily'),
    'boot': (G, 'footwear', 'garment.kind.boot', 'mid-calf leather boot', 'daily'),
    'high_hunting_boot': (G, 'footwear', 'garment.kind.boot', 'high hunting boot', 'work'),
    'female_burial_boot': (G, 'footwear', 'garment.kind.boot', 'female boot (burial find)', 'burial'),
    'child_shoe': (G, 'footwear', 'garment.kind.low_shoe', 'child soft shoe', 'daily'),
    'child_boot': (G, 'footwear', 'garment.kind.boot', 'child boot', 'daily'),
    'burial_shoe': (G, 'footwear', 'garment.kind.burial_shoe', 'burial shoe', 'burial'),
    'insole_felt': (G, 'insole', 'garment.kind.insole', 'felt insole', 'daily'),
    'insole_naalbinding': (G, 'insole', 'garment.kind.insole', 'naalbinding insole', 'daily'),
    'sock_naalbinding': (G, 'foot_layer', 'garment.kind.sock', 'naalbinding wool sock', 'daily'),
    'foot_wrap': (G, 'foot_layer', 'garment.kind.foot_wrap_onucha', 'foot wrap (onucha)', 'daily'),
    'overshoe': (G, 'over_footwear', 'garment.kind.overshoe_porshni', 'protective overshoe porshni', 'daily'),
    'ice_cleat': (G, 'footwear_attachment', 'garment.kind.ice_cleat', 'iron ice cleat', 'ice'),
    'bone_skate': ('reject:personal_items:костяной конёк — снаряжение для передвижения по льду, а не одежда', '', '', 'bone skate', ''),
    'spur': (G, 'footwear_attachment', 'garment.kind.spur', 'spur', 'riding'),
    'shoe_fastening': ('component', 'component', 'garment.component.shoe_lace', 'shoe laces/straps', 'daily'),
    'repair_component': ('reject:craft_materials:запасная подошва — сырьё/полуфабрикат ремесла', '', '', 'spare sole', ''),
    'textile_belt': (G, 'waist', 'garment.kind.woven_belt', 'woven belt', 'daily'),
    'buckle_iron': ('component', 'component', 'garment.component.belt_buckle', 'iron belt buckle', 'daily'),
    'buckle_bronze': ('component', 'component', 'garment.component.belt_buckle', 'bronze belt buckle', 'daily'),
    'belt_mounts': (G, 'waist', 'garment.kind.belt_set', 'belt with mounts', 'daily'),
    'foreign_belt_fitting': ('component', 'component', 'garment.component.belt_fitting', 'western belt fitting', 'daily'),
    'suspension_straps': ('component', 'component', 'garment.component.belt_strap', 'belt suspension straps', 'daily'),
    'sword_suspension': ('reject:weapons_armor:мечевой подвес — военное снаряжение', '', '', 'sword belt', ''),
    'mittens_wool': (G, 'handwear', 'garment.kind.mittens', 'wool mittens', 'daily'),
    'mittens_leather': (G, 'handwear', 'garment.kind.mittens', 'leather work mittens', 'work'),
    'daily_clergy_robe': (G, 'outer_garment', 'garment.kind.clergy_long_robe', 'daily long clergy robe', 'daily'),
    'monastic_tunic': (G, 'outer_garment', 'garment.kind.monastic_tunic', 'monastic tunic', 'daily'),
    'monastic_mantle': (G, 'cloak', 'garment.kind.monastic_mantle', 'monastic mantle', 'daily'),
    'liturgical_sticharion': (G, 'vestment_base', 'garment.kind.sticharion', 'sticharion', 'liturgy'),
    'liturgical_epitrachelion': (G, 'vestment_stole', 'garment.kind.epitrachelion', 'epitrachelion', 'liturgy'),
    'liturgical_phelonion': (G, 'vestment_outer', 'garment.kind.phelonion', 'phelonion', 'liturgy'),
    'liturgical_cuffs': (G, 'vestment_cuffs', 'garment.kind.epimanikia', 'liturgical cuffs', 'liturgy'),
    'liturgical_orarion': (G, 'vestment_stole', 'garment.kind.orarion', 'orarion', 'liturgy'),
    'liturgical_omophorion': (G, 'vestment_omophorion', 'garment.kind.omophorion', 'omophorion', 'liturgy'),
    'western_male_garment': (G, 'outer_garment', 'garment.kind.wool_tunic', 'western wool tunic', 'daily'),
    'western_legwear': (G, 'lower_garment', 'garment.kind.hose_chausses', 'western separate hose', 'daily'),
    'western_hood': (G, 'headwear', 'garment.kind.hood', 'western hood with shoulder cape', 'daily'),
    'western_cloak': (G, 'cloak', 'garment.kind.cloak', 'western cloak', 'daily'),
    'baltic_finnic_dress_hypothesis': (G, 'outer_garment', 'garment.kind.wrap_dress_regional', 'Baltic/Finnic regional wool dress (hypothesis)', 'hypothesis'),
    'imported_wool_garment': (G, 'outer_garment', 'garment.kind.wool_tunic', 'garment of imported western cloth', 'daily'),
    'other_rus_variant': ('reject:profile_marker:не тип вещи, а указание на региональное отличие приезжего; учтено в outfits (иноземные/иные русские профили)', '', '', 'other-Rus variant marker', ''),
    'latin_clergy': (G, 'outer_garment', 'garment.kind.clergy_long_robe', 'Latin cleric long robe', 'daily'),
    'foreign_retainer_kit': ('reject:weapons_armor:комплект снаряжения иноземного воина', '', '', 'foreign retainer kit', ''),
    'military_cloak': (G, 'cloak', 'garment.kind.cloak', 'military wool cloak', 'daily'),
    'military_gloves': (G, 'handwear', 'garment.kind.gloves', 'leather gloves/mittens (military)', 'work'),
    'winter_military_layers': ('reject:duplicate:общие зимние слои воина дублируют GM003/GM008/GM005', '', '', 'winter military layers', ''),
}
PERSONAL = ['belt_knife', 'knife_sheath', 'pouch', 'bag', 'tool_case', 'small_container', 'sewing_kit',
            'worn_tool_awl', 'worn_tool_metalwork', 'fisher_tools', 'fishing_gear', 'fire_kit',
            'travel_water_container', 'key', 'merchant_tools', 'comb']
for s in PERSONAL:
    SUB[s] = ('reject:personal_items:переносимая личная вещь/инструмент, не одежда (домен personal_items / carried_inventories)', '', '', s, '')
ADORN_SUBS = ['cloak_fastener', 'foreign_brooch', 'religious_pendant', 'religious_reliquary', 'pendant_lunula',
              'bead_necklace', 'ear_temple_rings', 'spiral_hair_ornament', 'bracelet', 'finger_ring',
              'elite_temporal_pendant', 'elite_head_chains', 'elite_pendant_unique', 'foreign_chain_pins',
              'amulet', 'neck_ring', 'regional_bracelet', 'scandinavian_brooch']
for s in ADORN_SUBS:
    SUB[s] = ('adornment', '', '', s, 'daily')

# WK production-v1 (approved) refs attached to costume items by identity
WK = {
    'GM001': 'wk:material_culture:tunic-shirt|claim:clothing-linen-shirt|claim:clothing-tunic-shirt-folded-panel|claim:clothing-shirt-principal-garment',
    'GM002': 'wk:material_culture:tunic-shirt|claim:clothing-hemp|claim:clothing-linen-shirt',
    'GF001': 'wk:material_culture:tunic-shirt|claim:clothing-linen-shirt',
    'GF002': 'wk:material_culture:tunic-shirt|claim:clothing-hemp',
    'GC001': 'wk:material_culture:tunic-shirt|claim:clothing-linen-shirt',
    'GM003': 'claim:clothing-wool-shirt|claim:clothing-wool',
    'GM004': 'wk:material_culture:porty-trousers|claim:clothing-porty-cut',
    'GM005': 'wk:material_culture:porty-trousers|claim:clothing-porty-cut|claim:clothing-wool',
    'GC003': 'wk:material_culture:porty-trousers',
    'GM006': 'wk:material_culture:onuchi|claim:clothing-onuchi-wrap',
    'FW016': 'wk:material_culture:onuchi|claim:clothing-onuchi-wrap',
    'GM007': 'wk:material_culture:svita|claim:clothing-svita-outer-garment',
    'GM008': 'wk:material_culture:kozhukh|claim:clothing-sheepskin-kozhukh',
    'GF008': 'wk:material_culture:kozhukh|claim:clothing-sheepskin-kozhukh',
    'GC005': 'claim:clothing-sheepskin-kozhukh',
    'GM016': 'claim:clothing-rank-material-not-cut',
    'GF005': 'claim:clothing-rank-material-not-cut',
    'HW002': 'wk:material_culture:pointed-cap|claim:clothing-pointed-cap-xii-depiction',
    'HW006': 'wk:material_culture:povoi-headcover|claim:clothing-povoi-headcover',
    'HW007': 'wk:material_culture:povoi-headcover|claim:clothing-povoi-headcover',
    'AC001': 'wk:material_culture:belt|claim:clothing-male-shirt-belt|claim:population-leather-straps',
    'AC002': 'wk:material_culture:belt|claim:clothing-male-shirt-belt',
    'AC005': 'wk:material_culture:belt-fitting|claim:household-belt-fitting',
    'FW001': 'wk:material_culture:footwear|claim:population-leather-shoes',
    'FW002': 'wk:material_culture:footwear|claim:population-leather-shoes|claim:ordinary-life-shoes-protect-feet',
    'FW003': 'claim:population-leather-shoes', 'FW004': 'claim:population-leather-shoes',
    'FW005': 'claim:population-leather-shoes', 'FW007': 'claim:population-leather-shoes',
    'FW008': 'claim:population-leather-shoes', 'FW010': 'claim:population-leather-shoes',
    'FW013': 'claim:population-felt-lining', 'FW014': 'wk:material_culture:wool-footwear-lining|claim:population-wool-lining',
    'FW015': 'wk:material_culture:wool-footwear-lining|claim:population-wool-lining',
    'FW017': 'wk:material_culture:porshen-overshoe|claim:household-overshoe',
    'FW018': 'claim:settlement-ice-grip-footwear', 'FW020': 'claim:household-spur',
}

# existing v17 runtime item templates (m2c-npc runtime-bindings.json)
EXISTING_TPL = {
    'GM001': 'item_tpl_nov_linen_shirt_v1', 'GF001': 'item_tpl_nov_linen_shirt_v1',
    'GM004': 'item_tpl_nov_trousers_v1', 'FW002': 'item_tpl_nov_low_leather_shoes_v1',
    'GM007': 'item_tpl_nov_wool_outer_garment_v1',
}

# ------------------------------------------------ parsing rules (stated)
SEASON_RULES = [  # (regex, seasons) — union of all hits; no hit => all seasons, basis context_only
    (r'круглый год', SEASONS),
    (r'лет', ['summer']),
    (r'весн|весен', ['spring', 'spring_rasputitsa']),
    (r'осен', ['autumn']),
    (r'зим', ['winter']),
    (r'межсезон', ['spring', 'spring_rasputitsa', 'autumn']),
    (r'холод', ['autumn', 'winter']),
    (r'распутиц|грязь', ['spring_rasputitsa', 'autumn']),
    (r'дожд|ветер', ['spring', 'spring_rasputitsa', 'autumn']),
    (r'тёпл|сух', ['spring', 'summer', 'autumn']),
]


def parse_seasons(text):
    t = (text or '').lower()
    got, hits = set(), []
    for rx, ss in SEASON_RULES:
        if re.search(rx, t):
            got.update(ss); hits.append(rx)
    if not got:
        return SEASONS[:], 'context_only(all)'
    return [s for s in SEASONS if s in got], 'text:' + ';'.join(hits)


STATUS_RULES = [  # ordered; first 'range' rule wins, else union of keyword hits
    (r'от небогат\w* до знати', BANDS),
    (r'от среднего слоя до знати', ['middle', 'high', 'elite']),
    (r'верхний слой общества', ['high', 'elite']),
    (r'все слои|широк|все группы|разн|все в разн', BANDS),
    (r'от прост\w* .*до|от доступн\w* .*до|от бронзов\w* до', BANDS),
    (r'средний слой и выше', ['middle', 'high', 'elite']),
    (r'средний и богатый|средний/богатый|средний/высокий|средний или обеспеченный', ['middle', 'high']),
    (r'монастыр', BANDS),
]
STATUS_KW = [
    (r'бедн|нижн', ['low']), (r'рабоч|подёнщ', ['low', 'middle']), (r'небогат', ['low', 'middle']),
    (r'средн', ['middle']), (r'богат|зажиточ|обеспеч', ['high']), (r'торгов', ['middle', 'high']),
    (r'элит|знат|высш|исключительн', ['elite']), (r'духовенств|церковн', BANDS),
]


def parse_status(text):
    t = (text or '').lower()
    for rx, bands in STATUS_RULES:
        if re.search(rx, t):
            return bands[:], 'range:' + rx
    got = set(); hits = []
    for rx, bands in STATUS_KW:
        if re.search(rx, t):
            got.update(bands); hits.append(rx)
    if not got:
        return BANDS[:], 'unspecified(all)'
    return [b for b in BANDS if b in got], 'kw:' + ';'.join(hits)


MATERIAL_RULES = [  # regex -> palette id (costume materials_palette.csv) or local code
    (r'лён|льнян', 'MAT001'), (r'конопл', 'MAT002'), (r'импортн\w* сукн|тонк\w* шерст', 'MAT004'),
    (r'шерст', 'MAT003'), (r'войлок', 'MAT005'), (r'кож', 'MAT006'), (r'овчин', 'MAT007'),
    (r'качественн\w* мех|ценн\w* мех|дорог\w* мех', 'MAT008'), (r'мех', 'fur_ordinary'),
    (r'шёлк|шелк', 'MAT009'), (r'золотн|золото-тк', 'MAT010'), (r'желез|сталь', 'MAT011'),
    (r'бронз|медн', 'MAT012'), (r'серебр', 'MAT013'), (r'золот|эмал', 'MAT014'),
    (r'кост|\bрог\b|дерев', 'MAT015'), (r'стекл', 'glass'), (r'янтар', 'amber'), (r'камен|камн', 'stone'),
    (r'олов', 'tin_alloy'), (r'береста|луб', 'birch_bark_bast'),
]


def parse_materials(text):
    t = (text or '').lower()
    out = []
    for rx, mid in MATERIAL_RULES:
        if re.search(rx, t) and mid not in out:
            out.append(mid)
    return out


COLOR_RULES = [
    (r'небелён', 'COL001'), (r'белён|молочн|бел|слоновая', 'COL002'),
    (r'сер|бур|коричн|натуральн|кремов', 'COL003'), (r'красн|маренов|кирпич', 'COL004'),
    (r'син', 'COL005'), (r'зелён', 'COL006'), (r'охр|жёлт|золотист', 'COL007'), (r'тёмн|чёрн', 'COL008'),
]
DYE_REFS = {  # colour -> dye evidence (WK approved claims / costume sources)
    'COL001': 'undyed', 'COL002': 'undyed(bleached)', 'COL003': 'undyed(natural wool)',
    'COL004': 'claim:textile-lac-dye-analysis|costume:SRC015|costume:SRC016',
    'COL005': 'claim:textile-indigo-yellow-analysis|costume:SRC007',
    'COL006': 'claim:textile-indigo-yellow-analysis|costume:SRC007',
    'COL007': 'claim:textile-chrysin-analysis|costume:SRC007',
    'COL008': 'claim:textile-ellagic-acid-analysis|costume:SRC007|costume:SRC043',
}


def parse_colors(text):
    t = (text or '').lower()
    return [cid for rx, cid in COLOR_RULES if re.search(rx, t)]


VISUAL_FABRIC = {'MAT001': 'light_linen', 'MAT002': 'light_linen', 'MAT003': 'wool', 'MAT004': 'wool',
                 'MAT005': 'felt', 'MAT006': 'leather', 'MAT007': 'sheepskin', 'MAT008': 'fur',
                 'fur_ordinary': 'fur', 'MAT009': 'silk'}
VISUAL_COLOR = {'COL001': 'undyed_linen', 'COL002': 'bleached_linen', 'COL003': 'brown', 'COL004': 'red_brown',
                'COL005': 'muted_blue', 'COL006': 'muted_green', 'COL007': 'ochre', 'COL008': 'dark'}
EXISTING_VISUAL = {'light_linen', 'wool', 'undyed_linen', 'brown'}  # values present in v17 garment.* categories

WEAR = [  # wear_state vocabulary; runtime already uses condition_state=serviceable
    ('new', 'новое', 'textile|leather|fur|felt|metal|hard', 'costume:CMB001 (износ по достатку); risovalka §5 «Состояние вещей»'),
    ('serviceable', 'исправное, ношеное', 'textile|leather|fur|felt|metal|hard', 'v17 m2c-npc runtime-bindings condition_state=serviceable'),
    ('worn', 'поношенное, потёртое', 'textile|leather|fur|felt|metal|hard', 'risovalka §5 «обувь потёртая; низ свиты истёрт»'),
    ('patched', 'латаное, чиненное', 'textile|leather|fur|felt', 'costume:CMB001 «заплаты допустимы»; risovalka §1 Б «одежда чиненная»; claim:ordinary-life-shoes-protect-feet (ремонт обуви)'),
    ('dirty', 'грязное', 'textile|leather|fur|felt|metal|hard', 'claim:reconstructed-dwelling-moisture-and-routine-can-leave-changeable-traces; costume:FW017 (грязь межсезонья)'),
    ('torn', 'рваное', 'textile|leather|fur|felt', 'costume:ANTI009/CMB001 (износ по достатку, «не театральные лохмотья»); sqlite:social_groups «нищие, беженцы, голодающие» (A)'),
    ('wet', 'мокрое', 'textile|leather|fur|felt', 'claim:ordinary-life-shoes-protect-feet (сушка обуви после сырости)'),
    ('rusted', 'ржавое', 'metal', 'физическое свойство железа; C'),
    ('broken', 'сломанное', 'metal|hard', 'C'),
]


def material_class(mats):
    if not mats:
        return 'textile'
    m = mats[0]
    if m in ('MAT011',):
        return 'metal'
    if m in ('MAT012', 'MAT013', 'MAT014', 'MAT015', 'glass', 'amber', 'stone', 'tin_alloy'):
        return 'hard'
    if m in ('MAT006',):
        return 'leather'
    if m in ('MAT007', 'MAT008', 'fur_ordinary'):
        return 'fur'
    if m == 'MAT005':
        return 'felt'
    return 'textile'


def wear_states(mclass):
    return [w[0] for w in WEAR if mclass in w[2].split('|')]


MARK_SLOTS = {  # rule: visible surfaces where trim, embroidery, stamping or owner marks can sit
    'base_garment': 'collar|cuffs|hem', 'outer_garment': 'collar|front_edge|cuffs|hem',
    'lower_garment': 'waistband', 'cloak': 'edge|fastening_point', 'over_garment_winter': 'collar|front_edge|hem',
    'headwear': 'band|crown', 'head_under': 'edge', 'headband': 'front', 'footwear': 'vamp|upper|top_edge',
    'waist': 'buckle|mounts|strap_end', 'apron': 'hem', 'handwear': 'cuff', 'waist_garment': 'hem|panels',
    'vestment_base': 'edge|cuffs', 'vestment_stole': 'edge|ends', 'vestment_outer': 'edge|shoulder',
    'vestment_cuffs': 'face', 'vestment_omophorion': 'edge|crosses',
}

MARITAL = {'HW006': 'married', 'HW007': 'married', 'HW011': 'married', 'HW010': 'unmarried'}


def sexes(scope):
    return {'male': ['male'], 'female': ['female']}.get(scope, ['male', 'female'])


def prov_refs(prov):
    refs = ['costume:' + c for c in dict.fromkeys(re.findall(r'CMB\d{3}', prov))]
    if 'risovalka' in prov:
        refs.append('risovalka')
    if 'sqlite' in prov:
        refs += ['sqlite:material_culture' if 'korzno' in prov else 'sqlite:social_groups', 'sqlite:S01' if 'S01' in prov else '']
    if 'WK' in prov or 'R3' in prov:
        refs.append('claim:clothing-shirt-principal-garment')
    return '|'.join(r for r in refs if r)


def gm_id(src_id):
    return 'gm_' + src_id.lower()


# ------------------------------------------------ new (non-costume) garments
NEW_GARMENTS = [
    dict(gm_id='gm_new_votola', name_ru='Вотола — безрукавный плащ поверх свиты', name_en='votola (sleeveless cloak)',
         garment_category='garment.kind.votola', equipment_slot='cloak', usage_context='daily',
         material='грубая шерсть', material_ids='MAT003', dye_color='серый|бурый', color_ids='COL003',
         sex='male|female', age='|'.join(ADULT_AGES), marital_status='any', status_band='low|middle',
         status_basis='C: вотола как дешёвая грубая накидка — вывод из описания материала; уточнить',
         season='spring|spring_rasputitsa|autumn|winter', season_basis='rule:cloak over svita (cool seasons)',
         decoration='нет', source_refs='wk:material_culture:votola|claim:clothing-votola-cloak|source:clothing-rabinovich-1986',
         confidence='B', notes='Капюшон источником назван лишь возможным и не утверждается (WK).'),
    dict(gm_id='gm_new_korzno', name_ru='Корзно — плащ, застёгнутый на плече', name_en='korzno (shoulder-fastened cloak)',
         garment_category='garment.kind.korzno', equipment_slot='cloak', usage_context='daily',
         material='окрашенная шерсть; дорогая ткань у элиты; фибула или завязки', material_ids='MAT003|MAT004',
         dye_color='красный|синий|тёмный', color_ids='COL004|COL005|COL008', sex='male',
         age='|'.join(ADULT_AGES), marital_status='any', status_band='high|elite',
         status_basis='sqlite:material_culture «элита, путники, дружина»; иконография',
         season='spring|spring_rasputitsa|autumn|winter|summer', season_basis='rule:cloak all seasons (прохладная погода)',
         decoration='окрашенная ткань, кайма; застёжка на правом плече',
         source_refs='sqlite:material_culture#плащ(корзно/накидка)|sqlite:S16|costume:SRC025|costume:SRC048',
         confidence='B', notes='Отличать от мятеля (gm_gm010) статусом и иконографическим контекстом.'),
    dict(gm_id='gm_new_lapti', name_ru='Лапти (лыковая плетёная обувь) — датировка спорна', name_en='bast shoes (lapti) — disputed dating',
         garment_category='garment.kind.bast_shoes', equipment_slot='footwear', usage_context='disputed',
         material='лыко', material_ids='birch_bark_bast', dye_color='натуральный', color_ids='COL003',
         sex='male|female', age='|'.join(ADULT_AGES), marital_status='any', status_band='low',
         status_basis='C', season='summer|autumn', season_basis='C',
         decoration='нет',
         source_refs='web:WEB01|costume:ANTI005|sqlite:material_culture#обувь|costume:SRC001',
         confidence='C',
         notes='А. В. Курбатов: в городском слое Новгорода плетёная обувь не ранее рубежа XV–XVI вв.; Д. О. Осипов (2007) '
               'сомневается и допускает недоучёт в публикациях. Для города 1230 не использовать (ANTI005); '
               'для деревни — только как спорная гипотеза, в комплекты не включена.'),
]

# ------------------------------------------------ outfit kits
# slot -> costume id; provenance per class/sex/season group in PROV.
# R-rules (stated in README):
#  R1 season filter: cool-season kit = warm kit + items whose season_scope covers spring/autumn;
#  R2 winter kit taken from the winter combo of the same status band (CMB002/008/011/030/035);
#  R3 base shirt added where a combo lists only outer layers (shirt is principal garment, WK claim);
#  R4 trousers added for men where a combo omits them (GM004 warm/cool, GM005 winter);
#  R5 belt added where a combo omits it (belt present in 38 of 46 combos);
#  R6 clergy/monastic winter layer = poor/common winter layer GM008 + HW003 (C, no clergy winter combo);
#  R7 carried items (knife, pouch, tools, ice cleats, weapons) excluded: they are personal_items/equipment;
#  R8 female headwear/head_under depend on marital status, which the runtime cannot select yet.
KITS = {
 'poor': {
   'male': {
     'warm': dict(base_garment='GM002', lower_garment='GM004', waist='AC002', footwear='FW001'),
     'cool': dict(base_garment='GM002', lower_garment='GM004', outer_garment='GM003', leg_wrap='GM006',
                  headwear='HW002', waist='AC002', footwear='FW001', foot_layer='FW016'),
     'cold': dict(base_garment='GM002', lower_garment='GM005', outer_garment='GM003', over_garment_winter='GM008',
                  headwear='HW003', leg_wrap='GM006', waist='AC002', footwear='FW001', insole='FW013'),
   },
   'female': {
     'warm': dict(base_garment='GF002', outer_garment='GF004', waist='AC002', footwear='FW002'),
     'cool': dict(base_garment='GF002', outer_garment='GF004', cloak='GF014', waist='AC002', footwear='FW002', foot_layer='FW016'),
     'cold': dict(base_garment='GF002', outer_garment='GF004', over_garment_winter='GF008', waist='AC002',
                  footwear='FW001', foot_layer='FW015', insole='FW013'),
   },
   'prov': 'CMB001,CMB004,CMB002 (male); CMB024,CMB045,CMB030 (female); risovalka §5 urban_poor (HW002 H01); R1,R2,R5',
 },
 'rural': {
   'male': {
     'warm': dict(base_garment='GM002', lower_garment='GM004', waist='AC002', footwear='FW001'),
     'cool': dict(base_garment='GM002', lower_garment='GM004', outer_garment='GM003', leg_wrap='GM006',
                  headwear='HW001', waist='AC002', footwear='FW001', foot_layer='FW016'),
     'cold': dict(base_garment='GM002', lower_garment='GM005', outer_garment='GM003', over_garment_winter='GM008',
                  headwear='HW003', leg_wrap='GM006', waist='AC002', footwear='FW001', insole='FW013'),
   },
   'female': {
     'warm': dict(base_garment='GF002', outer_garment='GF004', waist='AC002', footwear='FW001'),
     'cool': dict(base_garment='GF002', outer_garment='GF004', waist='AC002', footwear='FW001', foot_layer='FW016'),
     'cold': dict(base_garment='GF002', outer_garment='GF004', over_garment_winter='GF008', waist='AC002',
                  footwear='FW001', foot_layer='FW015', insole='FW013'),
   },
   'prov': 'CMB007,CMB008 (male); CMB045,CMB030 (female); R1,R2,R5',
 },
 'water': {
   'male': {
     'warm': dict(base_garment='GM002', lower_garment='GM004', waist='AC001', footwear='FW002'),
     'cool': dict(base_garment='GM002', lower_garment='GM004', outer_garment='GM003', headwear='HW002',
                  waist='AC001', footwear='FW002', foot_layer='FW016'),
     'cold': dict(base_garment='GM002', lower_garment='GM005', outer_garment='GM003', over_garment_winter='GM008',
                  headwear='HW003', waist='AC001', footwear='FW001', foot_layer='FW015'),
   },
   'female': 'poor',
   'prov': 'CMB005,CMB006 (male; FW018 ice cleat excluded R7; base shirt R3; belt R5); risovalka §7; female=poor kit',
 },
 'forest': {
   'male': {
     'warm': dict(base_garment='GM002', lower_garment='GM004', waist='AC001', footwear='FW004'),
     'cool': dict(base_garment='GM002', lower_garment='GM004', outer_garment='GM003', cloak='GM012', headwear='GM013',
                  waist='AC001', footwear='FW008', foot_layer='FW016'),
     'cold': dict(base_garment='GM002', lower_garment='GM005', outer_garment='GM003', over_garment_winter='GM008',
                  cloak='GM012', headwear='HW003', waist='AC001', footwear='FW008', foot_layer='FW015'),
   },
   'female': 'rural',
   'prov': 'CMB009 (hunter; weapons excluded R7; base shirt R3); cold layer CMB009 optional GM008; female=rural kit',
 },
 'urban_middle': {
   'male': {
     'warm': dict(base_garment='GM001', lower_garment='GM004', waist='AC001', footwear='FW002'),
     'cool': dict(base_garment='GM001', lower_garment='GM004', outer_garment='GM003', headwear='HW001',
                  waist='AC001', footwear='FW002', foot_layer='FW016'),
     'cold': dict(base_garment='GM001', lower_garment='GM005', outer_garment='GM003', over_garment_winter='GM008',
                  headwear='HW003', waist='AC001', footwear='FW007', insole='FW013'),
   },
   'female': {
     'warm': dict(base_garment='GF002', outer_garment='GF004', waist='AC001', footwear='FW002'),
     'cool': dict(base_garment='GF002', outer_garment='GF004', cloak='GF006', waist='AC001', footwear='FW002', foot_layer='FW016'),
     'cold': dict(base_garment='GF001', outer_garment='GF003', over_garment_winter='GF008', waist='AC001',
                  footwear='FW007', foot_layer='FW015', insole='FW013'),
   },
   'prov': 'CMB003,CMB016 base (male; GM003 dropped in summer R1); CMB029,CMB030 (female); winter R2',
 },
 'merchant': {
   'male': {
     'warm': dict(base_garment='GM001', lower_garment='GM004', outer_garment='GM016', headwear='HW001',
                  waist='AC001', footwear='FW003'),
     'cool': dict(base_garment='GM001', lower_garment='GM004', outer_garment='GM016', cloak='GM010', headwear='HW001',
                  waist='AC001', footwear='FW007', foot_layer='FW016'),
     'cold': dict(base_garment='GM001', lower_garment='GM005', outer_garment='GM016', over_garment_winter='GM009',
                  cloak='GM012', headwear='HW004', waist='AC001', footwear='FW007', foot_layer='FW015'),
   },
   'female': {
     'warm': dict(base_garment='GF001', outer_garment='GF003', waist='AC001', footwear='FW003'),
     'cool': dict(base_garment='GF001', outer_garment='GF003', cloak='GF006', waist='AC001', footwear='FW002', foot_layer='FW016'),
     'cold': dict(base_garment='GF001', outer_garment='GF003', over_garment_winter='GF008', waist='AC001',
                  footwear='FW007', foot_layer='FW015', insole='FW013'),
   },
   'prov': 'CMB010,CMB011 (male; trousers R4; AC004 buckle = component of belt); CMB025,CMB046,CMB030 (female)',
 },
 'wealthy': {
   'male': {
     'warm': dict(base_garment='GM001', lower_garment='GM004', outer_garment='GM016', waist='AC005', footwear='FW005'),
     'cool': dict(base_garment='GM001', lower_garment='GM004', outer_garment='GM016', cloak='GM010', headwear='HW001',
                  waist='AC005', footwear='FW007', foot_layer='FW016'),
     'cold': dict(base_garment='GM001', lower_garment='GM005', outer_garment='GM016', over_garment_winter='GM009',
                  cloak='GM010', headwear='HW004', waist='AC005', footwear='FW007', foot_layer='FW015'),
   },
   'female': {
     'warm': dict(base_garment='GF001', outer_garment='GF005', waist='AC005', footwear='FW005'),
     'cool': dict(base_garment='GF001', outer_garment='GF005', cloak='GF006', waist='AC005', footwear='FW007', foot_layer='FW016'),
     'cold': dict(base_garment='GF001', outer_garment='GF005', over_garment_winter='GF007', waist='AC005',
                  footwear='FW007', foot_layer='FW015', insole='FW013'),
   },
   'prov': 'CMB012 (male; trousers R4); CMB026 (female); winter R2 with status shuba GM009/GF007',
 },
 'elite': {
   'male': {
     'warm': dict(base_garment='GM001', lower_garment='GM004', outer_garment='GM016', cloak='GM010', waist='AC005', footwear='FW006'),
     'cool': dict(base_garment='GM001', lower_garment='GM004', outer_garment='GM016', cloak='gm_new_korzno', headwear='HW001',
                  waist='AC005', footwear='FW007', foot_layer='FW016'),
     'cold': dict(base_garment='GM001', lower_garment='GM005', outer_garment='GM016', over_garment_winter='GM009',
                  cloak='gm_new_korzno', headwear='HW004', waist='AC005', footwear='FW007', foot_layer='FW015'),
   },
   'female': {
     'warm': dict(base_garment='GF001', outer_garment='GF005', waist='AC005', footwear='FW005'),
     'cool': dict(base_garment='GF001', outer_garment='GF005', cloak='GF006', waist='AC005', footwear='FW007', foot_layer='FW016'),
     'cold': dict(base_garment='GF001', outer_garment='GF005', over_garment_winter='GF007', cloak='GF006', waist='AC005',
                  footwear='FW007', foot_layer='FW015', insole='FW013'),
   },
   'prov': 'CMB013 (male; GM017 trim as decoration of GM016; korzno from sqlite material_culture B); CMB027 (female; FW009 burial boot replaced by FW005, GF010 trim as decoration)',
 },
 'warrior': {
   'male': {
     'warm': dict(base_garment='GM001', lower_garment='GM004', waist='AC001', footwear='FW002'),
     'cool': dict(base_garment='GM001', lower_garment='GM004', outer_garment='GM003', cloak='GM010', headwear='HW001',
                  waist='AC001', footwear='FW007', foot_layer='FW016'),
     'cold': dict(base_garment='GM001', lower_garment='GM005', outer_garment='GM003', over_garment_winter='GM008',
                  cloak='AR036', headwear='HW003', waist='AC001', footwear='FW007', foot_layer='FW015'),
   },
   'female': None,
   'prov': 'CMB014 off-duty (sword belt/knife/armour excluded R7; FW007 not summer → FW002 in warm); CMB019 winter (AR036 cloak, FW015)',
 },
 'priest': {
   'male': {
     'warm': dict(base_garment='GM001', lower_garment='GM004', outer_garment='CL001', waist='AC001', footwear='FW002'),
     'cool': dict(base_garment='GM001', lower_garment='GM004', outer_garment='CL001', cloak='GM010', headwear='HW001',
                  waist='AC001', footwear='FW002', foot_layer='FW016'),
     'cold': dict(base_garment='GM001', lower_garment='GM005', outer_garment='CL001', over_garment_winter='GM008',
                  headwear='HW003', waist='AC001', footwear='FW007', insole='FW013'),
   },
   'female': None,
   'prov': 'CMB020 (C; cross AC017 → adornment); risovalka §13 ponomar; R3,R4; winter R6',
 },
 'monastic': {
   'male': {
     'warm': dict(base_garment='GM001', lower_garment='GM004', outer_garment='CL002', headwear='HW013',
                  waist='AC002', footwear='FW002'),
     'cool': dict(base_garment='GM001', lower_garment='GM004', outer_garment='CL002', headwear='HW013',
                  waist='AC002', footwear='FW004', foot_layer='FW016'),
     'cold': dict(base_garment='GM001', lower_garment='GM005', outer_garment='CL002', over_garment_winter='GM008', cloak='CL003',
                  headwear='HW013', waist='AC002', footwear='FW007', foot_layer='FW015'),
   },
   'female': {
     'warm': dict(base_garment='GF001', outer_garment='CL002', headwear='HW013', waist='AC002', footwear='FW002'),
     'cool': dict(base_garment='GF001', outer_garment='CL002', headwear='HW013', waist='AC002', footwear='FW004', foot_layer='FW016'),
     'cold': dict(base_garment='GF001', outer_garment='CL002', over_garment_winter='GF008', cloak='CL003', headwear='HW013',
                  waist='AC002', footwear='FW007', foot_layer='FW015'),
   },
   'prov': 'CMB023 monk/nun (C; CL003 mantle only in cold: its season_scope); R3,R4; winter R6',
 },
 'destitute': {'male': 'poor', 'female': 'poor', 'condition': 'patched',
   'prov': 'poor kit with default condition patched/torn: sqlite social_groups «нищие, беженцы, голодающие» (A, S01 НПЛ 1230); risovalka §1 Б'},
 'traveler': {
   'male': {
     'warm': dict(base_garment='GM001', lower_garment='GM004', outer_garment='GM003', cloak='GM012', waist='AC001', footwear='FW004'),
     'cool': dict(base_garment='GM001', lower_garment='GM004', outer_garment='GM003', cloak='GM012', headwear='HW001',
                  waist='AC001', footwear='FW004', foot_layer='FW016'),
     'cold': dict(base_garment='GM001', lower_garment='GM005', outer_garment='GM003', over_garment_winter='GM008', cloak='GM012',
                  headwear='HW003', waist='AC001', footwear='FW007', foot_layer='FW015', insole='FW013'),
   },
   'female': {
     'warm': dict(base_garment='GF002', outer_garment='GF004', waist='AC002', footwear='FW002'),
     'cool': dict(base_garment='GF002', outer_garment='GF004', cloak='GF014', waist='AC002', footwear='FW002', foot_layer='FW016'),
     'cold': dict(base_garment='GF002', outer_garment='GF004', over_garment_winter='GF008', cloak='GF014', waist='AC002',
                  footwear='FW007', foot_layer='FW015', insole='FW013'),
   },
   'prov': 'CMB034 summer travel (GM003 listed although its season_scope excludes summer — combo followed, exception logged), CMB035 winter travel; R4,R5',
 },
 'foreign_west': {
   'male': {
     'warm': dict(base_garment='GM001', lower_garment='FR002', outer_garment='FR001', waist='AC001', footwear='FW003'),
     'cool': dict(base_garment='GM001', lower_garment='FR002', outer_garment='FR001', cloak='FR004', headwear='FR003',
                  waist='AC001', footwear='FW007', foot_layer='FW016'),
     'cold': dict(base_garment='GM001', lower_garment='FR002', outer_garment='FR001', over_garment_winter='GM008', cloak='FR004',
                  headwear='FR003', waist='AC001', footwear='FW007', foot_layer='FW015'),
   },
   'female': None,
   'prov': 'CMB036,CMB037 (FR008 brooch → adornment; AC006 = belt component); cool/cold: local boots FW007 and kozhukh per FG001/FG002 local_adaptation (C); base shirt R3 (C)',
 },
}

CHILD_KITS = {  # not runtime-selectable: age 'child' is outside ACTOR_BASE_APPEARANCE_VOCABULARY.age_category
 'male': {
   'warm': dict(base_garment='GC001', lower_garment='GC003', waist='GC006', footwear='FW010'),
   'cool': dict(base_garment='GC001', lower_garment='GC003', outer_garment='GC002', headwear='HW016', waist='GC006', footwear='FW010'),
   'cold': dict(base_garment='GC001', lower_garment='GC003', outer_garment='GC002', over_garment_winter='GC005', headwear='HW017',
                handwear='GC007', waist='GC006', footwear='FW011', insole='FW013'),
 },
 'female': {
   'warm': dict(base_garment='GC001', waist='GC006', footwear='FW010'),
   'cool': dict(base_garment='GC001', outer_garment='GC002', headwear='HW016', waist='GC006', footwear='FW010'),
   'cold': dict(base_garment='GC001', outer_garment='GC002', over_garment_winter='GC005', headwear='HW017',
                handwear='GC007', waist='GC006', footwear='FW011', insole='FW013'),
 },
 'prov': 'CMB031 boy, CMB032 girl, CMB033 child winter',
}

FEMALE_HEAD = {  # R8: marital headwear per season group
 'married': {'warm': dict(head_under='HW006', headwear='HW007'), 'cool': dict(head_under='HW006', headwear='HW007'),
             'cold': dict(head_under='HW006', headwear='HW011')},
 'unmarried': {'warm': dict(headwear='HW010'), 'cool': dict(headwear='HW010'), 'cold': dict(headwear='HW010')},
 'monastic': {'warm': {}, 'cool': {}, 'cold': {}},
}
SEASON_GROUPS = {'warm': ['summer'], 'cool': ['spring', 'spring_rasputitsa', 'autumn'], 'cold': ['winter']}

CLASS_META = {  # class -> (name_ru, status band, costume refs, confidence)
 'poor': ('бедный горожанин / подёнщик / зависимый', 'low', 'B'),
 'rural': ('сельский житель', 'low', 'B'),
 'water': ('рыбак, лодочник, перевозчик', 'low', 'B'),
 'forest': ('охотник, лесной промысловик, проводник', 'low', 'B'),
 'urban_middle': ('ремесленник / рядовой горожанин среднего достатка', 'middle', 'B'),
 'merchant': ('купец, торговец, приказчик', 'middle|high', 'B'),
 'wealthy': ('зажиточный горожанин / служилый человек', 'high', 'B'),
 'elite': ('боярин, князь, высшая власть', 'elite', 'B'),
 'warrior': ('дружинник/страж вне боя', 'middle|high', 'B'),
 'priest': ('белое духовенство и причт', 'middle', 'C'),
 'monastic': ('монашество (включая владыку и игумена в быту)', 'middle', 'C'),
 'destitute': ('нищие, беглые, пленники, голодающие', 'low', 'B'),
 'traveler': ('путник, богомолец, возчик', 'low|middle', 'B'),
 'foreign_west': ('западный (готландский/немецкий) гость', 'middle|high', 'B'),
}

ROLE_CLASS = {
 'nov_role_prince': 'elite', 'nov_role_posadnik': 'elite', 'nov_role_tysyatsky': 'elite', 'nov_role_boyar': 'elite',
 'nov_role_boyar_house_mistress': 'elite',
 'nov_role_sotsky': 'wealthy', 'nov_role_city_elder': 'wealthy', 'nov_role_toll_collector': 'wealthy',
 'nov_role_princely_man': 'wealthy', 'nov_role_bishop_man': 'wealthy',
 'nov_role_princely_druzhinnik': 'warrior', 'nov_role_junior_druzhinnik': 'warrior', 'nov_role_druzhina_companion': 'warrior',
 'nov_role_merchant_guest': 'merchant', 'nov_role_local_merchant': 'merchant', 'nov_role_merchant_clerk': 'merchant',
 'nov_role_foreign_guest': 'foreign_west',
 'nov_role_trader': 'urban_middle', 'nov_role_craftsman_master': 'urban_middle', 'nov_role_journeyman': 'urban_middle',
 'nov_role_apprentice': 'urban_middle', 'nov_role_householder': 'urban_middle', 'nov_role_household_mistress': 'urban_middle',
 'nov_role_guard': 'urban_middle', 'nov_role_church_scribe': 'priest',
 'nov_role_servant': 'poor', 'nov_role_hired_worker': 'poor', 'nov_role_port_worker': 'poor', 'nov_role_boyar_man': 'poor',
 'nov_role_kholop': 'poor', 'nov_role_debtor': 'poor', 'nov_role_orphan': 'poor', 'nov_role_outsider': 'poor',
 'nov_role_no_guarantor': 'poor', 'nov_role_portage_worker': 'poor', 'nov_role_church_guard': 'poor',
 'nov_role_smerd_householder': 'rural', 'nov_role_dependent_peasant': 'rural', 'nov_role_ploughman': 'rural',
 'nov_role_pastoral_worker': 'rural', 'nov_role_senokos_worker': 'rural', 'nov_role_miller': 'rural',
 'nov_role_monastery_worker': 'rural', 'nov_role_widow_householder': 'rural', 'nov_role_youth_helper': 'rural',
 'nov_role_old_household_member': 'rural', 'nov_role_starosta': 'rural',
 'nov_role_fisher': 'water', 'nov_role_boatman': 'water', 'nov_role_ferryman': 'water', 'nov_role_helmsman': 'water',
 'nov_role_hunter': 'forest', 'nov_role_forest_promyslovik': 'forest', 'nov_role_bortnik': 'forest', 'nov_role_guide': 'forest',
 'nov_role_archbishop': 'monastic', 'nov_role_igumen': 'monastic', 'nov_role_monk': 'monastic', 'nov_role_novice': 'monastic',
 'nov_role_priest': 'priest', 'nov_role_deacon': 'priest', 'nov_role_ponomar': 'priest',
 'nov_role_pilgrim': 'traveler', 'nov_role_cart_driver': 'traveler', 'nov_role_winter_road_man': 'traveler',
 'nov_role_merchant_companion': 'traveler',
 'nov_role_beggar': 'destitute', 'nov_role_sick_disabled': 'destitute', 'nov_role_runaway': 'destitute',
 'nov_role_izgoi': 'destitute', 'nov_role_captive': 'destitute',
}
ROLE_NOTES = {
 'nov_role_boyar_man': 'зависимый боярский человек — одежда зависит от двора; взят бедный комплект (sqlite холопы/челядь «облик зависит от двора»)',
 'nov_role_kholop': 'sqlite social_groups: «материальный облик зависит от двора» (A) — базовый бедный комплект',
 'nov_role_starosta': 'сельский староста: деревенский комплект; зажиточный сельский вариант в источниках отсутствует',
 'nov_role_guard': 'CMB016: ополченец/страж — обычная одежда горожанина; оружие вне домена',
 'nov_role_church_guard': 'низкий статус, свободный — бедный комплект',
 'nov_role_church_scribe': 'риск: писец может быть мирянином; взят комплект причта (C)',
 'nov_role_archbishop': 'владыка — монашествующий; повседневный монашеский комплект, литургический — в outfits_liturgy',
 'nov_role_trader': 'мелкий торговец (low) — комплект рядового горожанина',
 'nov_role_foreign_guest': 'выбор западного варианта; балтийские/финно-угорские/иные русские — только в outfits.csv (селектора происхождения нет)',
}


def main():
    items = read_csv(COSTUME / 'catalog_items.csv')
    combos = read_csv(COSTUME / 'combinations.csv')
    anti = read_csv(COSTUME / 'anti_patterns.csv')
    palette = read_csv(COSTUME / 'materials_palette.csv')
    csrc = read_csv(COSTUME / 'sources.csv')
    roles = read_csv(REGION / 'novgorod_social_roles_v1_enriched.tsv', '\t')
    occs = read_csv(REGION / 'novgorod_occupations_v1_enriched.tsv', '\t')
    by_id = {r['item_id']: r for r in items}
    combo_seasons = {}
    for c in combos:  # rule S2 source: season named in combo title
        nm = c['name_ru'].lower()
        ss = (['summer'] if re.search(r'летом|летн', nm) else []) + (['winter'] if re.search(r'зимой|зимн', nm) else [])
        if ss:
            for iid in split(c['required_item_ids']):
                combo_seasons.setdefault(iid, []).append((c['combo_id'], ss))

    # ---------------- garments + disposition
    garments, disposition, components = [], [], []
    adorn_src = []
    for r in items:
        sub = r['subcategory']
        if sub not in SUB and r['category'] == 'armor_and_weapons':
            SUB[sub] = ('reject:weapons_armor:оружие, доспех или конское снаряжение — домен weapons_armor', '', '', sub, '')
        disp, slot, cat, name_en, ctx = SUB[sub]
        kind = disp.split(':')[0]
        rec = dict(source_item_id=r['item_id'], name_ru=r['name_ru'], subcategory=sub, disposition=kind,
                   target='', reason='')
        if kind == 'reject':
            _, dom, reason = disp.split(':', 2)
            rec.update(target=dom, reason=reason)
            disposition.append(rec); continue
        if kind == 'adornment':
            rec.update(target='adornment_appearance/adornment.csv', reason='украшение/привеска/застёжка')
            disposition.append(rec); adorn_src.append(r); continue
        seasons, sbasis = parse_seasons(r['season_scope'])
        extra = sorted({x for c, ss in combo_seasons.get(r['item_id'], []) for x in ss} - set(seasons))
        if extra:  # rule S2: item required by a season-named combo is valid in that season
            seasons = [x for x in SEASONS if x in set(seasons) | set(extra)]
            sbasis += '; combo:' + '|'.join(sorted({c for c, ss in combo_seasons[r['item_id']] if set(ss) & set(extra)}))
        bands, bbasis = parse_status(r['social_scope'] + ' ' + r['status_markers'])
        mats = parse_materials(r['materials'])
        cols = parse_colors(r['colors'])
        mclass = material_class(mats)
        age = ['child'] if r['gender_scope'] == 'child' or sub.startswith('child') else ADULT_AGES
        if r['item_id'] in ('HW016', 'HW017', 'FW010', 'FW011') or r['category'] == 'garment_children':
            age = ['child']
        sx = sexes(r['gender_scope'])
        marital = MARITAL.get(r['item_id'], 'any')
        conf = r['historical_confidence']
        runtime_ok = ctx in ('daily', 'work', 'travel') and kind == 'garment' and conf in ('A', 'B', 'C')
        refs = ['costume:' + r['item_id']] + ['costume:' + s for s in split(r['source_ids'])]
        if r['item_id'] in WK:
            refs += WK[r['item_id']].split('|')
        if r['item_id'] == 'GF013':
            refs.append('web:WEB05')
        vfab = [VISUAL_FABRIC[m] for m in mats if m in VISUAL_FABRIC][:1]
        vcol = [VISUAL_COLOR[c] for c in cols][:1]
        vnew = [v for v in vfab + vcol if v not in EXISTING_VISUAL]
        row = dict(
            gm_id=gm_id(r['item_id']), source_item_id=r['item_id'], name_ru=r['name_ru'],
            alt_names_ru=r['alt_names_ru'], name_en=name_en, garment_category=cat, region_id=REGION_ID,
            universal_category_layer='universal', equipment_slot=slot, usage_context=ctx,
            material=r['materials'], material_ids='|'.join(mats), material_class=mclass,
            dye_color=r['colors'], color_ids='|'.join(cols),
            dye_evidence_refs='|'.join(sorted({x for c in cols for x in DYE_REFS[c].split('|')})),
            decoration=r['status_markers'] or 'нет/минимальная (ANTI003)',
            sex='|'.join(sx), age='|'.join(age), marital_status=marital,
            status_band='|'.join(bands), status_basis=bbasis, season='|'.join(seasons), season_basis=sbasis,
            wear_states='|'.join(wear_states(mclass)), mark_slots=MARK_SLOTS.get(slot, 'none'),
            runtime_daily_eligible='true' if runtime_ok and kind == 'garment' else 'false',
            existing_runtime_template=EXISTING_TPL.get(r['item_id'], ''),
            visual_fabric=''.join(vfab), visual_main_color=''.join(vcol),
            visual_new_values='|'.join(vnew),
            do_not_confuse_with=r['do_not_confuse_with'], source_refs='|'.join(refs), confidence=conf,
            status=STATUS, notes=r['description_ru'][:300])
        if kind == 'component':
            row['runtime_daily_eligible'] = 'false'
            components.append(row)
            rec.update(target='garments/garment_components.csv', reason='деталь/отделка вещи, не слот экипировки')
        else:
            garments.append(row)
            rec.update(target='garments/garments.csv', reason='')
        disposition.append(rec)
    for n in NEW_GARMENTS:
        mats = n['material_ids'].split('|'); mclass = material_class(mats)
        cols = n['color_ids'].split('|')
        vfab = [VISUAL_FABRIC[m] for m in mats if m in VISUAL_FABRIC][:1]
        vcol = [VISUAL_COLOR[c] for c in cols][:1]
        garments.append(dict(n, source_item_id='', alt_names_ru='', region_id=REGION_ID, universal_category_layer='universal',
                             material_class=mclass,
                             dye_evidence_refs='|'.join(sorted({x for c in cols for x in DYE_REFS[c].split('|')})),
                             wear_states='|'.join(wear_states(mclass)), mark_slots=MARK_SLOTS.get(n['equipment_slot'], 'none'),
                             runtime_daily_eligible='false' if n['usage_context'] == 'disputed' else 'true',
                             existing_runtime_template='', visual_fabric=''.join(vfab), visual_main_color=''.join(vcol),
                             visual_new_values='|'.join(v for v in vfab + vcol if v not in EXISTING_VISUAL),
                             do_not_confuse_with='', status=STATUS))
    for g in garments:  # hypotheses / burial / liturgy never runtime-daily
        if g['usage_context'] in ('hypothesis', 'burial', 'liturgy', 'disputed', 'ice', 'riding'):
            g['runtime_daily_eligible'] = 'false'

    GF = ['gm_id', 'source_item_id', 'name_ru', 'alt_names_ru', 'name_en', 'garment_category', 'universal_category_layer',
          'region_id', 'equipment_slot', 'usage_context', 'material', 'material_ids', 'material_class', 'dye_color',
          'color_ids', 'dye_evidence_refs', 'decoration', 'sex', 'age', 'marital_status', 'status_band', 'status_basis',
          'season', 'season_basis', 'wear_states', 'mark_slots', 'runtime_daily_eligible', 'existing_runtime_template',
          'visual_fabric', 'visual_main_color', 'visual_new_values', 'do_not_confuse_with', 'source_refs', 'confidence',
          'status', 'notes']
    gdir = ROOT / 'garments'
    write_csv(gdir / 'garments.csv', garments, GF)
    write_csv(gdir / 'garment_components.csv', components, GF)
    write_csv(gdir / 'costume_disposition.csv', disposition,
              ['source_item_id', 'name_ru', 'subcategory', 'disposition', 'target', 'reason'])
    write_csv(gdir / 'equipment_slots.csv',
              [dict(slot_key=s[0], name_ru=s[1], name_en=s[2], in_runtime_code=str(s[3]).lower(), slot_kind=s[4],
                    category_id='garment.equipment_slot.' + s[0],
                    category_registered_v17=str(s[0] in ('base_garment', 'outer_garment')).lower(),
                    source_refs='v17:m2c-npc/runtime-bindings.json|v17:actor-portrait-spec-v1.js' if s[3] else 'rule:costume subcategory map (build.py SUB)',
                    status=STATUS) for s in SLOTS],
              ['slot_key', 'name_ru', 'name_en', 'slot_kind', 'in_runtime_code', 'category_id', 'category_registered_v17', 'source_refs', 'status'])
    write_csv(gdir / 'wear_states.csv',
              [dict(wear_state=w[0], name_ru=w[1], applies_to_material_class=w[2], source_refs=w[3],
                    in_runtime_code=str(w[0] == 'serviceable').lower(), status=STATUS) for w in WEAR],
              ['wear_state', 'name_ru', 'applies_to_material_class', 'in_runtime_code', 'source_refs', 'status'])
    cats = {}
    for g in garments + components:
        c = cats.setdefault(g['garment_category'], dict(category_id=g['garment_category'], domain='garment',
                            region_id='', layer='universal', example_gm_ids=[], slots=set()))
        c['example_gm_ids'].append(g['gm_id']); c['slots'].add(g['equipment_slot'])
    catrows = [dict(category_id=c['category_id'], domain='garment', region_id='', layer='universal',
                    parent_category_id='garment.kind' if '.kind.' in c['category_id'] else 'garment.component',
                    equipment_slots='|'.join(sorted(c['slots'])), instance_count_novgorod=len(c['example_gm_ids']),
                    novgorod_gm_ids='|'.join(c['example_gm_ids']), status=STATUS,
                    source_refs='rule:build.py SUB map from costume subcategory') for c in cats.values()]
    write_csv(gdir / 'garment_categories.csv', catrows,
              ['category_id', 'domain', 'layer', 'region_id', 'parent_category_id', 'equipment_slots',
               'instance_count_novgorod', 'novgorod_gm_ids', 'source_refs', 'status'])
    # region permission layer (world_base.region_clothing_profiles shape)
    rcp = []
    for g in garments:
        if g['runtime_daily_eligible'] != 'true':
            continue
        rcp.append(dict(id='rcp_nov_' + g['gm_id'], region_id=REGION_ID, garment_category_id=g['garment_category'],
                        slot_key=g['equipment_slot'], gm_id=g['gm_id'],
                        constraints=json.dumps(dict(sex=g['sex'].split('|'), age=g['age'].split('|'),
                                                    season=g['season'].split('|'), status_band=g['status_band'].split('|'),
                                                    marital_status=g['marital_status'], valid_from='1200-01-01',
                                                    valid_to='1260-12-31'), ensure_ascii=False),
                        status='draft', source_refs=g['source_refs'], confidence=g['confidence']))
    write_csv(gdir / 'region_clothing_profiles.csv', rcp,
              ['id', 'region_id', 'garment_category_id', 'slot_key', 'gm_id', 'constraints', 'status', 'source_refs', 'confidence'])
    ANTI_TERMS = {
        'ANTI001': r'кафтан', 'ANTI002': r'косоворот', 'ANTI003': r'сплошн\w* вышив', 'ANTI004': r'жилет|наплечник',
        'ANTI005': r'лапт', 'ANTI006': r'высок\w* мехов\w* шапк', 'ANTI007': r'викинг', 'ANTI008': r'монгол',
        'ANTI009': r'униформ', 'ANTI010': r'латн\w* доспех|полные латы', 'ANTI011': r'рогат\w* шлем', 'ANTI012': r'мехом наружу|шкуры наружу',
        'ANTI013': r'корсет', 'ANTI014': r'кокошник', 'ANTI015': r'сарафан', 'ANTI016': r'каблук',
        'ANTI017': r'хлоп|ситец|ситц', 'ANTI018': r'одинаков\w* доспех', 'ANTI019': r'герб|геральд',
        'ANTI020': r'ювелирн\w* перегруз',
    }
    extra = [('ANACH_POTATO', r'картоф', 'Картофель — американская культура, после XVI в.', 'wk:technology-boundaries'),
             ('ANACH_BUTTONHOLE_LOOPS', r'петлиц', 'Горизонтальные петлицы московского типа — XVI–XVII вв.', 'risovalka §5'),
             ('ANACH_KNITTING_MACHINE', r'машинн\w* вяз|трикотаж', 'Машинное вязание/трикотаж — поздние', 'costume:ANTI017 (аналогия)'),
             ('ANACH_ANILINE', r'анилин', 'Анилиновые красители — XIX в.', 'C')]
    den = [dict(deny_id=a['anti_id'], pattern=ANTI_TERMS[a['anti_id']], name_ru=a['name_ru'], why_wrong=a['why_wrong'],
                replacement=a['replacement'], scope='name_ru|material|dye_color|decoration',
                exception='gm_new_lapti allowed only as disputed row, never in outfits' if a['anti_id'] == 'ANTI005' else '',
                source_refs='costume:' + a['anti_id'], status=STATUS) for a in anti]
    den += [dict(deny_id=i, pattern=p, name_ru=n, why_wrong=n, replacement='', scope='name_ru|material|dye_color|decoration',
                 exception='', source_refs=s, status=STATUS) for i, p, n, s in extra]
    write_csv(gdir / 'denylist.csv', den, ['deny_id', 'pattern', 'name_ru', 'why_wrong', 'replacement', 'scope', 'exception', 'source_refs', 'status'])
    write_csv(gdir / 'materials_colors.csv',
              [dict(palette_id=p['palette_id'], kind=p['kind'], name_ru=p['name_ru'], typical_scope=p['typical_scope'],
                    social_notes=p['social_notes'], dye_evidence_refs=DYE_REFS.get(p['palette_id'], ''),
                    visual_value=VISUAL_FABRIC.get(p['palette_id'], VISUAL_COLOR.get(p['palette_id'], '')),
                    source_refs='|'.join(['costume:' + p['palette_id']] + ['costume:' + s for s in split(p['source_ids'])]),
                    confidence=p['confidence'], status=STATUS) for p in palette],
              ['palette_id', 'kind', 'name_ru', 'typical_scope', 'social_notes', 'dye_evidence_refs', 'visual_value',
               'source_refs', 'confidence', 'status'])

    # ---------------- outfits
    gm_ok = {g['source_item_id'] or g['gm_id']: g for g in garments}

    def ref(x):
        return x if x.startswith('gm_new') else gm_id(x)

    def resolve_kit(cls, sex):
        k = KITS[cls][sex]
        while isinstance(k, str):
            k = KITS[k][sex]
        return k

    role_rows = []
    role_title = {r['role_id']: r for r in roles}
    for rid, rr in role_title.items():
        role_rows.append(dict(role_ref=rid, role_title_ru=rr['role_title'], social_rank=rr['social_rank'],
                              role_status=rr['status'], costume_class=ROLE_CLASS.get(rid, ''),
                              clothing_profile_id=('nov_clothing_' + ROLE_CLASS[rid] + '_v1') if rid in ROLE_CLASS else '',
                              note=ROLE_NOTES.get(rid, ''), source_refs='data/novgorod-region/novgorod_social_roles_v1_enriched.tsv#' + rid,
                              confidence=CLASS_META[ROLE_CLASS[rid]][2] if rid in ROLE_CLASS else '', status=STATUS))
    odir = ROOT / 'outfits_by_role'
    write_csv(odir / 'role_clothing_map.csv', role_rows,
              ['role_ref', 'role_title_ru', 'social_rank', 'role_status', 'costume_class', 'clothing_profile_id', 'note',
               'source_refs', 'confidence', 'status'])

    occ_by_class = {c: set() for c in KITS}
    for o in occs:
        for rid in [x.strip() for x in o['allowed_social_role_ids'].split(';') if x.strip()]:
            if rid in ROLE_CLASS:
                occ_by_class[ROLE_CLASS[rid]].add(o['occupation_id'])

    outfit_rows, runtime_profiles, exceptions = [], [], []
    slot_order = [s[0] for s in SLOTS]
    for cls, meta in CLASS_META.items():
        kit = KITS[cls]
        cls_roles = sorted(r for r, c in ROLE_CLASS.items() if c == cls)
        profile = dict(id=f'nov_clothing_{cls}_v1', version=1, status=STATUS, world_revision_id='TBD_by_import',
                       region_id=REGION_ID, name_ru=meta[0], status_band=meta[1],
                       allowed_role_refs=cls_roles, allowed_occupation_refs=sorted(occ_by_class[cls]),
                       property_binding=dict(owner='actor', holder='actor', controller='actor',
                                             actor_id_binding='generated_actor_ref',
                                             source_ref='rule_property_context_household_personal_v1',
                                             property_rule_ref='m2c_npc_actor_personal_property_v1'),
                       provenance=kit['prov'], variants=[])
        for sex in ('male', 'female'):
            if kit.get(sex) is None:
                continue
            sk = resolve_kit(cls, sex)
            maritals = ['any'] if sex == 'male' else (['monastic'] if cls == 'monastic' else ['married', 'unmarried'])
            for grp, seasons in SEASON_GROUPS.items():
                base = dict(sk[grp])
                for mar in maritals:
                    slots = dict(base)
                    if sex == 'female':
                        slots.update(FEMALE_HEAD[mar][grp])
                    of_id = f'of_{cls}_{sex}_{grp}_{mar}'
                    cond = kit.get('condition', 'serviceable')
                    row = dict(of_id=of_id, clothing_profile_id=profile['id'], costume_class=cls, class_name_ru=meta[0],
                               role_refs='|'.join(cls_roles), sex_categories=sex, age_categories='|'.join(ADULT_AGES),
                               seasons='|'.join(seasons), marital_status=mar, status_band=meta[1],
                               default_condition_state=cond,
                               required_clothing_slot_refs='|'.join(s for s in slot_order if s in slots),
                               runtime_selectable='true' if (sex == 'male' or mar in ('married', 'monastic')) else 'false',
                               provenance=kit['prov'], source_refs=prov_refs(kit['prov']),
                               confidence=meta[2], status=STATUS)
                    for s in slot_order:
                        row['slot_' + s] = ref(slots[s]) if s in slots else ''
                    outfit_rows.append(row)
                    # compatibility log (item season/sex/age vs variant)
                    for s, iid in slots.items():
                        g = gm_ok.get(iid)
                        if not g:
                            exceptions.append(dict(of_id=of_id, slot=s, gm_id=ref(iid), issue='unresolved')); continue
                        miss = [x for x in seasons if x not in g['season'].split('|')]
                        if miss:
                            exceptions.append(dict(of_id=of_id, slot=s, gm_id=g['gm_id'],
                                                   issue='season_outside_item_scope:' + '|'.join(miss)))
                        ob = set(meta[1].split('|')) | ({'high'} if 'elite' in meta[1] else set())
                        if not ob & set(g['status_band'].split('|')):  # rule: elite outfits accept high-band items
                            exceptions.append(dict(of_id=of_id, slot=s, gm_id=g['gm_id'],
                                                   issue='status_outside_item_scope:' + g['status_band']))
                        if sex not in g['sex'].split('|'):
                            exceptions.append(dict(of_id=of_id, slot=s, gm_id=g['gm_id'], issue='sex_outside_item_scope'))
                        if g['equipment_slot'] != s:
                            exceptions.append(dict(of_id=of_id, slot=s, gm_id=g['gm_id'], issue='slot_mismatch:' + g['equipment_slot']))
                    # runtime projection: female head slots removed (R8), married row stands for both
                    if sex == 'female' and mar == 'unmarried':
                        continue
                    rslots = {k: v for k, v in slots.items() if not (sex == 'female' and k in ('headwear', 'head_under') and mar != 'monastic')}
                    variant = dict(id=f'nov_clothing_{cls}_{sex}_{grp}_v1', sex_categories=[sex], age_categories=ADULT_AGES,
                                   seasons=seasons, required_clothing_slot_refs=[s for s in slot_order if s in rslots],
                                   equipment_templates=[dict(
                                       equipment_candidate_id=f'nov_clothing_{cls}_{ref(v)}',
                                       equipment_slot_category_id=s, gm_id=ref(v),
                                       item_template_ref=EXISTING_TPL.get(v, 'item_tpl_nov_' + ref(v) + '_v1'),
                                       physical_position='equipped', condition_state=cond, claim_state='established',
                                       legal_status='owned', status=STATUS)
                                       for s in slot_order for v in [rslots.get(s)] if v])
                    profile['variants'].append(variant)
        runtime_profiles.append(profile)
    # children (outfits.csv only)
    for sex in ('male', 'female'):
        for grp, seasons in SEASON_GROUPS.items():
            slots = CHILD_KITS[sex][grp]
            row = dict(of_id=f'of_child_{sex}_{grp}_any', clothing_profile_id='', costume_class='child', class_name_ru='ребёнок',
                       role_refs='', sex_categories=sex, age_categories='child', seasons='|'.join(seasons), marital_status='any',
                       status_band='low|middle|high', default_condition_state='serviceable',
                       required_clothing_slot_refs='|'.join(s for s in slot_order if s in slots), runtime_selectable='false',
                       provenance=CHILD_KITS['prov'] + '; age child needs ACTOR_BASE_APPEARANCE_VOCABULARY extension',
                       source_refs='costume:CMB031|costume:CMB032|costume:CMB033', confidence='B', status=STATUS)
            for s in slot_order:
                row['slot_' + s] = ref(slots[s]) if s in slots else ''
            outfit_rows.append(row)
            for s, iid in slots.items():
                g = gm_ok.get(iid)
                miss = [x for x in seasons if x not in g['season'].split('|')] if g else ['?']
                if miss:
                    exceptions.append(dict(of_id=row['of_id'], slot=s, gm_id=ref(iid), issue='season_outside_item_scope:' + '|'.join(miss)))
    OF = ['of_id', 'clothing_profile_id', 'costume_class', 'class_name_ru', 'role_refs', 'sex_categories', 'age_categories',
          'seasons', 'marital_status', 'status_band', 'default_condition_state', 'required_clothing_slot_refs',
          'runtime_selectable'] + ['slot_' + s for s in slot_order if SLOTS[slot_order.index(s)][4] in ('wearable', 'situational')] + \
         ['provenance', 'source_refs', 'confidence', 'status']
    write_csv(odir / 'outfits.csv', outfit_rows, OF)
    write_csv(odir / 'outfit_compatibility_exceptions.csv', exceptions, ['of_id', 'slot', 'gm_id', 'issue'])
    (odir / 'runtime_clothing_profiles.json').write_text(json.dumps(dict(
        schema='novgorod_game_base_clothing_profiles_candidate_v1', status=STATUS,
        note='Shape follows approved-procedural-npc.js approvedClothing(); world_revision_id, item_template_ref and status must be set by import/approval. Female headwear omitted (R8).',
        clothing_profiles=runtime_profiles), ensure_ascii=False, indent=1), encoding='utf-8')

    # foreign / other-origin outfits kept as descriptive profiles (no runtime selector for origin)
    fp = read_csv(COSTUME / 'foreigner_profiles.csv')
    write_csv(odir / 'foreign_origin_profiles.csv',
              [dict(origin_profile_id='orig_' + f['group_id'].lower(), name_ru=f['name_ru'], who=f['who'],
                    presence_confidence=f['presence_confidence'], clothing_difference=f['clothing_difference'],
                    local_adaptation=f['local_adaptation'],
                    combo_refs={'FG001': 'CMB036', 'FG002': 'CMB037', 'FG003': 'CMB038', 'FG004': 'CMB039', 'FG005': 'CMB040',
                                'FG006': 'CMB041', 'FG007': 'CMB042', 'FG009': 'CMB043'}.get(f['group_id'], ''),
                    runtime_selector='missing: origin is not a clothing variant selector',
                    source_refs='|'.join(['costume:' + f['group_id']] + ['costume:' + s for s in split(f['source_ids'])]),
                    reliability_note=f['reliability_note'], status=STATUS) for f in fp],
              ['origin_profile_id', 'name_ru', 'who', 'presence_confidence', 'clothing_difference', 'local_adaptation',
               'combo_refs', 'runtime_selector', 'source_refs', 'reliability_note', 'status'])
    # liturgical outfits (context kits, not daily)
    lit = [dict(lit_id='lit_priest', name_ru='Священник на литургии', slots='vestment_base=gm_cl004|vestment_stole=gm_cl005|vestment_outer=gm_cl006|vestment_cuffs=gm_cl007', source_refs='costume:CMB021', confidence='B'),
           dict(lit_id='lit_deacon', name_ru='Дьякон на литургии', slots='vestment_base=gm_cl004|vestment_stole=gm_cl008|vestment_cuffs=gm_cl007', source_refs='costume:CMB022', confidence='B'),
           # F1 fix (VERIFICATION.md 2026-09-26): headwear=gm_hw014 (mitre) removed — Pravoslavnaya Entsiklopediya:
           # bishop's mitre first attested 15th c., cap-shaped mitre in Rus only from 16th c.; before that Rus
           # prelates wore only the klobuk. CMB044 lists the mitre as optional, not mandatory.
           dict(lit_id='lit_archbishop', name_ru='Архиепископ на литургии', slots='vestment_base=gm_cl004|vestment_stole=gm_cl005|vestment_cuffs=gm_cl007|vestment_omophorion=gm_cl009', source_refs='costume:CMB044', confidence='C')]
    for l in lit:
        l['status'] = STATUS; l['usage_context'] = 'liturgy'
    write_csv(odir / 'liturgical_outfits.csv', lit, ['lit_id', 'name_ru', 'usage_context', 'slots', 'source_refs', 'confidence', 'status'])

    # ---------------- adornment & appearance
    ADORN = {  # sub -> (kind, slot, freq_class, freq_basis)
        'cloak_fastener': ('fibula', 'garment_fastener', 'contextual', 'при ношении плаща'),
        'foreign_brooch': ('ring_brooch_foreign', 'garment_fastener', 'rare', 'иноземный круг'),
        'scandinavian_brooch': ('ring_brooch_scandinavian', 'garment_fastener', 'rare', 'иноземный круг'),
        'religious_pendant': ('pectoral_cross', 'chest_pendant', 'common', 'costume A; esoserver: янтарные крестики среди >1000 янтарных изделий'),
        'religious_reliquary': ('encolpion', 'chest_pendant', 'contextual', 'costume: средний/высокий статус'),
        'pendant_lunula': ('lunula_pendant', 'neck', 'contextual', 'costume B'),
        'bead_necklace': ('bead_necklace', 'neck', 'common', 'esoserver: >2000 стеклянных бус в раскопках'),
        'ear_temple_rings': ('temple_rings_earrings', 'ear_temple', 'common', 'costume A; sqlite material_culture A'),
        'spiral_hair_ornament': ('spiral_temple_ornament', 'ear_temple', 'rare', 'региональный маркер пограничных групп'),
        'bracelet': ('bracelet', 'wrist', 'common', 'costume A'),
        'regional_bracelet': ('bracelet_regional_plate', 'wrist', 'rare', 'иноземный/региональный круг'),
        'finger_ring': ('finger_ring', 'finger', 'common', 'costume A'),
        'elite_temporal_pendant': ('kolt', 'ear_temple', 'rare', 'ANTI020: элитные колты редки'),
        'elite_head_chains': ('ryasna', 'head_ornament', 'rare', 'ANTI020'),
        'elite_pendant_unique': ('quadrifolium_enamel_pendant', 'chest_pendant', 'rare', 'единичная находка SRC004'),
        'foreign_chain_pins': ('chain_pins', 'garment_fastener', 'rare', 'C, предварительная публикация'),
        'amulet': ('amulet_pendant', 'chest_pendant', 'contextual', 'costume B'),
        'neck_ring': ('neck_ring_grivna', 'neck', 'rare', 'C'),
    }
    FREQ = {'ubiquitous': 8, 'common': 4, 'contextual': 2, 'rare': 1}
    ORIGIN = {'foreign_brooch': 'west|scandinavian', 'scandinavian_brooch': 'scandinavian', 'spiral_hair_ornament': 'baltic_finnic',
              'regional_bracelet': 'baltic_finnic', 'foreign_chain_pins': 'baltic', 'neck_ring': 'baltic_finnic'}
    # VERIFICATION.md 2026-09-26: weight_basis on these subcategories cites esoserver (web:WEB03) or sqlite
    # material_culture, but source_refs did not list them. Add the missing refs.
    EXTRA_REFS = {'religious_pendant': ['web:WEB03'], 'bead_necklace': ['web:WEB03'], 'ear_temple_rings': ['sqlite:material_culture']}
    ad = []
    for r in adorn_src:
        kind, slot, fc, fb = ADORN[r['subcategory']]
        bands, bb = parse_status(r['social_scope'] + ' ' + r['status_markers'])
        mats = parse_materials(r['materials'])
        refs = ['costume:' + r['item_id']] + ['costume:' + s for s in split(r['source_ids'])] + EXTRA_REFS.get(r['subcategory'], [])
        ad.append(dict(ad_id='ad_' + r['item_id'].lower(), source_item_id=r['item_id'], kind=kind, name_ru=r['name_ru'],
                       target_table='item_templates', slot=slot, material=r['materials'], material_ids='|'.join(mats),
                       sex='|'.join(sexes(r['gender_scope'])), age='|'.join(ADULT_AGES), marital_status='any',
                       status_band='|'.join(bands), origin_refs=ORIGIN.get(r['subcategory'], 'local'),
                       appearance_facet='', vocabulary_value='', needs_vocabulary_extension='false',
                       frequency_class=fc, weight=FREQ[fc], weight_rule='frequency_class ubiquitous/common/contextual/rare -> 8/4/2/1',
                       weight_basis=fb, wear_states='|'.join(wear_states(material_class(mats))),
                       source_refs='|'.join(refs),
                       confidence=r['historical_confidence'], status=STATUS, notes=r['description_ru'][:250]))
    RESEARCH_AD = [
        # F: VERIFICATION.md 2026-09-26 — wrong date ("мода с 1030-х"; WEB03 does not support "местное
        # производство с конца XII в." beyond an initial Kyiv import). Re-sourced to book evidence with a
        # direct quote and a stated Novgorod production range; existence at A (costume:AC023) kept, dating at B.
        dict(ad_id='ad_new_glass_bracelet', kind='bracelet_glass', name_ru='Стеклянный браслет',
             slot='wrist', material='стекло: чёрное, коричневое, зелёное, жёлтое, бирюзовое, фиолетовое, синее, прозрачное',
             material_ids='glass', sex='female', status_band='low|middle|high', origin_refs='local|import',
             frequency_class='common',
             weight_basis='книга: «браслеты из этого стекла делали ... в Новгороде — с конца XII до середины XIV в.» '
                           '(Древняя Русь. Быт и культура, 1997, §Украшения из стекла Ю.Л. Щапова, ¶858); '
                           'свинцово-калиевое стекло — вероятный импорт начала XIII в. (web:WEB02), местное производство этим не доказано',
             source_refs='book:624953 §Украшения из стекла (Ю.Л. Щапова) ¶858|web:WEB02|costume:AC023', confidence='B',
             notes='1230 внутри новгородского периода бытования (кон. XII — сер. XIV в., книга). Прежняя дата '
                   '«мода с 1030-х» и утверждение о местном производстве с конца XII в. по WEB03 не подтверждались источником и удалены.'),
        # F: VERIFICATION.md 2026-09-26 — WEB04 is a short encyclopedia entry, not Sedova's text, and does not
        # support the narrow "XI–first half XII c." / "late XII–XIII c. bossed forms" dating. Replaced with two
        # book sources: a direct Novgorod-Slovene attribution and a dated range that covers 1230.
        dict(ad_id='ad_new_shield_temple_ring', kind='temple_ring_shield_type', name_ru='Ромбощитковое височное кольцо новгородского типа',
             slot='ear_temple', material='серебро|бронза', material_ids='MAT013|MAT012', sex='female', status_band='low|middle|high',
             origin_refs='local', frequency_class='contextual',
             weight_basis='книга: «у новгородских словен характерной этноопределяющей деталью женского костюма являлись '
                          'ромбощитковые височные кольца» (Древняя Русь. Быт и культура, 1997, §Украшения из меди и сплавов '
                          'М.В. Седова, ¶649); «ромбо-щитковые височные кольца ... датируются началом XI–XIV в.» '
                          '(Финно-угры и балты в эпоху средневековья, 1987, ¶343)',
             source_refs='book:624953 §Украшения из меди и сплавов (М.В. Седова) ¶649|book:681281 §Прибалтийские финны ¶343|costume:AC021',
             confidence='B',
             notes='1230 внутри книжного диапазона бытования (нач. XI–XIV в.). WEB04 (booksite, короткая энциклопедическая '
                   'статья «Височные кольца», не текст Седовой) снят как источник узкой датировки; см. также sources.csv.'),
        dict(ad_id='ad_new_amber_pendant', kind='amber_pendant_bead', name_ru='Янтарные бусины, крестики и привески',
             slot='neck', material='янтарь', material_ids='amber', sex='male|female', status_band='low|middle|high',
             origin_refs='local|baltic_import', frequency_class='common', weight_basis='>1000 янтарных изделий в раскопках',
             source_refs='web:WEB03', confidence='A', notes='Янтарь — Поднепровье и Прибалтика.'),
        dict(ad_id='ad_new_collar_button_bronze', kind='collar_button', name_ru='Литая бронзовая пуговица ворота рубахи',
             slot='garment_fastener', material='бронза', material_ids='MAT012', sex='male|female', status_band='low|middle|high|elite',
             origin_refs='local', frequency_class='contextual', weight_basis='WK: один из исторических вариантов застёжки',
             source_refs='wk:material_culture:shirt-collar-button|claim:clothing-bronze-button|claim:clothing-button-shirt', confidence='B', notes=''),
        dict(ad_id='ad_new_collar_button_bone', kind='collar_button', name_ru='Костяная пуговица ворота рубахи',
             slot='garment_fastener', material='кость', material_ids='MAT015', sex='male|female', status_band='low|middle|high',
             origin_refs='local', frequency_class='contextual', weight_basis='WK: наряду с бронзовыми',
             source_refs='wk:material_culture:shirt-collar-button|claim:clothing-bone-button', confidence='B', notes=''),
    ]
    for x in RESEARCH_AD:
        x.update(source_item_id='', target_table='item_templates', age='|'.join(ADULT_AGES), marital_status='any',
                 appearance_facet='', vocabulary_value='', needs_vocabulary_extension='false', weight=FREQ[x['frequency_class']],
                 weight_rule='frequency_class ubiquitous/common/contextual/rare -> 8/4/2/1',
                 wear_states='|'.join(wear_states(material_class(x['material_ids'].split('|')))), status=STATUS)
        ad.append(x)
    VOCAB = {'hair_color': ['blond', 'light_brown', 'dark_brown', 'black', 'auburn', 'gray', 'white'],
             'hair_length': ['bald', 'short', 'medium', 'long'], 'hair_style': ['straight', 'wavy', 'loose', 'braided'],
             'facial_hair': ['none', 'moustache', 'short_beard', 'full_beard'], 'build': ['slim', 'average', 'stocky'],
             'eye_color': ['blue', 'gray', 'green', 'brown', 'dark'], 'skin_tone': ['pale', 'light', 'warm', 'brown'],
             'face_shape': ['oval', 'round', 'broad', 'angular', 'long']}
    MALE_AD = 'adult|middle_aged|old'
    # NAME_RU: VERIFICATION.md 2026-09-26 — name_ru held basis text instead of a name. Real short names added.
    NAME_RU = {
        ('facial_hair', 'full_beard'): 'Полная борода',
        ('facial_hair', 'short_beard'): 'Короткая/средняя борода',
        ('facial_hair', 'moustache'): 'Усы без бороды',
        ('facial_hair', 'none'): 'Без бороды и усов',
        ('hair_length', 'medium'): 'Волосы средней длины (муж.)',
        ('hair_length', 'short'): 'Короткие волосы (муж.)',
        ('hair_length', 'long'): 'Длинные волосы (жен.)',
        ('hair_style', 'braided'): 'Заплетённые волосы (жен.)',
        ('hair_style', 'single_braid_maiden'): 'Девичья коса',
        ('hair_style', 'hair_covered_by_headwear'): 'Волосы покрыты убором (замужняя)',
        ('build', 'slim'): 'Худощавое телосложение',
        ('build', 'emaciated'): 'Истощение (голод 1230)',
    }
    # F: VERIFICATION.md 2026-09-26 — the moustache fine («об усе») is in the Kratkaya redaction of Russkaya
    # Pravda, not the Prostrannaya; the previous wording attributed both to the Prostrannaya. Corrected below.
    # tonsure_clergy row (гуменцо) had no source at all — deleted per the fixer rule "no source -> delete,
    # list in README gaps" (see adornment_appearance/README.md, "Known gaps").
    APPEAR = [  # facet, value, sex, age, marital, status, freq, basis, refs, conf, notes
        ('facial_hair', 'full_beard', 'male', MALE_AD, 'any', 'all', 'common',
         'борода охраняется штрафом 12 гривен (РП, Пространная ред., ст. «О бороде»); за вырванный ус — отдельно, по Краткой ред.; бородатые мужи в иконографии Нередицы',
         'web:WEB06|costume:SRC025|risovalka §2', 'C', 'частота — вывод; сам факт ношения бород A'),
        ('facial_hair', 'short_beard', 'male', MALE_AD, 'any', 'all', 'common',
         'inference: risovalka §2 — художественный дизайн одного персонажа; базовая борода короткая/средняя (не популяционная статистика)',
         'web:WEB06|risovalka §2', 'C', ''),
        ('facial_hair', 'moustache', 'male', MALE_AD, 'any', 'all', 'rare',
         'inference: усы без бороды не описаны в собранных источниках — частотный класс rare не выведен из данных, а принят по умолчанию',
         'web:WEB06', 'C', ''),
        ('facial_hair', 'none', 'male', MALE_AD, 'any', 'all', 'rare',
         'inference: бритьё не описано как норма; исключение — юноши. Частотный класс rare не выведен из данных, а принят по умолчанию',
         'web:WEB06', 'C',
         'young_adult в одобренном v3 допускает только none — нужен пересмотр applicability владельцем'),
        ('hair_length', 'medium', 'male', '|'.join(ADULT_AGES), 'any', 'all', 'common',
         'inference: risovalka §2 — художественный дизайн одного персонажа (до ушей/шеи); культура.ру (C): у пожилых до плеч. Не популяционная статистика',
         'risovalka §2|web:WEB07', 'C', ''),
        ('hair_length', 'short', 'male', '|'.join(ADULT_AGES), 'any', 'all', 'contextual',
         'inference: risovalka items.json — короткие волосы как один из вариантов дизайна, не популяционная статистика',
         'risovalka §2', 'C', ''),
        ('hair_length', 'long', 'female', '|'.join(ADULT_AGES), 'any', 'all', 'ubiquitous', 'коса девушки; волосы замужних убраны под повой', 'web:WEB07|claim:clothing-povoi-headcover', 'C', ''),
        ('hair_style', 'braided', 'female', '|'.join(ADULT_AGES), 'any', 'all', 'common', 'девичья коса; две косы у замужних под убором (этнографическая ретроекция)', 'web:WEB07', 'C', ''),
        ('hair_style', 'single_braid_maiden', 'female', 'young_adult|adult', 'unmarried', 'all', 'common', 'девичья коса', 'web:WEB07|costume:CMB028', 'C', 'значения нет в словаре'),
        ('hair_style', 'hair_covered_by_headwear', 'female', '|'.join(ADULT_AGES), 'married', 'all', 'ubiquitous', 'повой покрывает волосы', 'claim:clothing-povoi-headcover|costume:HW006|costume:HW007', 'B', 'значения нет в словаре; сейчас выражается только слотом head_under'),
        ('build', 'slim', 'male|female', '|'.join(ADULT_AGES), 'any', 'low', 'common', 'голод 1230: истощение бедных (осень–зима 1230)', 'sqlite:S01|sqlite:social_groups#нищие|risovalka §1 Б', 'B',
         'нужен селектор фазы famine_1230 и status_band'),
        ('build', 'emaciated', 'male|female', '|'.join(ADULT_AGES), 'any', 'low', 'contextual', 'голод 1230: «запавшие щёки», истощение', 'sqlite:S01|risovalka §1 Б', 'B', 'значения нет в словаре'),
    ]
    ap = []
    for i, (facet, val, sx, age, mar, st, fc, basis, refs, conf, notes) in enumerate(APPEAR, 1):
        in_vocab = val in VOCAB.get(facet, [])
        has_src = bool(refs)
        ap.append(dict(ad_id=f'ap_{facet}_{val}_{sx.replace("|", "_")}', source_item_id='', kind='appearance',
                       name_ru=NAME_RU[(facet, val)],
                       target_table='region_appearance_profile_entries' if in_vocab else 'owner:@rus/actors (vocabulary extension)',
                       slot='', material='', material_ids='', sex=sx, age=age, marital_status=mar,
                       status_band=BANDS and ('|'.join(BANDS) if st == 'all' else st), origin_refs='local',
                       appearance_facet=facet, vocabulary_value=val,
                       needs_vocabulary_extension='false' if in_vocab else 'true',
                       frequency_class=fc if has_src else '', weight=FREQ[fc] if has_src else '',
                       weight_rule='frequency_class ubiquitous/common/contextual/rare -> 8/4/2/1',
                       weight_basis=basis, wear_states='', source_refs=refs, confidence=conf, status=STATUS, notes=notes))
    AF = ['ad_id', 'source_item_id', 'kind', 'name_ru', 'target_table', 'slot', 'material', 'material_ids', 'sex', 'age',
          'marital_status', 'status_band', 'origin_refs', 'appearance_facet', 'vocabulary_value', 'needs_vocabulary_extension',
          'frequency_class', 'weight', 'weight_rule', 'weight_basis', 'wear_states', 'source_refs', 'confidence', 'status', 'notes']
    adir = ROOT / 'adornment_appearance'
    write_csv(adir / 'adornment.csv', ad + ap, AF)
    write_csv(adir / 'vocabulary_extension_requests.csv',
              [dict(facet=a['appearance_facet'], requested_value=a['vocabulary_value'], ad_id=a['ad_id'], owner='@rus/actors',
                    reason=a['notes'] or a['weight_basis'], source_refs=a['source_refs'], confidence=a['confidence'])
               for a in ap if a['needs_vocabulary_extension'] == 'true'] +
              [dict(facet='age_category', requested_value='child', ad_id='outfits_by_role:of_child_*', owner='@rus/actors',
                    reason='детские комплекты CMB031–033 и детские вещи (GC*, HW016/017, FW010/011) нельзя выбрать в runtime',
                    source_refs='costume:CMB031|costume:CMB032|costume:CMB033', confidence='B'),
               dict(facet='marital_status (selector)', requested_value='married|unmarried|widowed', ad_id='outfits_by_role:female *',
                    reason='женский головной убор зависит от брачного статуса (HW006/HW007 vs HW010); approvedClothing не фильтрует по нему',
                    source_refs='claim:clothing-povoi-headcover|costume:CMB025|costume:CMB028', confidence='B')],
              ['facet', 'requested_value', 'ad_id', 'owner', 'reason', 'source_refs', 'confidence'])

    # ---------------- sources registry
    web = [
        ('WEB01', 'Д. О. Осипов. «К истории лаптя на Руси» (Наука и жизнь, 2007) — изложение позиции А. В. Курбатова: плетёная обувь в городском слое не ранее рубежа XV–XVI вв.; Осипов сомневается', 'https://www.nkj.ru/archive/articles/9322/', 'B'),
        ('WEB02', 'Исследование новгородских браслетов из свинцового стекла (раскоп Козьмодемьянский 3)', 'https://istina.msu.ru/publications/article/543978068/', 'B'),
        ('WEB03', '«Древний Новгород: прикладное искусство и археология» — раздел «Средневековые изделия из стекла и янтаря» (веб-копия)', 'https://esoserver.narod.ru/Pagan/Dr_nov/dn_stekl.htm', 'B'),
        ('WEB04', 'Височные кольца (Седова М. В., «Ювелирные изделия древнего Новгорода X–XV вв.», фрагмент на booksite)', 'https://www.booksite.ru/fulltext/1/001/008/005/345.htm', 'B'),
        ('WEB05', 'М. М. Савенкова. «Понёвы из средневекового Новгорода (по материалам археологических раскопок)», 2015 — реконструкция декора понёв по тканям-рядинкам; датировка в аннотации не указана', 'https://www.gramota.net/article/hss20151942/fulltext', 'B'),
        ('WEB06', 'Русская Правда, Пространная редакция (штраф за вырванную бороду/ус)', 'https://www.hist.msu.ru/ER/Etext/RP', 'A'),
        ('WEB07', 'История русских причёсок (Культура.РФ) — популярный обзор; только C', 'https://www.culture.ru/materials/253388/istoriya-russkikh-prichesok', 'C'),
    ]
    srows = [dict(ref='costume:' + s['source_id'], title=s['title'], url=s['url'], kind=s['source_type'], confidence_hint=s['trust_level'])
             for s in csrc]
    srows += [dict(ref='web:' + w[0], title=w[1], url=w[2], kind='web research 2026-09-26', confidence_hint=w[3]) for w in web]
    srows += [dict(ref='sqlite:S01', title='НПЛ, изд. 1950 (via novgorod_1230(1) (1).sqlite sources)', url='https://archive.org/details/novhorodskyj_litopys', kind='primary', confidence_hint='A'),
              dict(ref='sqlite:S15', title='Лёгкой поступью по мостовой. Обувь древнего Новгорода X–XV вв.', url='https://novgorodmuseum.ru/visit/sobytiya/legkoj-postupyu-po-mostovoj.-obuv-drevnego-novgoroda-x-xv-vv.', kind='museum', confidence_hint='A'),
              dict(ref='sqlite:S16', title='Е. А. Рыбина. Мир вещей средневекового Новгорода', url='https://cyberleninka.ru/article/n/mir-veschey-srednevekovogo-novgoroda-po-arheologicheskim-nahodkam', kind='scholarly', confidence_hint='B'),
              dict(ref='sqlite:material_culture', title='C:/Users/Slaven/Downloads/novgorod_1230(1) (1).sqlite table material_culture (15 rows)', url='', kind='local curated db', confidence_hint='A-B'),
              dict(ref='sqlite:social_groups', title='C:/Users/Slaven/Downloads/novgorod_1230(1) (1).sqlite table social_groups (13 rows)', url='', kind='local curated db', confidence_hint='A-B'),
              dict(ref='risovalka', title='Документы/РИСОВАЛКА ВЕБ/novgorod_character_1230.md (copy: sources/character-bible-1230)', url='', kind='author research bible (candidate)', confidence_hint='B-C'),
              dict(ref='wk:*/claim:*', title='WK production-v1 clothing.json, historical-population.json, household-agriculture.json, settlement-craft.json, reconstructed-ordinary-lifeways-v1.json (approved)', url='data/world-catalogs/novgorod/world-knowledge/production-v1/', kind='approved WK', confidence_hint='per claim'),
              dict(ref='source:clothing-rabinovich-1986', title='Рабинович М. Г. Древнерусская одежда IX–XIII вв.', url='https://www.booksite.ru/ancient/reader/human_3_02.htm', kind='scholarly (WK)', confidence_hint='B'),
              dict(ref='v17:*', title='Novgorod-runtime (PR #98): m2c-npc/runtime-bindings.json, appearance-transfer-v3, packages/actors, approved-procedural-npc.js', url='', kind='runtime contract', confidence_hint='')]
    write_csv(ROOT / 'sources.csv', srows, ['ref', 'title', 'url', 'kind', 'confidence_hint'])
    print(json.dumps(dict(garments=len(garments), components=len(components), disposition=len(disposition),
                          categories=len(catrows), region_clothing_profiles=len(rcp), denylist=len(den),
                          outfits=len(outfit_rows), runtime_profiles=len(runtime_profiles),
                          runtime_variants=sum(len(p['variants']) for p in runtime_profiles),
                          exceptions=len(exceptions), adornment_items=len(ad), appearance_rows=len(ap),
                          sources=len(srows)), ensure_ascii=False))


if __name__ == '__main__':
    main()
