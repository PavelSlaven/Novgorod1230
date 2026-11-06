#!/usr/bin/env python3
import os
import sys
from collections import Counter
from pathlib import Path

sys.dont_write_bytecode = True
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
import importlib.util
import csv
import json
import re


ROOT = Path(__file__).resolve().parents[2]
STAGE3 = Path(__file__).resolve().parent
ETALONS = ROOT / "out" / "etalons"
MAPS_DIR = ETALONS / "out"
REPORT = ETALONS / "check" / "maps-report.md"
JUDGE_DIR = ETALONS / "judge"
MAP_FILES = [f"M{m}-{v}.md" for m in range(1, 9) for v in "AB"]
TSV_FIELDS = ("moment", "variant", "map_number", "fact", "source", "file_line", "fragment")
JUDGE_FIELDS = ("group", "judge", "blind_id", "etalon", "quote", "item", "invention_index")
CLASS_FILES = {
    1: "1-packet.tsv",
    2: "2-game.tsv",
    3: "3-missing.tsv",
    4: "4-added.tsv",
}
BRIEF_FILE = "6-brief.tsv"
BRIEF_ROWS = {
    ("M4-A.md", 25, 51, "hero-lines.md:1"),
    ("M4-A.md", 26, 52, "hero-lines.md:1"),
    ("M4-A.md", 27, 53, "ответ NPC: по брифу"),
    ("M4-A.md", 32, 58, "hero-lines.md:2"),
    ("M4-A.md", 33, 59, "ответ NPC: по брифу"),
    ("M4-A.md", 37, 63, "hero-lines.md:3"),
    ("M4-A.md", 40, 66, "ответ NPC: по брифу"),
    ("M4-B.md", 19, 47, "hero-lines.md:1"),
    ("M4-B.md", 20, 48, "hero-lines.md:1"),
    ("M4-B.md", 26, 54, "ответ NPC: по брифу"),
    ("M4-B.md", 29, 57, "hero-lines.md:2"),
    ("M4-B.md", 30, 58, "ответ NPC: по брифу"),
    ("M4-B.md", 33, 61, "hero-lines.md:3"),
    ("M4-B.md", 37, 65, "ответ NPC: по брифу"),
}
ADDED_PREFIX = "добавлено: "


