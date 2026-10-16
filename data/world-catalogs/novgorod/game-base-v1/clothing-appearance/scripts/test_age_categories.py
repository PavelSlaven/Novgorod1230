#!/usr/bin/env python3
import json
import unittest
from pathlib import Path

from build import ACTOR_AGE_CATEGORIES_PATH, ADULT_AGES, REPO, load_actor_age_categories
from check import vocab


class ActorAgeCategoriesTests(unittest.TestCase):
    def test_clothing_tools_read_actor_owner_json_relative_to_checkout(self):
        expected_path = REPO / 'packages' / 'actors' / 'src' / 'actor-age-categories.json'
        expected = json.loads(expected_path.read_text(encoding='utf-8'))

        self.assertEqual(ACTOR_AGE_CATEGORIES_PATH, expected_path)
        self.assertEqual(load_actor_age_categories(), expected)
        self.assertEqual(ADULT_AGES, expected)
        self.assertEqual(vocab()['age_category'], expected)

    def test_missing_actor_age_source_fails_without_fallback(self):
        missing = Path(REPO) / 'packages' / 'actors' / 'src' / 'missing-age-categories.json'
        with self.assertRaises(FileNotFoundError):
            load_actor_age_categories(missing)


if __name__ == '__main__':
    unittest.main()
