"""Synthetic Catch2 reports for the reviewed native live baseline."""

from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import native_live_baseline as baseline


LEGACY_FAILURES = {
    "Novgorod live speech preserves tags and uses actual native hearing": {
        "issue": 856,
        "assertions": {"CHECK_FALSE( heard.empty() )": 2},
    },
    "Novgorod semantic NPC speech shares native CHAT candidates": {
        "issue": 855,
        "assertions": {"CHECK( eligible == expected_eligible )": 1},
    },
    "Novgorod NPC speech keeps native variable tags literal": {
        "issue": 856,
        "assertions": {
            "CHECK( contains( heard, id_text( hearer ) ) )": 1,
            'CHECK( log.find( "<npc_val:task04_secret>" ) != std::string::npos )': 1,
            'CHECK( native_log.find( secret + " end" ) != std::string::npos )': 1,
        },
    },
    "Novgorod NPC silence is visible behaviour without sound": {
        "issue": 855,
        "assertions": {
            "CHECK_FALSE( result.applied )": 1,
            'CHECK( result.json.find( "NOVGOROD_STALE_OR_INVISIBLE_NPC_ACTOR" ) != std::string::npos )': 1,
            "CHECK( message_log() == log_before )": 1,
            "CHECK( memory_raw( speaker ).empty() )": 1,
        },
    },
    "Novgorod speech refusals leave the native world unchanged": {
        "issue": 854,
        "assertions": {baseline.EXCEPTION: 1},
    },
    "Novgorod conversation memory records what was heard said and kept silent": {
        "issue": 854,
        "assertions": {baseline.EXCEPTION: 4},
    },
    "Novgorod frame exports NPC identity opinion memory and visible items": {
        "issue": 854,
        "assertions": {baseline.EXCEPTION: 2},
    },
    "Novgorod whispered avatar speech is heard only as far as native sound reaches": {
        "issue": 854,
        "assertions": {baseline.EXCEPTION: 2},
    },
}


class NativeLiveBaselineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.expected = LEGACY_FAILURES

    def make_report(self, failures=None, complete=True):
        if failures is None:
            failures = {name: dict(entry["assertions"]) for name, entry in self.expected.items()}
        rows = []
        for name, signatures in failures.items():
            if not signatures:
                continue
            rows.extend(["-" * 79, name, "-" * 79, "test.cpp:1", "." * 79])
            for signature, count in signatures.items():
                for _ in range(count):
                    rows.append("test.cpp:2: FAILED:")
                    if signature == baseline.EXCEPTION:
                        rows.extend(["  {Unknown expression after the reported line}", "due to unexpected exception with messages:", "  NOVGOROD_NATIVE_OPERATION_ALREADY_ACTIVE"])
                    else:
                        rows.append("  " + signature)
        failed_cases = sum(bool(signatures) for signatures in failures.values())
        failed_assertions = sum(sum(signatures.values()) for signatures in failures.values())
        if complete:
            rows.extend([
                "=" * 79,
                f"test cases:   27 |   {27 - failed_cases} passed |  {failed_cases} failed",
                f"assertions: 100 | {100 - failed_assertions} passed | {failed_assertions} failed",
            ])
        return "\n".join(rows) + "\n"

    def check_report(self, report, status, listed=None, known=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log, names, summary = (root / name for name in ("live.log", "names.txt", "summary.md"))
            log.write_text(report, encoding="utf-8")
            if listed is None:
                listed = list(self.expected) + [f"Passing case {index}" for index in range(19)]
            names.write_text("\n".join(listed) + "\n", encoding="utf-8")
            baseline_path = root / "known.json"
            baseline_path.write_text(json.dumps(self.expected if known is None else known), encoding="utf-8")
            with redirect_stdout(StringIO()):
                result = baseline.classify(log, names, status, summary, baseline_path)
            return result, summary.read_text(encoding="utf-8")

    def test_exact_baseline(self):
        result, summary = self.check_report(self.make_report(), 19)
        self.assertEqual(result, 0, summary)
        for issue in ("#854", "#855", "#856"):
            self.assertIn(issue, summary)

    def test_new_assertion(self):
        failures = {name: dict(entry["assertions"]) for name, entry in self.expected.items()}
        failures[next(iter(failures))]["CHECK( unexpected )"] = 1
        result, summary = self.check_report(self.make_report(failures), 20)
        self.assertEqual(result, 1)
        self.assertIn("Новое падение", summary)

    def test_new_failing_case(self):
        failures = {name: dict(entry["assertions"]) for name, entry in self.expected.items()}
        new_name = "A newly failing case"
        failures[new_name] = {"CHECK( new_case )": 1}
        names = list(self.expected) + [new_name] + [f"Passing case {index}" for index in range(18)]
        result, summary = self.check_report(self.make_report(failures), 20, names)
        self.assertEqual(result, 1)
        self.assertIn("Новый упавший случай", summary)

    def test_expected_failure_disappears(self):
        failures = {name: dict(entry["assertions"]) for name, entry in self.expected.items()}
        failures.pop(next(iter(failures)))
        result, summary = self.check_report(self.make_report(failures), 17)
        self.assertEqual(result, 1)
        self.assertIn("Исчезло ожидаемое падение", summary)

    def test_incomplete_report(self):
        result, summary = self.check_report(self.make_report(complete=False), 19)
        self.assertEqual(result, 1)
        self.assertIn("Нет полной читаемой сводки Catch2", summary)

    def test_nonzero_exit_without_failed_cases(self):
        result, summary = self.check_report(self.make_report({}), 1)
        self.assertEqual(result, 1)
        self.assertIn("Код выхода 1 расходится", summary)

    def test_all_passed_with_empty_baseline(self):
        names = [f"Passing case {index}" for index in range(29)]
        result, summary = self.check_report(
            "All tests passed (2740 assertions in 29 test cases)\n", 0, names, known={}
        )
        self.assertEqual(result, 0, summary)
        self.assertIn("29 случаев; 0 случаев с падениями; 0 упавших утверждений", summary)

    def test_all_passed_with_known_failures(self):
        names = list(self.expected) + [f"Passing case {index}" for index in range(21)]
        result, summary = self.check_report(
            "All tests passed (2740 assertions in 29 test cases)\n", 0, names, known=self.expected
        )
        self.assertEqual(result, 1)
        self.assertIn("Исчезло ожидаемое падение", summary)

    def test_all_passed_singular_counts(self):
        result, summary = self.check_report(
            "All tests passed (1 assertion in 1 test case)\n", 0, ["Only case"], known={}
        )
        self.assertEqual(result, 1)
        self.assertIn("1 случаев; 0 случаев с падениями; 0 упавших утверждений", summary)
        self.assertNotIn("Нет полной читаемой сводки Catch2", summary)

    def test_no_tests_ran(self):
        result, summary = self.check_report("No tests ran\n", 0, [], known={})
        self.assertEqual(result, 1)
        self.assertIn("Нет полной читаемой сводки Catch2", summary)

    def test_failed_as_expected_table(self):
        report = (
            "test cases: 27 | 26 passed | 1 failed as expected\n"
            "assertions: 100 | 99 passed | 1 failed as expected\n"
        )
        names = [f"Passing case {index}" for index in range(27)]
        result, summary = self.check_report(report, 0, names, known={})
        self.assertEqual(result, 0, summary)
        self.assertIn("27 случаев; 0 случаев с падениями; 0 упавших утверждений", summary)

    def test_current_baseline_is_empty(self):
        current = Path(baseline.__file__).with_name("native-live-known-failures.json")
        self.assertEqual(json.loads(current.read_text(encoding="utf-8")), {})


if __name__ == "__main__":
    unittest.main()
