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
G4_OWNER = 'places-binding/places/crosswalk_v6_g4_location_types.csv'
owner_rows = read(GB / G4_OWNER)
owner = {row['g4_location_type']: row for row in owner_rows}
assert len(owner) == len(owner_rows)


def owner_pf(term):
    row = owner.get(term)
    if not row or row['mapping_status'] != 'mapped':
        return None
    ids = row['pf_ids'].split(';')
    return ids[0] if len(ids) == 1 and ids[0] in pf_kind else None


def named_g4(record):
    return {term.strip() for term in record['typical_g4_location_types'].split(';') if term.strip()}


def named_work(record):
    return {term.strip() for term in record['where_work_happens'].split(';') if term.strip()}
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

# G4: only an exact occupation token with one mapped PF in the places owner.
# Multivalued owner rows remain gaps; no occupation-specific choice is evidenced.
# W: only complete semicolon-delimited terms explicitly naming one PF.
# No substring matching (for example, "зимовье" does not name "зимник").
w_pf = {'зимник': 'pf_winter_ice_crossing', 'погост': 'pf_churchyard',
        'болото': 'pf_bog', 'скотный двор': 'pf_outbuildings',
        'поле': 'pf_arable_field', 'покос': 'pf_hay_meadow',
        'рыболовный стан': 'pf_fishing_camp', 'торг': 'pf_market_square',
        'церковный двор': 'pf_churchyard'}
for occupation, record in occupations.items():
    for term in named_g4(record):
        pf = owner_pf(term)
        if pf:
            add(occupation, pf, 'source',
                max(tsv_confidence[record['confidence']], owner[term]['confidence']),
                f'tsv:occ:{occupation}#typical_g4_location_types')
            links[(occupation, pf)]['refs'].add(f'{G4_OWNER}#g4_location_type={term}')
            links[(occupation, pf)]['refs'].update(owner[term]['source_refs'].split(';'))
    for term in named_work(record):
        pf = w_pf.get(term)
        if pf:
            add(occupation, pf, 'source', tsv_confidence[record['confidence']],
                f'tsv:occ:{occupation}#where_work_happens')

assert 'пастух' in occupations['nov_occ_herder']['occupation_title']
add('nov_occ_herder', 'pf_pasture', 'rule', 'C',
    'tsv:occ:nov_occ_herder#occupation_title')
assert 'охотник' in occupations['nov_occ_hunter_trapper']['occupation_title']
add('nov_occ_hunter_trapper', 'pf_hunting_ground', 'rule', 'C',
    'tsv:occ:nov_occ_hunter_trapper#occupation_title')
rows = []
for (occupation, pf), link in sorted(links.items()):
    rows.append((occupation, pf, pf_kind[pf], 'source' if 'source' in link['basis'] else 'rule',
                 min(link['confidence']), ';'.join(sorted(link['refs'])),
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
    # Independently compare each parseable G4 token to the current owner row.
    linked = {(row['occupation_id'], row['pf_id']) for row in actual if row['basis'] != 'no_source'}
    for occupation, record in occupations.items():
        for term in named_g4(record):
            owner_row = owner.get(term)
            if owner_row and owner_row['mapping_status'] == 'mapped' and len(owner_row['pf_ids'].split(';')) == 1:
                pf = owner_row['pf_ids']
                assert pf in pf_kind, (term, pf)
                assert (occupation, pf) in linked, (occupation, term, pf)
                row = next(row for row in actual if row['occupation_id'] == occupation and row['pf_id'] == pf)
                assert f'{G4_OWNER}#g4_location_type={term}' in row['source_refs'].split(';')
                assert set(owner_row['source_refs'].split(';')) <= set(row['source_refs'].split(';'))
                assert row['confidence'] <= max(tsv_confidence[record['confidence']], owner_row['confidence'])
        for term, pf in w_pf.items():
            if term in named_work(record):
                assert (occupation, pf) in linked, (occupation, term, pf)
    herder = next(row for row in actual if row['occupation_id'] == 'nov_occ_herder'
                  and row['pf_id'] == 'pf_pasture')
    assert herder['basis'] == 'rule' and herder['confidence'] == 'C'
    hunter = next(row for row in actual if row['occupation_id'] == 'nov_occ_hunter_trapper'
                  and row['pf_id'] == 'pf_hunting_ground')
    assert hunter['basis'] == 'rule' and hunter['confidence'] == 'C'
    smith = next(row for row in actual if row['occupation_id'] == 'nov_occ_blacksmith'
                 and row['pf_id'] == 'pf_smithy')
    assert smith['confidence'] == 'A' and smith['workshop_ids'] == 'ws_smithy_town'
else:
    TARGET.write_bytes(expected)
print(f'PASS tools occupation crosswalk: {len(rows)} rows, {len(links)} linked pairs, '
      f'{len(linked_pf)} linked PF, {len(unlinked_pf)} no_source PF, {len(families)} total PF')
