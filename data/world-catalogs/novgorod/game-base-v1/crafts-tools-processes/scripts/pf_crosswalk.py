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
occupations = {row['occupation_id'] for row in read(REPO / 'data/novgorod-region/novgorod_occupations_v1_enriched.tsv', '\t')}
tool_rows = read(GROUP / 'craft_tools_gear/tools_gear.csv')
tools = {row['tl_id']: row for row in tool_rows}
assert len(tools) == len(tool_rows)
links = {}
for row in read(GROUP / 'craft_tools_gear/occupation_tools.csv'):
    occupation, tool_id = row['occupation_id'], row['tl_id']
    assert occupation in occupations and tool_id in tools, (occupation, tool_id)
    pf = 'pf_' + tools[tool_id]['workplace_pf_id']
    assert pf in pf_kind, (tool_id, pf)
    links.setdefault((occupation, pf), (set(), set()))[0].add(tool_id)
for row in read(GROUP / 'workshops/workshops.csv'):
    pf = 'pf_' + row['pf_id']
    assert pf in pf_kind, (row['ws_id'], pf)
    for occupation in row['occupations'].split(';'):
        occupation = occupation.strip()
        if occupation:
            assert occupation in occupations, (row['ws_id'], occupation)
            links.setdefault((occupation, pf), (set(), set()))[1].add(row['ws_id'])
rows = []
for (occupation, pf), (tool_ids, workshop_ids) in sorted(links.items()):
    rows.append((occupation, pf, pf_kind[pf], 'source', ';'.join(sorted(tool_ids)), ';'.join(sorted(workshop_ids)), 'scripts/pf_crosswalk.py#links', 'candidate'))
for pf in sorted(pf_kind.keys() - {pf for _, pf in links}):
    rows.append(('', pf, pf_kind[pf], 'no_source', '', '', '', 'candidate'))
for occupation in sorted(occupations - {occupation for occupation, _ in links}):
    rows.append((occupation, '', '', 'no_source', '', '', '', 'candidate'))
assert len({(row[0], row[1]) for row in rows}) == len(rows)
assert {row[1] for row in rows if row[1]} == set(pf_kind)
buf = io.StringIO(newline='')
writer = csv.writer(buf, lineterminator='\n')
writer.writerow(('occupation_id', 'pf_id', 'pf_kind', 'basis', 'tool_ids', 'workshop_ids', 'rule_ref', 'status'))
writer.writerows(rows)
expected = buf.getvalue().encode('utf-8')
if '--check' in sys.argv:
    assert TARGET.read_bytes() == expected, 'occupation_pf_crosswalk.csv differs from source data'
else:
    TARGET.write_bytes(expected)
print(f'PASS tools occupation crosswalk: {len(rows)} rows, {len(families)} PF, 16 kinds')
