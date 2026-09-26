#!/usr/bin/env python3
"""Build or check candidate occupation to workplace place-family links."""
import csv
import io
import sys
from pathlib import Path

GROUP = Path(__file__).resolve().parents[1]
GB = GROUP.parent
REPO = GROUP.parents[4]
TARGET = GROUP / 'craft_tools_gear/occupation_pf_crosswalk.csv'


def read(path, delimiter=','):
    with path.open(encoding='utf-8-sig', newline='') as file:
        return list(csv.DictReader(file, delimiter=delimiter))


families = read(GB / 'places-binding/places/place_families.csv')
pf_kind = {row['pf_id']: row['pf_kind'] for row in families}
assert len(pf_kind) == len(families) and len(set(pf_kind.values())) == 16
occupations = {row['occupation_id']: row for row in read(REPO / 'data/novgorod-region/novgorod_occupations_v1_enriched.tsv', '\t')}
tool_rows = read(GROUP / 'craft_tools_gear/tools_gear.csv')
tools = {row['tl_id']: row for row in tool_rows}
assert len(tools) == len(tool_rows)
links = {}


def add(occupation, pf, basis, confidence, ref, tool='', workshop=''):
    assert occupation in occupations and pf in pf_kind, (occupation, pf)
    link = links.setdefault((occupation, pf), {'basis': set(), 'confidence': [], 'refs': set(), 'tools': set(), 'workshops': set()})
    link['basis'].add(basis)
    link['confidence'].append(confidence)
    link['refs'].add(ref)
    if tool:
        link['tools'].add(tool)
    if workshop:
        link['workshops'].add(workshop)


tsv_confidence = {'high': 'A', 'medium_high': 'B', 'medium': 'B', 'medium_low': 'C'}
# A fixture locates work; a carried/general tool does not locate its worker.
occupation_tools = read(GROUP / 'craft_tools_gear/occupation_tools.csv')
tool_users = {}
for row in occupation_tools:
    tool_users.setdefault(row['tl_id'], set()).add(row['occupation_id'])
for row in occupation_tools:
    occupation, tool_id = row['occupation_id'], row['tl_id']
    assert occupation in occupations and tool_id in tools, (occupation, tool_id)
    if row['carry_kind'] == 'workplace' and tools[tool_id]['size_class'] == 'fixture' and len(tool_users[tool_id]) == 1:
        add(occupation, 'pf_' + tools[tool_id]['workplace_pf_id'], 'rule',
            max(row['confidence'], tools[tool_id]['confidence']),
            f'craft_tools_gear/occupation_tools.csv#occupation_id={occupation},tl_id={tool_id}', tool=tool_id)
for row in read(GROUP / 'workshops/workshops.csv'):
    pf = 'pf_' + row['pf_id']
    assert pf in pf_kind, (row['ws_id'], pf)
    for occupation in row['occupations'].split(';'):
        occupation = occupation.strip()
        if occupation:
            add(occupation, pf, 'source', row['confidence'],
                f'workshops/workshops.csv#ws_id={row["ws_id"]}', workshop=row['ws_id'])

# Only exact G4 location terms with an unambiguous PF equivalent.
g4_pf = {
    'ferry_mooring': 'ferry_landing', 'church': 'church_interior',
    'church_yard': 'churchyard', 'road_exit': 'road',
    'market_square': 'market_square', 'craft_street': 'town_street',
    'work_sheds': 'ordinary_workshop', 'merchant_yards': 'town_courtyard',
    'storehouses': 'cellar_granary', 'stable_yard': 'outbuildings',
    'river_landings': 'river_wharf', 'dwelling_yard': 'rural_yard',
    'field_edge': 'field_margin',
}
for occupation, record in occupations.items():
    for term in record['typical_g4_location_types'].split(';'):
        term = term.strip()
        if term in g4_pf:
            add(occupation, 'pf_' + g4_pf[term], 'source',
                tsv_confidence[record['confidence']],
                f'tsv:occ:{occupation}#typical_g4_location_types')

# These work sites are named in the occupation, rather than inferred from its kit.
direct = {
    'nov_occ_herder': [('outbuildings', 'where_work_happens', 'скотный двор'),
                       ('pasture', 'occupation_title', 'пастух')],
    'nov_occ_cattle_keeper': [('outbuildings', 'where_work_happens', 'скотный двор')],
    'nov_occ_ploughman': [('arable_field', 'where_work_happens', 'поле')],
    'nov_occ_haymaker': [('hay_meadow', 'where_work_happens', 'покос')],
    'nov_occ_fisher': [('fishing_camp', 'where_work_happens', 'рыболовный стан')],
    'nov_occ_fish_weir_keeper': [('fishing_camp', 'where_work_happens', 'рыболовный стан')],
}
for occupation, sites in direct.items():
    for pf, field, phrase in sites:
        assert phrase in occupations[occupation][field], occupation
        add(occupation, 'pf_' + pf, 'source', tsv_confidence[occupations[occupation]['confidence']],
            f'tsv:occ:{occupation}#{field}')
rows = []
for (occupation, pf), link in sorted(links.items()):
    rows.append((occupation, pf, pf_kind[pf], 'source' if 'source' in link['basis'] else 'rule',
                 max(link['confidence']), ';'.join(sorted(link['refs'])),
                 ';'.join(sorted(link['tools'])), ';'.join(sorted(link['workshops'])), 'candidate'))
for pf in sorted(pf_kind.keys() - {pf for _, pf in links}):
    rows.append(('', pf, pf_kind[pf], 'no_source', '', '', '', '', 'candidate'))
for occupation in sorted(occupations.keys() - {occupation for occupation, _ in links}):
    rows.append((occupation, '', '', 'no_source', '', '', '', '', 'candidate'))
assert len({(row[0], row[1]) for row in rows}) == len(rows)
assert {row[1] for row in rows if row[1]} == set(pf_kind)
linked_pf = {pf for _, pf in links}
unlinked_pf = {row[1] for row in rows if row[3] == 'no_source' and row[1]}
assert linked_pf.isdisjoint(unlinked_pf) and linked_pf | unlinked_pf == set(pf_kind)
assert {row[0] for row in rows if row[3] == 'no_source' and row[0]} == occupations.keys() - {occupation for occupation, _ in links}
assert all(row[4] and row[5] for row in rows if row[3] != 'no_source')
assert all(not row[4] and not row[5] for row in rows if row[3] == 'no_source')
buf = io.StringIO(newline='')
writer = csv.writer(buf, lineterminator='\n')
writer.writerow(('occupation_id', 'pf_id', 'pf_kind', 'basis', 'confidence', 'source_refs', 'tool_ids', 'workshop_ids', 'status'))
writer.writerows(rows)
expected = buf.getvalue().encode('utf-8')
if '--check' in sys.argv:
    assert TARGET.read_bytes() == expected, 'occupation_pf_crosswalk.csv differs from source data'
    actual = read(TARGET)
    assert all(row['basis'] != 'no_source' for row in actual if row['occupation_id'] and row['pf_id'])
    assert {(row['occupation_id'], row['pf_id']) for row in actual if row['basis'] != 'no_source'} == set(links)
else:
    TARGET.write_bytes(expected)
print(f'PASS tools occupation crosswalk: {len(rows)} rows, {len(links)} linked pairs, '
      f'{len(linked_pf)} linked PF, {len(unlinked_pf)} no_source PF, {len(families)} total PF')
