import csv
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CROSSWALK = ROOT / "data/world-catalogs/novgorod/game-base-v1/mtype_taxon_crosswalk.csv"
POLICY = ROOT / "tools/cataclysm-prototype/dev-world/fauna-policy.json"
ZOMBIFY_OPTION = ROOT / "tools/cataclysm-prototype/dev-world/fauna-zombify-option.json"
FAUNA_TABLES = (
    "fauna-mammals-birds/fauna/mammals.csv",
    "fauna-mammals-birds/fauna/birds.csv",
    "fauna-fish-invertebrates-livestock/fauna/fish.csv",
    "fauna-fish-invertebrates-livestock/fauna/invertebrates_herps.csv",
    "fauna-fish-invertebrates-livestock/fauna/livestock_species.csv",
)


class FaunaCatalogModSyncTest(unittest.TestCase):
    def test_policy_matches_catalog(self):
        self.assertTrue(CROSSWALK.is_file(), str(CROSSWALK))
        self.assertTrue(POLICY.is_file(), str(POLICY))
        catalog = ROOT / "data/world-catalogs/novgorod/game-base-v1"
        taxa = {}
        for relative in FAUNA_TABLES:
            with (catalog / relative).open(encoding="utf-8", newline="") as source:
                for row in csv.DictReader(source):
                    self.assertNotIn(row["fa_id"], taxa)
                    taxa[row["fa_id"]] = row

        decisions = {"allow": set(), "deny": set()}
        with CROSSWALK.open(encoding="utf-8", newline="") as source:
            reader = csv.DictReader(source)
            required = {
                "mtype_id", "decision", "catalog_taxon_id", "catalog_status",
                "native_species", "native_json_ref", "catalog_evidence_ref",
                "catalog_evidence_quote", "reason", "subspecies_note",
            }
            self.assertTrue(required <= set(reader.fieldnames or []))
            seen = set()
            for row in reader:
                mid = row["mtype_id"]
                self.assertTrue(mid.startswith("mon_"))
                self.assertNotIn(mid, seen)
                seen.add(mid)
                decision = row["decision"]
                self.assertIn(decision, decisions)
                decisions[decision].add(mid)
                self.assertRegex(row["native_json_ref"], r":\d+$")
                self.assertTrue(row["native_species"])
                self.assertTrue(row["reason"])
                if decision == "allow":
                    taxon = row["catalog_taxon_id"]
                    self.assertIn(taxon, taxa)
                    self.assertEqual(row["catalog_status"], taxa[taxon]["status"])
                    self.assertRegex(row["catalog_evidence_ref"], r":\d+$")
                    self.assertTrue(row["catalog_evidence_quote"])

        with POLICY.open(encoding="utf-8") as source:
            definitions = json.load(source)
        self.assertIsInstance(definitions, list)
        policy = {"MONSTER_BLACKLIST": None, "MONSTER_WHITELIST": None}
        for definition in definitions:
            kind = definition.get("type")
            self.assertIn(kind, policy)
            self.assertIsNone(policy[kind])
            ids = definition["monsters"]
            self.assertTrue(all(isinstance(mid, str) for mid in ids))
            self.assertEqual(len(ids), len(set(ids)))
            policy[kind] = set(ids)
        self.assertTrue(all(value is not None for value in policy.values()))
        self.assertFalse(policy["MONSTER_BLACKLIST"] & policy["MONSTER_WHITELIST"])
        self.assertEqual(decisions["deny"], policy["MONSTER_BLACKLIST"])
        self.assertEqual(decisions["allow"], policy["MONSTER_WHITELIST"])

    def test_evidence_quote_matches_source_line(self):
        with CROSSWALK.open(encoding="utf-8", newline="") as source:
            for row in csv.DictReader(source):
                if row["decision"] != "allow":
                    continue
                relative, number = row["catalog_evidence_ref"].rsplit(":", 1)
                path = ROOT / relative
                self.assertTrue(path.is_file(), str(path))
                lines = path.read_text(encoding="utf-8").splitlines()
                self.assertLessEqual(int(number), len(lines))
                quote = " ".join(row["catalog_evidence_quote"].split())
                source_line = " ".join(lines[int(number) - 1].replace('""', '"').split())
                with self.subTest(mtype_id=row["mtype_id"], reference=row["catalog_evidence_ref"]):
                    self.assertIn(quote, source_line)

    def test_owner_decisions_for_birds_and_dogs(self):
        with CROSSWALK.open(encoding="utf-8", newline="") as source:
            rows = {row["mtype_id"]: row for row in csv.DictReader(source)}
        with POLICY.open(encoding="utf-8") as source:
            definitions = json.load(source)
        policy = {entry["type"]: set(entry["monsters"]) for entry in definitions}

        allowed_adults = {
            "mon_dog", "mon_dog_auscattle", "mon_dog_bcollie",
            "mon_dog_beagle", "mon_dog_boxer", "mon_dog_bull",
            "mon_dog_dachshund", "mon_dog_gpyrenees", "mon_dog_gshepherd",
            "mon_dog_pitbullmix", "mon_dog_rottweiler", "mon_dog_samoyed",
            "mon_dog_wad",
        }
        allowed = {"mon_raven", "mon_goose"}
        allowed.update(allowed_adults)
        allowed.update(adult + "_pup" for adult in allowed_adults)
        denied = {"mon_dog_chihuahua", "mon_dog_chihuahua_pup"}
        denied.update(mid for mid in rows if mid.startswith("mon_dog_mutant_"))
        denied.update({
            "mon_dog_antimemetic", "mon_dog_incorporeal",
            "mon_dog_telekenetic",
        })
        self.assertTrue(any(mid.startswith("mon_dog_mutant_") for mid in denied))
        self.assertEqual(len(allowed), 28)

        for mid in sorted(allowed):
            with self.subTest(mtype_id=mid, decision="allow"):
                self.assertIn(mid, rows)
                self.assertEqual(rows[mid]["decision"], "allow")
                self.assertIn(mid, policy["MONSTER_WHITELIST"])
                self.assertNotIn(mid, policy["MONSTER_BLACKLIST"])
        for mid in sorted(denied):
            with self.subTest(mtype_id=mid, decision="deny"):
                self.assertIn(mid, rows)
                self.assertEqual(rows[mid]["decision"], "deny")
                self.assertIn(mid, policy["MONSTER_BLACKLIST"])
                self.assertNotIn(mid, policy["MONSTER_WHITELIST"])

    def test_owner_decisions_for_other_natural_fauna(self):
        allowed = {
            'mon_bat', 'mon_bear', 'mon_bear_cub',
            'mon_beaver', 'mon_black_rat', 'mon_bobcat',
            'mon_cat_calico', 'mon_cat_calico_kitten', 'mon_cat_chonker',
            'mon_cat_chonker_kitten', 'mon_cat_longhair', 'mon_cat_longhair_kitten',
            'mon_cat_maine_coon', 'mon_cat_maine_coon_kitten', 'mon_chickadee',
            'mon_coot', 'mon_coyote', 'mon_crow',
            'mon_deer', 'mon_deer_fawn', 'mon_ferret',
            'mon_fish_brook_trout', 'mon_fish_bullhead', 'mon_fish_bullhead_yellow',
            'mon_fish_channel_catfish', 'mon_fish_eel', 'mon_fish_fallfish',
            'mon_fish_kokanee_salmon', 'mon_fish_lbass', 'mon_fish_muskellunge',
            'mon_fish_perch', 'mon_fish_pickerel', 'mon_fish_pickerel_american',
            'mon_fish_rainbow_trout', 'mon_fish_sbass', 'mon_fish_sturgeon_lake',
            'mon_fish_sturgeon_shortnose', 'mon_fish_walleye', 'mon_fish_white_catfish',
            'mon_fish_whitefish', 'mon_fish_whitefish_round', 'mon_foul_toad',
            'mon_fowler_tadpole', 'mon_fowler_toad', 'mon_fox_gray',
            'mon_freedom_tadpole', 'mon_freedom_toad', 'mon_gartersnake',
            'mon_gray_frog', 'mon_gray_tadpole', 'mon_green_frog',
            'mon_green_tadpole', 'mon_hare', 'mon_lemming',
            'mon_leo_frog', 'mon_leo_tadpole', 'mon_mink',
            'mon_mink_frog', 'mon_mink_tadpole', 'mon_mole',
            'mon_muskrat', 'mon_otter', 'mon_peeper_frog',
            'mon_peeper_tadpole', 'mon_pickerel_frog', 'mon_pickerel_tadpole',
            'mon_robin', 'mon_sewer_rat', 'mon_shrew',
            'mon_skink_fivelined', 'mon_sparrow', 'mon_squirrel',
            'mon_squirrel_red', 'mon_vocal_frog', 'mon_waxwing',
            'mon_weasel', 'mon_wood_frog', 'mon_wood_tadpole',
            'mon_woodpecker', 'mon_wormsnake',
        }
        denied = {
            'mon_cardinal', 'mon_cat_bengal', 'mon_cat_bengal_kitten',
            'mon_cat_devon_rex', 'mon_cat_devon_rex_kitten', 'mon_cat_persian',
            'mon_cat_persian_kitten', 'mon_cat_sphynx', 'mon_cat_sphynx_kitten',
            'mon_cougar', 'mon_cougar_kitten', 'mon_fish_blackfish',
            'mon_fish_bluefin_tuna', 'mon_fish_bluefish', 'mon_fish_bowfin',
            'mon_fish_gar_longnose', 'mon_fish_lobster', 'mon_fish_mackerel',
            'mon_fish_porgy', 'mon_groundhog', 'mon_guinea_fowl',
            'mon_hummingbird', 'mon_llama', 'mon_opossum',
            'mon_porcupine', 'mon_rabbit', 'mon_raccoon',
            'mon_rattlesnake', 'mon_skunk', 'mon_turkey',
            'mon_turkey_domestic', 'mon_turtle_painted', 'mon_turtle_snapping_common',
        }
        self.assertEqual(len(allowed), 80)
        self.assertEqual(len(denied), 33)

        with CROSSWALK.open(encoding="utf-8", newline="") as source:
            rows = {row["mtype_id"]: row for row in csv.DictReader(source)}
        with POLICY.open(encoding="utf-8") as source:
            definitions = json.load(source)
        policy = {entry["type"]: set(entry["monsters"]) for entry in definitions}

        for mid in sorted(allowed):
            with self.subTest(mtype_id=mid, decision="allow"):
                self.assertIn(mid, rows)
                self.assertEqual(rows[mid]["decision"], "allow")
                self.assertIn(mid, policy["MONSTER_WHITELIST"])
                self.assertNotIn(mid, policy["MONSTER_BLACKLIST"])
        for mid in sorted(denied):
            with self.subTest(mtype_id=mid, decision="deny"):
                self.assertIn(mid, rows)
                self.assertEqual(rows[mid]["decision"], "deny")
                self.assertIn(mid, policy["MONSTER_BLACKLIST"])
                self.assertNotIn(mid, policy["MONSTER_WHITELIST"])

    def test_owner_decision_for_siamese_cats(self):
        denied = {"mon_cat_siamese", "mon_cat_siamese_kitten"}
        with CROSSWALK.open(encoding="utf-8", newline="") as source:
            rows = {row["mtype_id"]: row for row in csv.DictReader(source)}
        with POLICY.open(encoding="utf-8") as source:
            definitions = json.load(source)
        policy = {entry["type"]: set(entry["monsters"]) for entry in definitions}

        for mid in sorted(denied):
            with self.subTest(mtype_id=mid, decision="deny"):
                self.assertIn(mid, rows)
                self.assertEqual(rows[mid]["decision"], "deny")
                self.assertIn(mid, policy["MONSTER_BLACKLIST"])
                self.assertNotIn(mid, policy["MONSTER_WHITELIST"])

    def test_zombify_option_is_disabled(self):
        self.assertTrue(ZOMBIFY_OPTION.is_file(), str(ZOMBIFY_OPTION))
        with ZOMBIFY_OPTION.open(encoding="utf-8") as source:
            definitions = json.load(source)
        self.assertEqual(definitions, [{
            "type": "EXTERNAL_OPTION",
            "name": "ZOMBIFY_INTO_ENABLED",
            "stype": "bool",
            "value": False,
        }])


if __name__ == "__main__":
    unittest.main()
