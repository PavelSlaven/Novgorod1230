#!/usr/bin/env python3
import csv
import json
import tempfile
import unittest
from pathlib import Path

import check


class GroupHasDecisionTests(unittest.TestCase):
    def test_foreign_ledger_and_manifest_schemas(self):
        old_nov = check.NOV
        with tempfile.TemporaryDirectory() as tmp:
            try:
                check.NOV = Path(tmp)
                group_root = check.NOV / 'game-base-v1' / 'crafts-tools-processes'
                group_root.mkdir(parents=True)
                ledger = group_root / 'archive_inclusion_ledger.csv'
                fields = ['archive_ref', 'record_type', 'disposition', 'status']
                cases = [
                    ('needs_check', 'needs_check', 'needs_check', False),
                    ('new', 'include', 'candidate', True),
                    ('variant', 'include', 'candidate', True),
                ]
                for record_type, disposition, status, expected in cases:
                    with self.subTest(record_type=record_type):
                        with ledger.open('w', encoding='utf-8', newline='') as stream:
                            writer = csv.DictWriter(stream, fieldnames=fields)
                            writer.writeheader()
                            writer.writerow({'archive_ref': 'source.csv:OMI00263',
                                             'record_type': record_type,
                                             'disposition': disposition, 'status': status})
                        self.assertEqual(check.group_has_decision('crafts-tools-processes', 'source.csv:OMI00263'),
                                         expected)

                ledger.unlink()
                manifest_path = group_root / 'authoring' / 'archive_inclusion_manifest.json'
                manifest_path.parent.mkdir()
                for result, expected in [('entity', True), ('routed', False), ('needs_check', False)]:
                    with self.subTest(expected_result=result):
                        manifest_path.write_text(json.dumps({'records': [{
                            'archive_ref': 'source.csv:OMI00263', 'expected_result': result,
                        }]}), encoding='utf-8')
                        self.assertEqual(check.group_has_decision('crafts-tools-processes', 'source.csv:OMI00263'),
                                         expected)
            finally:
                check.NOV = old_nov


if __name__ == '__main__':
    unittest.main()
