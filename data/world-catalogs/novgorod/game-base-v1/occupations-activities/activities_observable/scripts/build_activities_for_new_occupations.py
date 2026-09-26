# -*- coding: utf-8 -*-
"""Build candidate observable cues for the collector's new occupations."""
import csv
import os

HERE = os.path.dirname(__file__)
OCC = os.path.join(HERE, "..", "..", "occupations", "occupations_additions.csv")
OUT = os.path.join(HERE, "..", "activities_new_occupations.csv")
FIELDS = [
    "ac_id", "occupation_ref", "pf_id", "name_ru", "season_scope",
    "observable_text_ru", "inputs", "outputs", "previous_ac_id", "next_ac_id",
    "source_refs", "confidence", "status",
]

# Place families are candidate scene contexts, not presence/population bindings.
PF = {
    "occ_jeweler_caster": "pf_ordinary_workshop", "occ_bone_carver": "pf_ordinary_workshop",
    "occ_wood_turner": "pf_ordinary_workshop", "occ_furrier": "pf_ordinary_workshop",
    "occ_dyer": "pf_ordinary_workshop", "occ_ropemaker_netmaker": "pf_town_courtyard",
    "occ_netmaker": "pf_town_courtyard", "occ_locksmith": "pf_smithy",
    "occ_bowyer": "pf_ordinary_workshop", "occ_arrowsmith": "pf_smithy",
    "occ_mason": "pf_churchyard", "occ_limeburner": "pf_outbuildings",
    "occ_icon_painter": "pf_monastery_yard", "occ_brewer_meadmaker": "pf_town_courtyard",
    "occ_butcher": "pf_market_square", "occ_market_baker": "pf_market_square",
    "occ_fish_trader": "pf_market_square", "occ_wetnurse": "pf_dwelling_interior",
    "occ_shield_maker": "pf_ordinary_workshop",
}
ITEM_FLOW = {
    "occ_bone_carver": ("mt_bone", "it_ps_comb_double"),
    "occ_wood_turner": ("mt_wood_generic", "it_hh_turned_bowl"),
}


def main():
    with open(OCC, encoding="utf-8") as f:
        occupations = list(csv.DictReader(f))
    rows = []
    for occ in occupations:
        oid = occ["occupation_id"]
        seasons = "spring,summer,autumn" if oid == "occ_mason" else "winter,spring,summer,autumn"
        rows.append({
            "ac_id": "ac_" + oid,
            "occupation_ref": oid,
            "pf_id": PF[oid],
            "name_ru": occ["occupation_title_ru"] + ": видимая работа",
            "season_scope": seasons,
            "observable_text_ru": occ["how_to_materialize_as_background_npc"],
            "inputs": ITEM_FLOW.get(oid, ("", ""))[0],
            "outputs": ITEM_FLOW.get(oid, ("", ""))[1],
            "previous_ac_id": "", "next_ac_id": "",
            "source_refs": occ["source_refs"] + ";rule:occupation_property_to_pf#" + PF[oid]
                           + (";materials_registry/materials.csv#" + ITEM_FLOW[oid][0]
                              + ";items-household-personal/items/"
                              + ("personal.csv#" if ITEM_FLOW[oid][1].startswith("it_ps_") else "household.csv#")
                              + ITEM_FLOW[oid][1]
                              if oid in ITEM_FLOW else ";no_source:resolved_item_flow"),
            "confidence": "C", "status": "candidate",
        })
    # A two-step, observable chain: turned bowl at the workshop, then offered
    # at the market. The second step transfers no goods until a real sale.
    making = next(r for r in rows if r["occupation_ref"] == "occ_wood_turner")
    making["next_ac_id"] = "ac_occ_wood_turner_offer"
    making_sources = ";".join(
        ref for ref in making["source_refs"].split(";")
        if not ref.startswith("rule:occupation_property_to_pf#")
    )
    rows.append({
        "ac_id": "ac_occ_wood_turner_offer", "occupation_ref": "occ_wood_turner",
        "pf_id": "pf_market_square", "name_ru": "токарь предлагает точёную миску",
        "season_scope": "winter,spring,summer,autumn",
        "observable_text_ru": "Токарь показывает покупателю точёную миску на торгу.",
        "inputs": "it_hh_turned_bowl", "outputs": "", "previous_ac_id": making["ac_id"],
        "next_ac_id": "", "source_refs": making_sources + ";places-binding/places/place_families.csv#pf_market_square;rule:market_offer_no_committed_sale",
        "confidence": "C", "status": "candidate",
    })
    assert len(rows) == len({r["ac_id"] for r in rows})
    assert {r["occupation_ref"] for r in rows} == {r["occupation_id"] for r in occupations}
    assert all(r["observable_text_ru"].strip() and "committed-состоянием" not in r["observable_text_ru"] for r in rows)
    with open(OUT, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} candidate cues")


if __name__ == "__main__":
    main()
