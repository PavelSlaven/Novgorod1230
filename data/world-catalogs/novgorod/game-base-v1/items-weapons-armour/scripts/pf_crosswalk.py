#!/usr/bin/env python3
"""Build or check candidate role, weapon-tier and place-family links."""
import csv
import io
import sys
from pathlib import Path

GROUP = Path(__file__).resolve().parents[1]
GB = GROUP.parent
REPO = GROUP.parents[4]
TARGET = GROUP / 'items/role_tier_pf_crosswalk.csv'


def read(path, delimiter=','):
    with path.open(encoding='utf-8-sig', newline='') as file:
        return list(csv.DictReader(file, delimiter=delimiter))


def split(value):
    return [part.strip() for part in value.split(' | ') if part.strip()]


families = read(GB / 'places-binding/places/place_families.csv')
pf_kind = {row['pf_id']: row['pf_kind'] for row in families}
assert len(pf_kind) == len(families) and len(set(pf_kind.values())) == 16
roles = {row['role_id'] for row in read(REPO / 'data/novgorod-region/novgorod_social_roles_v1_enriched.tsv', '\t')}
weapon_rows = read(GROUP / 'items/weapons_armour.csv')
weapon_tier = {row['wp_id']: row['effective_tier'] for row in weapon_rows}
assert len(weapon_tier) == len(weapon_rows)
tiers = set(weapon_tier.values())
access_rows = read(GROUP / 'items/weapon_status_access.csv')
access = {(row['role_id'], row['tier']): row['access_level'] for row in access_rows}
assert len(access) == len(access_rows)
assert all(role in roles and tier in tiers for role, tier in access)
assert set(access) == {(role, tier) for role in roles for tier in tiers}
equipment = {}
for row in read(GROUP / 'items/weapon_equipment_profiles.csv'):
    assert row['wp_id'] in weapon_tier
    equipment.setdefault(row['profile_id'], []).append(row)
links = {}
equipped = {}
for row in read(GROUP / 'military/security.csv'):
    profiles = split(row['equipment_profile_ref'])
    assert all(profile in equipment for profile in profiles)
    for role in split(row['roles']):
        assert role in roles, (row['ms_id'], role)
        for slug in split(row['pf_ids']):
            pf = 'pf_' + slug
            assert pf in pf_kind, (row['ms_id'], pf)
            for key in access:
                if key[0] == role:
                    links.setdefault((role, key[1], pf), set()).add(row['ms_id'])
            for profile in profiles:
                for entry in equipment[profile]:
                    if entry['role_id'] == role:
                        key = (role, weapon_tier[entry['wp_id']], pf)
                        assert key[:2] in access, (row['ms_id'], entry['entry_id'], key)
                        equipped.setdefault(key, set()).add(entry['entry_id'])
rows = []
for (role, tier, pf), security_ids in sorted(links.items()):
    entries = equipped.get((role, tier, pf), set())
    rows.append((role, tier, pf, pf_kind[pf], access[(role, tier)], 'source' if entries else 'rule',
                 ';'.join(sorted(security_ids)), ';'.join(sorted(entries)), 'scripts/pf_crosswalk.py#links', 'candidate'))
for pf in sorted(pf_kind.keys() - {pf for _, _, pf in links}):
    rows.append(('', '', pf, pf_kind[pf], '', 'no_source', '', '', '', 'candidate'))
for role, tier in sorted(access.keys() - {(role, tier) for role, tier, _ in links}):
    rows.append((role, tier, '', '', access[(role, tier)], 'no_source', '', '', '', 'candidate'))
assert len({(row[0], row[1], row[2]) for row in rows}) == len(rows)
assert {row[2] for row in rows if row[2]} == set(pf_kind)
assert {(row[0], row[1]) for row in rows if row[0]} == set(access)
buf = io.StringIO(newline='')
writer = csv.writer(buf, lineterminator='\n')
writer.writerow(('role_id', 'tier', 'pf_id', 'pf_kind', 'access_level', 'basis', 'security_ids', 'equipment_entry_ids', 'rule_ref', 'status'))
writer.writerows(rows)
expected = buf.getvalue().encode('utf-8')
if '--check' in sys.argv:
    assert TARGET.read_bytes() == expected, 'role_tier_pf_crosswalk.csv differs from source data'
else:
    TARGET.write_bytes(expected)
print(f'PASS weapons role-tier crosswalk: {len(rows)} rows, {len(families)} PF, 16 kinds')
