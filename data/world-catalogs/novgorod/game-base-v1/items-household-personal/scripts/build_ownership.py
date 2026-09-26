"""Build items/ownership_rules.csv (D14) and items/recognizers.csv from rules.py (deterministic)."""
import sys
from common import ITEMS, REPORTS, read_csv, write_csv, load_v5, load_place_families, split
import rules as R


def groups_in_use():
    g = set()
    for f in ("household.csv", "personal.csv"):
        for r in read_csv(ITEMS / f):
            g.add(r["item_group"])
    g |= set(R.ME_GROUP.values()) | set(R.ME_SUB_GROUP.values()) | set(R.OCC_GROUP.values())
    return sorted(g)


def owner_for(pf, ctx, group):
    cls = R.PF_CLASS[pf]
    base = R.CLASS_OWNER[cls]
    if ctx == "in_use_or_stored":
        o = R.GROUP_OVERRIDE.get((group, cls), base)
        return o, R.CLASS_OWNER_NOTE.get(cls, "")
    if ctx == "displayed_for_sale":
        m = {"public_market": "trader", "public_wharf": "trader", "public_street": "trader",
             "workplace_master": "master", "settled_private": "household", "church": "church"}
        return (m.get(cls), "торговля вне торга допускается только при зафиксированном основании продажи") if cls in m else (None, "")
    if ctx == "loose_dropped":
        if cls in ("settled_private", "workplace_master", "workplace_household"):
            return base, "обронённое на своём дворе/в мастерской остаётся вещью двора/мастера"
        return "lost_unknown", "потеряно кем-то; владелец не выдумывается, возникает только из зафиксированного события"
    if ctx == "discarded_refuse":
        if cls in ("settled_private", "workplace_master", "workplace_household", "worked_land"):
            return base, "выброшенное на своём участке — вещь хозяина участка (вторсырьё)"
        return "ownerless", "выброшенное в общем или диком месте — ничьё"
    if ctx == "natural_in_situ":
        if cls in ("settled_private", "workplace_household", "worked_land"):
            return "household", "природный материал на обрабатываемом/дворовом участке принадлежит двору-пользователю"
        if cls == "church":
            return "church", "природный материал на церковной/монастырской земле"
        return "ownerless", "природное на месте — ничьё; права участка, если зафиксированы, имеют приоритет"
    return None, ""


def main():
    pfs = load_place_families()
    errors = []
    for pf in R.PF_CLASS:
        if pf not in pfs:
            errors.append(f"pf {pf} not in WK place-first-cartography")
    for pf in pfs:
        if pf not in R.PF_CLASS and pf not in R.OVERLAYS:
            errors.append(f"WK family {pf} not classified")
    _, _, _, _, _, props = load_v5()
    for o, meta in R.OWNER_META.items():
        if meta[4] and meta[4] not in props:
            errors.append(f"property profile {meta[4]} missing in v5")
    for p in R.GROUP_PROPERTY.values():
        if p not in props:
            errors.append(f"property profile {p} missing in v5")
    groups = groups_in_use()
    rows = []
    for pf, cls in R.PF_CLASS.items():
        for ctx in R.CONTEXTS:
            if ctx == "carried_on_person":
                continue
            glist = groups if ctx == "in_use_or_stored" else ["*"]
            for g in glist:
                owner, note = owner_for(pf, ctx, g)
                if owner is None:
                    continue
                holder, controller, access, recog, prop = R.OWNER_META[owner]
                if owner == "household" and g in R.GROUP_PROPERTY:
                    prop = R.GROUP_PROPERTY[g]
                rows.append({
                    "own_id": R.own_id(pf, ctx, "all" if g == "*" else g), "pf_id": pf, "pf_class": cls,
                    "find_context": ctx, "item_group": g, "owner_kind": owner, "holder_kind": holder,
                    "controller_kind": controller, "access_policy": access, "recognizers_rule": recog,
                    "named_person": "no", "property_profile_ref": prop,
                    "source_refs": "wk:place-first-cartography.json#" + pf + ";issue133:D14(issuecomment-5844152943);v5:property_profiles"
                                   + (";rus13tpl:novgorod_property_rules_v1.json(draft)" if ctx != "natural_in_situ" else ";pr98:m2c-items/property-context-candidate.json(natural access)"),
                    "confidence": "C", "status": "candidate", "note": note,
                })
    # carried items: pf-independent rule
    h = R.OWNER_META["household"]
    rows.append({"own_id": "own_any__carried_on_person__all", "pf_id": "*", "pf_class": "*", "find_context": "carried_on_person",
                 "item_group": "*", "owner_kind": "household", "holder_kind": "actor", "controller_kind": "actor",
                 "access_policy": "actor_consent_required", "recognizers_rule": "owner(actor);household_members;frequent_witnesses",
                 "named_person": "no", "property_profile_ref": "property_personal_possession_v1",
                 "source_refs": "issue133:D14;v5:property_profiles#property_personal_possession_v1;rus13tpl:novgorod_property_rules_v1.json(inventory layer)",
                 "confidence": "C", "status": "candidate",
                 "note": "носимое принадлежит носителю (actor) и его двору; владельца-лица создаёт код только вместе с NPC, не отдельно"})
    fields = ["own_id", "pf_id", "pf_class", "find_context", "item_group", "owner_kind", "holder_kind", "controller_kind",
              "access_policy", "recognizers_rule", "named_person", "property_profile_ref", "source_refs", "confidence", "status", "note"]
    n = write_csv(ITEMS / "ownership_rules.csv", rows, fields)
    # recognizers: who knows an item, by owner kind and by item distinctiveness
    rec = []
    for o, meta in R.OWNER_META.items():
        for dist in ("unique", "rare", "common", "none"):
            if o in ("lost_unknown", "ownerless"):
                who = "none" if o == "ownerless" else "owner_only_after_commit"
            elif dist == "none":
                who = "nobody_by_marks; circumstantial_only(place,container,timing,witnessed_handling)"
            elif dist == "common":
                who = "owner(class match only, not proof)"
            else:
                who = meta[3]
            rec.append({"rec_id": f"rec_{o}__{dist}", "owner_kind": o, "mark_distinctiveness": dist,
                        "who_can_recognize": who,
                        "knowledge_owner": "@rus/visibility-knowledge-memory",
                        "decision_owner": "code at perception (visibility, light, distance, concealment); NPC reaction per npc_autonomous_decision_contract",
                        "source_refs": "issue133:D14;rus13tpl:novgorod_property_rules_v1.json#recognition_formula_reference(draft)",
                        "confidence": "C", "status": "candidate"})
    write_csv(ITEMS / "recognizers.csv", rec, list(rec[0]))
    (REPORTS / "build_ownership_errors.txt").write_text("\n".join(errors) + ("\n" if errors else ""), encoding="utf-8")
    print(f"ownership_rules={n} recognizers={len(rec)} groups={len(groups)} errors={len(errors)}")
    for e in errors:
        print("  ERR", e)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
