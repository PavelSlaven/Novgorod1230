#!/usr/bin/env python3
"""Build or check candidate household-type to place-family links."""
import csv
import io
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GROUP = Path(__file__).resolve().parents[1]
TARGET = GROUP / 'food/household_type_pf_crosswalk.csv'


def read(path):
    with path.open(encoding='utf-8-sig', newline='') as file:
        return list(csv.DictReader(file))


families = read(ROOT / 'places-binding/places/place_families.csv')
households = {row['household_type'] for row in read(GROUP / 'food/household_food_stock_profiles.csv')}
urban = {'hh_poor_urban', 'hh_artisan_urban', 'hh_merchant_urban', 'hh_boyar_urban'}
links = {
    'pf_town_courtyard': urban,
    'pf_dwelling_interior': urban | {'hh_rural_smerd'},
    'pf_rural_yard': {'hh_rural_smerd'},
    'pf_peasant_homestead': {'hh_rural_smerd'},
    'pf_monastery_yard': {'hh_monastery'},
}
assert {h for values in links.values() for h in values} <= households
assert set(links) <= {row['pf_id'] for row in families}
assert len({row['pf_kind'] for row in families}) == 16
rows = []
for family in families:
    pf = family['pf_id']
    for household in sorted(links.get(pf, {''})):
        basis = 'rule' if household else 'no_source'
        rows.append((household, pf, family['pf_kind'], basis,
                     'food/household_food_stock_profiles.csv;places-binding/places/place_families.csv' if household else '',
                     'scripts/pf_crosswalk.py#links' if household else '', 'candidate'))
for household in sorted(households - {h for values in links.values() for h in values}):
    rows.append((household, '', '', 'no_source', '', '', 'candidate'))
assert len({(row[0], row[1]) for row in rows}) == len(rows)
assert {row[1] for row in rows if row[1]} == {family['pf_id'] for family in families}
buf = io.StringIO(newline='')
writer = csv.writer(buf, lineterminator='\n')
writer.writerow(('household_type', 'pf_id', 'pf_kind', 'basis', 'source_refs', 'rule_ref', 'status'))
writer.writerows(rows)
expected = buf.getvalue().encode('utf-8')
if '--check' in sys.argv:
    assert TARGET.read_bytes() == expected, 'household_type_pf_crosswalk.csv differs from source data'
else:
    TARGET.write_bytes(expected)
print(f'PASS food household crosswalk: {len(rows)} rows, {len(families)} PF, 16 kinds')