def load_map_parser():
    path = ETALONS / "check" / "check_maps.py"
    spec = importlib.util.spec_from_file_location("stage3_check_maps", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Не удалось загрузить парсер карт: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def map_rows(parser):
    rows, per_file, errors = [], {}, []
    for name in MAP_FILES:
        path = MAPS_DIR / name
        lines = path.read_text(encoding="utf-8-sig").replace("\r\n", "\n").split("\n")
        heads = [i for i, line in enumerate(lines) if line.strip() == parser.HEADING]
        if len(heads) != 1:
            raise ValueError(f"{name}: заголовок карты найден {len(heads)} раз")
        table = []
        for line_no, line in enumerate(lines[heads[0] + 1 :], heads[0] + 2):
            if line.startswith("|"):
                table.append((line_no, line))
            elif table:
                break
        if len(table) < 2:
            raise ValueError(f"{name}: таблица карты не найдена")
        body = table[2:]
        per_file[name] = len(body)
        moment, variant = name[:-3].split("-")
        for file_line, raw in body:
            cells = parser.split_row(raw)
            if len(cells) != 4:
                errors.append(f"{name}:{file_line}: ожидалось 4 столбца, найдено {len(cells)}")
                continue
            number, fact, source, fragment = cells
            if not number.isdigit() or not parser.fact_of(fact).strip():
                errors.append(f"{name}:{file_line}: неверный номер карты или пустой факт: {raw}")
                continue
            rows.append({
                "moment": moment,
                "variant": variant,
                "map_number": number,
                "key": (int(moment[1:]), variant, int(number)),
                "fact": fact,
                "source": source,
                "source_clean": source.replace("`", "").strip(),
                "file_line": file_line,
                "fragment": fragment,
                "file": name,
            })
    if errors:
        raise ValueError("\n".join(errors))
    return rows, per_file


def classify(row):
    source = row["source_clean"]
    if source.startswith(ADDED_PREFIX):
        return (4, "") if row["variant"] == "B" else (None, "метка «добавлено» вне варианта B")
    if source == "нет в данных":
        return (3, "") if row["variant"] == "A" else (None, "метка «нет в данных» вне варианта A")
    if re.fullmatch(r"packet\.md:\d+", source):
        return 1, ""
    if re.fullmatch(r"(?:digest\.md|npc\.md|INDEX\.md|M2\.req\.txt):\d+", source):
        return 2, ""
    return None, "источник вне заданных четырёх классов"


def is_brief_row(row):
    return (row["file"], int(row["map_number"]), row["file_line"], row["source_clean"]) in BRIEF_ROWS


def report_counts():
    text = REPORT.read_text(encoding="utf-8-sig")
    counts = {name: int(n) for name, n in re.findall(r"^\|\s*(M\d-[AB]\.md)\s*\|\s*(\d+)\s*\|", text, re.M)}
    total = re.search(r"строк карты:\s*(\d+)", text)
    if not total or set(counts) != set(MAP_FILES):
        raise ValueError(f"Не удалось прочитать все числа из {REPORT}")
    return counts, int(total.group(1))


def judge_rows():
    rows = []
    for group in ("g1", "g2"):
        base = JUDGE_DIR / group
        key_data = json.loads((base / "judge-key.json").read_text(encoding="utf-8"))
        text_map = key_data["texts"]
        for judge_no in range(1, 4):
            data = json.loads((base / f"judge{judge_no}.json").read_text(encoding="utf-8"))
            for text in data["texts"]:
                blind_id = text["blind_id"]
                if blind_id not in text_map:
                    raise ValueError(f"{group}/judge{judge_no}: blind_id {blind_id!r} отсутствует в judge-key.json")
                for invention_index, invention in enumerate(text.get("inventions", []), 1):
                    if invention.get("class") == "нужна характеристика":
                        rows.append({
                            "group": group,
                            "judge": f"judge{judge_no}",
                            "blind_id": blind_id,
                            "etalon": text_map[blind_id],
                            "quote": invention.get("quote", ""),
                            "item": invention.get("item", ""),
                            "invention_index": invention_index,
                        })
    return rows


def write_tsv(name, fields, rows):
    with (STAGE3 / name).open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows({field: row[field] for field in fields} for row in rows)


def main():
    parser = load_map_parser()
    rows, per_file = map_rows(parser)
    report_per_file, report_total = report_counts()
    buckets = {number: [] for number in CLASS_FILES}
    brief = []
    unresolved = []
    for row in rows:
        class_no, reason = classify(row)
        if class_no is None:
            if is_brief_row(row):
                brief.append(row)
            else:
                unresolved.append((row, reason))
        else:
            buckets[class_no].append(row)

    keys = [row["key"] for row in rows]
    duplicates = [key for key, count in Counter(keys).items() if count > 1]
    for class_no, name in CLASS_FILES.items():
        write_tsv(name, TSV_FIELDS, buckets[class_no])
    write_tsv(BRIEF_FILE, TSV_FIELDS, brief)
    judges = judge_rows()
    write_tsv("5-judge-characteristics.tsv", JUDGE_FIELDS, judges)

    for name in MAP_FILES:
        classed = sum(row["file"] == name for bucket in buckets.values() for row in bucket) + sum(row["file"] == name for row in brief)
        unknown = sum(row["file"] == name for row, _ in unresolved)
        print(f"{name}: maps={per_file[name]} report={report_per_file.get(name, 0)} classed={classed} unresolved={unknown}")
    for class_no, name in CLASS_FILES.items():
        class_rows = buckets[class_no]
        unique = len({row["key"] for row in class_rows})
        print(f"class{class_no} {name}: count={len(class_rows)} unique={unique}")
    brief_keys = {row["key"] for row in brief}
    print(f"class6 {BRIEF_FILE}: count={len(brief)} unique={len(brief_keys)}")
    all_classed = [row for bucket in buckets.values() for row in bucket] + brief
    classed_keys = {row["key"] for row in all_classed}
    print(f"maps total={len(rows)} unique={len(set(keys))} report={report_total}; classes1-4+6={len(all_classed)} unique={len(classed_keys)}; unresolved={len(unresolved)}; duplicate_keys={len(duplicates)}")
    for row, reason in unresolved:
        print(f"UNRESOLVED {row['file']}:{row['file_line']} key={row['key']} reason={reason}; fact={row['fact']!r}; source={row['source']!r}; fragment={row['fragment']!r}")
    print(f"judge characteristics (outside map total): count={len(judges)} unique_rows={len({(r['group'], r['judge'], r['blind_id'], r['invention_index']) for r in judges})}")

    discrepancies = []
    if report_total != 868:
        discrepancies.append(f"контрольное число maps-report {report_total}, требуется 868")
    if len(rows) != report_total:
        discrepancies.append(f"входных строк {len(rows)}, в maps-report {report_total}")
    if len(set(keys)) != len(rows):
        discrepancies.append(f"ключи повторяются: {duplicates}")
    for name in MAP_FILES:
        if per_file[name] != report_per_file.get(name):
            discrepancies.append(f"{name}: прочитано {per_file[name]}, в maps-report {report_per_file.get(name)}")
    classed = len(all_classed)
    if classed != 868 or len(classed_keys) != 868 or unresolved:
        discrepancies.append(f"классы 1–4 и 6 покрывают {classed} строк и {len(classed_keys)} ключей; неразнесённых строк {len(unresolved)}")
    actual_brief_rows = {(row["file"], int(row["map_number"]), row["file_line"], row["source_clean"]) for row in brief}
    if len(brief) != 14 or actual_brief_rows != BRIEF_ROWS:
        discrepancies.append(f"class6: найдено {len(brief)} строк; набор строк/источников совпадает с заданным: {actual_brief_rows == BRIEF_ROWS}")
    if len(judges) != 237:
        discrepancies.append(f"class5: найдено {len(judges)} записей, ожидалось 237")
    if any(len(bucket) != len({row["key"] for row in bucket}) for bucket in buckets.values()):
        discrepancies.append("внутри одного TSV повторяются ключи")
    if len(brief_keys) != len(brief):
        discrepancies.append("в class6 повторяются ключи")
    if discrepancies:
        print("GATE Q: расхождение — " + "; ".join(discrepancies))
        return 1
    print(f"GATE OK: классы 1–4 и 6 покрывают {classed} уникальных ключей; class5={len(judges)} отдельно")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
