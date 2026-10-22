"""Synthetic Catch2 reports for the reviewed native live baseline."""

from contextlib import redirect_stdout
from io import StringIO
import json
from pathlib import Path
import tempfile
import unittest

import native_live_baseline as baseline


class NativeLiveBaselineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.expected = json.loads(Path(baseline.__file__).with_name("native-live-known-failures.json").read_text(encoding="utf-8"))

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

    def check_report(self, report, status, listed=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            log, names, summary = (root / name for name in ("live.log", "names.txt", "summary.md"))
            log.write_text(report, encoding="utf-8")
            if listed is None:
                listed = list(self.expected) + [f"Passing case {index}" for index in range(19)]
            names.write_text("\n".join(listed) + "\n", encoding="utf-8")
            with redirect_stdout(StringIO()):
                result = baseline.classify(log, names, status, summary)
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


if __name__ == "__main__":
    unittest.main()
