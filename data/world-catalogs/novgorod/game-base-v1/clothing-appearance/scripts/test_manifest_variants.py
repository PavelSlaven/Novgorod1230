#!/usr/bin/env python3
import csv
import re
import unittest
from pathlib import Path

from build import manifest_garment_variants
from check import variant_disposition_errors


class ManifestVariantTests(unittest.TestCase):
    def test_manifest_garment_variant_projects_to_disposition(self):
        manifest = [{
            'archive_ref': 'catalog_items.csv:SRC001',
            'expected_result': 'variant',
            'target_ref': 'clothing-appearance/garments/garments.csv#gm_existing',
            'reason': 'Represented by the existing garment.',
        }]
        self.assertEqual(manifest_garment_variants(manifest), {
            'SRC001': {
                'disposition': 'variant',
                'target': 'garments/garments.csv#gm_existing',
                'reason': 'Represented by the existing garment.',
            },
        })

    def test_variant_disposition_accepts_valid_target_and_rejects_corrupted_target(self):
        garments = [{'gm_id': 'gm_existing'}]
        valid = {'source_item_id': 'SRC001', 'disposition': 'variant',
                 'target': 'garments/garments.csv#gm_existing'}
        invalid = {'source_item_id': 'SRC001', 'disposition': 'variant',
                   'target': 'garments/garments.csv#gm_missing'}
        self.assertEqual(variant_disposition_errors([valid], garments), [])
        self.assertEqual(len(variant_disposition_errors([invalid], garments)), 1)


class ChintzDenylistTests(unittest.TestCase):
    def setUp(self):
        with open(Path(__file__).parent.parent / 'garments/denylist.csv', encoding='utf-8', newline='') as f:
            self.rx = re.compile(next(r for r in csv.DictReader(f) if r['deny_id'] == 'ANTI017')['pattern'], re.I)

    def test_chintz_forms_are_denied(self):
        for name in ('ситец', 'набивной ситец', 'ситцевая рубаха', 'Ситцевая рубаха'):
            self.assertTrue(self.rx.search(name), name)

    def test_imported_cotton_is_not_denied(self):
        for name in ('привозная хлопчатая ткань', 'привоз хлопка', 'хлопковая ткань из-за моря'):
            self.assertFalse(self.rx.search(name), name)


if __name__ == '__main__':
    unittest.main()
