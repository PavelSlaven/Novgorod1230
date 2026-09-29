"""Build items/mark_pools.csv and items/identifying_text_pools.csv from authored seeds; resolve every source ref."""
import re
import sys
from common import DOMAIN, ITEMS, REPORTS, HERE, read_csv, read_psv, write_csv, split, load_master, load_sources, load_wk

KINDS = {"owner_sign", "maker_mark", "ornament", "repair", "wear", "damage", "inscription"}
DIST = {"unique", "rare", "common"}
FAMS = {"wood", "bark", "clay", "iron", "nonferrous", "stone", "bone", "leather", "textile", "wax", "organic_soft"}
BOOK_REF = re.compile(r"^\d+ §\d+$")
BOOK_EVIDENCE = DOMAIN / "sources/book_evidence_m2c_b3.csv"


def check_refs(rid, refs, master, sources, claims, concepts, book_refs, errors):
    out = []
    if not refs.strip():
        errors.append(f"SOURCE_REFS_EMPTY:{rid}")
        return ""
    for r in split(refs):
        kind, _, val = r.partition(":")
        if kind == "master":
            if val not in master:
                errors.append(f"{rid}: master {val} missing")
            else:
                out.append(f"master:{master[val]['canonical_id']}")
                continue
        elif kind == "src":
            if val not in sources:
                errors.append(f"{rid}: source {val} missing")
        elif kind == "wk":
            if val not in claims and ("wk:" + val) not in concepts:
                errors.append(f"{rid}: WK {val} missing")
        elif kind == "book":
            if not BOOK_REF.fullmatch(val):
                errors.append(f"BOOK_REF_MALFORMED:{rid}:{r}")
            elif val not in book_refs:
                errors.append(f"BOOK_REF_NOT_IN_SNAPSHOT:{rid}:{r}")
        elif kind not in ("rus13tpl", "pr98"):
            errors.append(f"{rid}: unknown ref kind {r}")
        out.append(r)
    return ";".join(out)


def check_text_pool_ref(rid, pool_id, pool_ids, errors):
    if pool_id and pool_id not in pool_ids:
        errors.append(f"TEXT_POOL_UNKNOWN:{rid}:{pool_id}")


def check_llm_policy(row, errors):
    if row["llm_may_write_text"] != "no":
        errors.append(f"LLM_TEXT_FORBIDDEN:{row['text_pool_id']}:{row['llm_may_write_text']}")


def main():
    master, sources = load_master(), load_sources()
    claims, concepts = load_wk()
    book_rows = read_csv(BOOK_EVIDENCE)
    book_refs = {f"{r['book_id']} §{r['para_no']}" for r in book_rows}
    errors = []
    tp = read_psv(HERE / "text_pools.psv")
    tp_ids = {t["text_pool_id"] for t in tp}
    tp_by_id = {t["text_pool_id"]: t for t in tp}
    marks = read_psv(HERE / "mark_pools.psv")
    rows = []
    for m in marks:
        if m["mark_kind"] not in KINDS:
            errors.append(f"{m['mk_id']}: kind {m['mark_kind']}")
        if m["distinctiveness"] not in DIST:
            errors.append(f"{m['mk_id']}: distinctiveness")
        check_text_pool_ref(m["mk_id"], m["text_pool_id"], tp_ids, errors)
        mats = split(m["applicable_materials"])
        if mats != ["*"] and not set(mats) <= FAMS:
            errors.append(f"{m['mk_id']}: materials {set(mats) - FAMS}")
        if m["confidence"] not in ("A", "B", "C"):
            errors.append(f"{m['mk_id']}: confidence")
        r = dict(m)
        r["source_refs"] = check_refs(m["mk_id"], m["source_refs"], master, sources, claims, concepts, book_refs, errors)
        pool = tp_by_id.get(m["text_pool_id"])
        r["status"] = "excluded_anachronism" if pool and not pool["valid_for_1230"].startswith("yes") else "candidate"
        rows.append(r)
    n1 = write_csv(ITEMS / "mark_pools.csv", rows, list(marks[0]) + ["status"])
    trows = []
    for t in tp:
        r = dict(t)
        r["source_refs"] = check_refs(t["text_pool_id"], t["source_refs"], master, sources, claims, concepts, book_refs, errors)
        r["llm_may_write_text"] = "no"
        check_llm_policy(r, errors)
        r["status"] = "candidate" if t["valid_for_1230"].startswith("yes") else "excluded_anachronism"
        trows.append(r)
    n2 = write_csv(ITEMS / "identifying_text_pools.csv", trows, list(tp[0]) + ["llm_may_write_text", "status"])
    (REPORTS / "build_marks_errors.txt").write_text("\n".join(errors) + ("\n" if errors else ""), encoding="utf-8")
    print(f"mark_pools={n1} identifying_text_pools={n2} errors={len(errors)}")
    for e in errors:
        print("  ERR", e)
    if "--self-test" in sys.argv:
        probe_errors = []
        check_refs("self_test_book", "book:1 §1", master, sources, claims, concepts, book_refs, probe_errors)
        check_refs("self_test_empty", "", master, sources, claims, concepts, book_refs, probe_errors)
        check_text_pool_ref("self_test_pool", "TXT_MISSING", tp_ids, probe_errors)
        check_llm_policy({"text_pool_id": "self_test_llm", "llm_may_write_text": "yes"}, probe_errors)
        expected = {"BOOK_REF_NOT_IN_SNAPSHOT", "SOURCE_REFS_EMPTY", "TEXT_POOL_UNKNOWN", "LLM_TEXT_FORBIDDEN"}
        actual = {e.split(":", 1)[0] for e in probe_errors}
        assert expected <= actual, f"missing self-test codes: {sorted(expected - actual)}"
        print("book/source/pool/LLM negative probes PASS:", ",".join(sorted(expected)))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
