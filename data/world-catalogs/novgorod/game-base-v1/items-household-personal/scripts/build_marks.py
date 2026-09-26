"""Build items/mark_pools.csv and items/identifying_text_pools.csv from authored seeds; resolve every source ref."""
import sys
from common import ITEMS, REPORTS, HERE, read_psv, write_csv, split, load_master, load_sources, load_wk

KINDS = {"owner_sign", "maker_mark", "ornament", "repair", "wear", "damage", "inscription"}
DIST = {"unique", "rare", "common"}
FAMS = {"wood", "bark", "clay", "iron", "nonferrous", "stone", "bone", "leather", "textile", "wax", "organic_soft"}


def check_refs(rid, refs, master, sources, claims, concepts, errors):
    out = []
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
        elif kind not in ("rus13tpl", "pr98"):
            errors.append(f"{rid}: unknown ref kind {r}")
        out.append(r)
    return ";".join(out)


def main():
    master, sources = load_master(), load_sources()
    claims, concepts = load_wk()
    errors = []
    tp = read_psv(HERE / "text_pools.psv")
    tp_ids = {t["text_pool_id"] for t in tp}
    marks = read_psv(HERE / "mark_pools.psv")
    rows = []
    for m in marks:
        if m["mark_kind"] not in KINDS:
            errors.append(f"{m['mk_id']}: kind {m['mark_kind']}")
        if m["distinctiveness"] not in DIST:
            errors.append(f"{m['mk_id']}: distinctiveness")
        if m["text_pool_id"] and m["text_pool_id"] not in tp_ids:
            errors.append(f"{m['mk_id']}: text pool {m['text_pool_id']} missing")
        mats = split(m["applicable_materials"])
        if mats != ["*"] and not set(mats) <= FAMS:
            errors.append(f"{m['mk_id']}: materials {set(mats) - FAMS}")
        if m["confidence"] not in ("A", "B", "C"):
            errors.append(f"{m['mk_id']}: confidence")
        r = dict(m)
        r["source_refs"] = check_refs(m["mk_id"], m["source_refs"], master, sources, claims, concepts, errors)
        r["status"] = "candidate"
        rows.append(r)
    n1 = write_csv(ITEMS / "mark_pools.csv", rows, list(marks[0]) + ["status"])
    trows = []
    for t in tp:
        r = dict(t)
        r["source_refs"] = check_refs(t["text_pool_id"], t["source_refs"], master, sources, claims, concepts, errors)
        r["llm_may_write_text"] = "no"
        r["status"] = "candidate" if t["valid_for_1230"].startswith("yes") else "excluded_anachronism"
        trows.append(r)
    n2 = write_csv(ITEMS / "identifying_text_pools.csv", trows, list(tp[0]) + ["llm_may_write_text", "status"])
    (REPORTS / "build_marks_errors.txt").write_text("\n".join(errors) + ("\n" if errors else ""), encoding="utf-8")
    print(f"mark_pools={n1} identifying_text_pools={n2} errors={len(errors)}")
    for e in errors:
        print("  ERR", e)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
