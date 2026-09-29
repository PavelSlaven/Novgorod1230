#!/usr/bin/env python3
import unittest

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


if __name__ == '__main__':
    unittest.main()
