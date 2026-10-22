#!/usr/bin/env python3
"""Classify the native [novgorod_live] console report against reviewed failures."""

from collections import Counter
import json
import os
from pathlib import Path
import re
import sys


EXCEPTION = "EXCEPTION:NOVGOROD_NATIVE_OPERATION_ALREADY_ACTIVE"
ALL_PASSED = re.compile(r"^All tests passed \((\d+) (assertion|assertions) in (\d+) (test case|test cases)\)$")
TOTAL_ROW = re.compile(r"^(test cases|assertions):\s*(.+)$")
COUNT_COLUMN = re.compile(r"^(\d+)\s+(passed|failed|failed as expected)$")
FAILED_LINE = re.compile(r"^\s*[^\n]*:\d+: FAILED:\s*$")
SEPARATOR = re.compile(r"^-{20,}$")


def parse_total_row(payload):
    parts = [part.strip() for part in payload.split("|")]
    if parts[0] == "- none -":
        total = 0
    elif parts[0].isdigit():
        total = int(parts[0])
    else:
        return None
    if total > 0 and len(parts) == 1:
        return None
    counts = {"passed": 0, "failed": 0, "failed as expected": 0}
    seen = set()
    for part in parts[1:]:
        match = COUNT_COLUMN.fullmatch(part)
        if match is None or match[2] in seen:
            return None
        counts[match[2]] = int(match[1])
        seen.add(match[2])
    return total, counts, sum(counts.values()) == total


def parse_totals(rows):
    all_passed = []
    cases = []
    assertions = []
    no_tests = False
    for row in rows:
        line = row.strip()
        if line == "No tests ran":
            no_tests = True
        passed_match = ALL_PASSED.fullmatch(line)
        if passed_match:
            all_passed.append(passed_match)
        row_match = TOTAL_ROW.fullmatch(line)
        if row_match:
            (cases if row_match[1] == "test cases" else assertions).append(row_match[2])
    if no_tests:
        return None
    if len(all_passed) == 1 and not cases and not assertions:
        passed_match = all_passed[0]
        assertion_total = int(passed_match[1])
        total = int(passed_match[3])
        if passed_match[2] != ("assertion" if assertion_total == 1 else "assertions"):
            return None
        if passed_match[4] != ("test case" if total == 1 else "test cases"):
            return None
        return total, 0, assertion_total, 0, True
    if all_passed or len(cases) != 1 or len(assertions) != 1:
        return None
    case_counts = parse_total_row(cases[0])
    assertion_counts = parse_total_row(assertions[0])
    if case_counts is None or assertion_counts is None:
        return None
    return (
        case_counts[0], case_counts[1]["failed"],
        assertion_counts[0], assertion_counts[1]["failed"],
        case_counts[2] and assertion_counts[2],
    )


def classify(log_path, list_path, status, summary_path, baseline_path=None):
    if baseline_path is None:
        baseline_path = Path(__file__).with_name("native-live-known-failures.json")
    baseline = json.loads(Path(baseline_path).read_text(encoding="utf-8"))
    raw = Path(log_path).read_text(encoding="utf-8")
    rows = raw.splitlines()
    listed = {
        line.strip()
        for line in Path(list_path).read_text(encoding="utf-8").splitlines()
        if line.strip()
    }
    observed = {}
    problems = []
    current = None
    for index, row in enumerate(rows):
        if SEPARATOR.fullmatch(row) and index + 1 < len(rows):
            candidate = rows[index + 1].strip()
            if candidate in listed:
                current = candidate
        if not FAILED_LINE.fullmatch(row):
            continue
        block = []
        for following in rows[index + 1:index + 13]:
            if FAILED_LINE.fullmatch(following) or SEPARATOR.fullmatch(following):
                break
            block.append(following)
        if "NOVGOROD_NATIVE_OPERATION_ALREADY_ACTIVE" in "\n".join(block):
            signature = EXCEPTION
        else:
            signature = next((line.strip() for line in block if line.strip()), "")
        if current is None or not signature:
            problems.append(f"Не удалось разобрать упавшее утверждение в строке {index + 1}")
            continue
        observed.setdefault(current, Counter())[signature] += 1

    missing_list = set(baseline) - listed
    if missing_list:
        problems.append("В списке тестов отсутствуют известные случаи: " + ", ".join(sorted(missing_list)))

    totals = parse_totals(rows)
    if totals is None:
        total = failed = assertion_failed = -1
        problems.append("Нет полной читаемой сводки Catch2")
    else:
        total, failed, assertion_total, assertion_failed, consistent = totals
        if not consistent:
            problems.append("Числа в сводке Catch2 противоречат друг другу")
        if total < 27:
            problems.append(f"Исполнено {total} live случаев вместо ожидаемых минимум 27")
        if len(listed) != total:
            problems.append(f"Список содержит {len(listed)} live случаев, Catch2 сообщил {total}")
        if failed != len(observed):
            problems.append(f"Catch2 сообщил {failed} упавших случаев, разобрано {len(observed)}")
        observed_assertions = sum(sum(counts.values()) for counts in observed.values())
        if assertion_failed != observed_assertions:
            problems.append(f"Catch2 сообщил {assertion_failed} упавших утверждений, разобрано {observed_assertions}")
        if (status == 0) != (failed == 0):
            problems.append(f"Код выхода {status} расходится со сводкой Catch2")

    for name, entry in baseline.items():
        expected = Counter(entry["assertions"])
        actual = observed.get(name, Counter())
        for signature, count in (expected - actual).items():
            problems.append(f"Исчезло ожидаемое падение: {name}: {signature}: {count}")
        for signature, count in (actual - expected).items():
            problems.append(f"Новое падение: {name}: {signature}: {count}")
    for name, signatures in observed.items():
        if name not in baseline:
            problems.append(f"Новый упавший случай: {name}: {dict(signatures)}")

    summary = [
        "## Родные тесты CDDA", "",
        f"Тег [novgorod_live]: {total} случаев; {failed} случаев с падениями; {assertion_failed} упавших утверждений.", "",
        "| Известный случай | Issue | Упавших утверждений |",
        "| --- | --- | ---: |",
    ]
    for name, entry in baseline.items():
        count = sum(observed.get(name, Counter()).values())
        summary.append(f"| {name} | #{entry['issue']} | {count} |")
        if count:
            print(f"::warning title=Known native failure::{name} (#{entry['issue']}): {count} assertion(s); полный лог в артефакте")
    summary.extend(["", "Проверка RNG без режима P4 покрывает базовую сериализацию; ветки ошибок и P4 apply/read требуют отдельного координатора."])
    if problems:
        summary.extend(["", "### Новые проблемы", ""] + [f"- {problem}" for problem in problems])
        for problem in problems:
            print(f"::error title=Native test regression::{problem}")
    content = "\n".join(summary) + "\n"
    Path(summary_path).write_text(content, encoding="utf-8")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as output:
            output.write(content)
    print(content)
    return 1 if problems else 0


def main(argv):
    if len(argv) != 5:
        print("usage: native_live_baseline.py LIVE_LOG TEST_NAMES PROCESS_STATUS SUMMARY_MD", file=sys.stderr)
        return 2
    try:
        status = int(argv[3])
        if status < 0:
            raise ValueError("Отрицательный код выхода процесса")
        return classify(argv[1], argv[2], status, argv[4])
    except (OSError, UnicodeError, ValueError, json.JSONDecodeError) as exc:
        print(f"Не удалось проверить родной live отчёт: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
