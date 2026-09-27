# -*- coding: utf-8 -*-
"""
Authored lookup tables for build_incidents.py.

1. CONFLICT_TYPE_MAP — the 40 conflict_type values used by the rus13tpl draft
   `novgorod_local_conflict_templates_v1.json` are scenario-specific
   ("boat_damage", "closed_ferry", "runaway_suspicion", ...), NOT the 14
   broad values the world_base.conflict_templates DDL check constraint
   allows (05.sql: debt, property, trade, family, labor, status, religious,
   road, theft, violence, tax, duty, stranger, resource). This is a
   classification judgment call, documented row by row in the README for
   any non-obvious case (famine/disease/beasts -> resource is a stretch,
   flagged explicitly).

2. PARTICIPANT_MAP — the 73 distinct Russian participant terms used across
   the 40 templates, resolved to:
     ("role", <role_id>)         — exists in the pinned enriched TSV or in
                                    social_strata_legal_status/roles/new_role_candidates.tsv
     ("occupation", <occ_id>)    — exists in novgorod_occupations_v1_enriched.tsv
     ("generic", "<label>")      — a narrative function, not a person-type
                                    with its own role/occupation row (both
                                    sides of a dispute, "the offended party",
                                    bystanders, a suspect, ...). These are
                                    left as generic on purpose — inventing a
                                    dedicated role_id for "обидчик" would be
                                    fabricating structure the source does
                                    not have.
"""

CONFLICT_TYPE_MAP = {
    "debt": "debt",
    "guarantor": "debt",
    "pledge": "debt",
    "price_dispute": "trade",
    "underweight": "trade",
    "labor_payment": "labor",
    "status_insult": "status",
    "boyar_yard_conflict": "status",
    "princely_conflict": "status",
    "church_conflict": "religious",
    "monastery_conflict": "religious",
    "monastery_guest_refusal": "religious",
    "road_dispute": "road",
    "dangerous_road": "road",
    "road_death": "road",
    "crossing_queue": "road",
    "closed_ferry": "road",
    "ferry_dispute": "road",
    "guide_conflict": "road",
    "theft": "theft",
    "found_item": "theft",
    "missing_item": "theft",
    "livestock_theft": "theft",
    "robbery_rumor": "theft",
    "brawl": "violence",
    "witness": "property",
    "boat_damage": "property",
    "fire": "property",
    "field_trespass": "resource",
    "trespass": "resource",
    "forest_dispute": "resource",
    "hay_dispute": "resource",
    "fish_dispute": "resource",
    "livestock_dispute": "resource",
    "beasts": "resource",  # wolves at livestock — hazard, weak fit, flagged in README
    "famine": "resource",  # crisis background state, weak fit, flagged in README
    "disease": "resource",  # crisis background state, weak fit, flagged in README
    "dues_dispute": "tax",
    "local_vs_stranger": "stranger",
    "runaway_suspicion": "stranger",
}

# fit_confidence: "clear" | "weak" (weak ones are listed explicitly in the README gap section)
WEAK_FIT_TYPES = {"beasts", "famine", "disease", "witness", "boat_damage"}

PARTICIPANT_MAP = {
    "бедные": ("generic", "poor_households"),
    "больной": ("role", "nov_role_sick_disabled"),
    "боярский человек": ("role", "nov_role_boyar_man"),
    "владелец": ("generic", "property_owner"),
    "возчик": ("role", "nov_role_cart_driver"),
    "грузчик": ("occupation", "nov_occ_porter"),
    "две стороны": ("generic", "both_parties"),
    "держатель": ("generic", "place_holder"),
    "должник": ("role", "nov_role_debtor"),
    "другой рыбак": ("role", "nov_role_fisher"),
    "дружинник": ("role", "nov_role_princely_druzhinnik"),
    "зависимый": ("generic", "dependent_person"),
    "игумен при основании": ("role", "nov_role_igumen"),
    "княжий человек": ("role", "nov_role_princely_man"),
    "кредитор": ("generic", "creditor"),
    "купец": ("role", "nov_role_local_merchant"),
    "лодочник": ("role", "nov_role_boatman"),
    "мерщик/свидетель": ("occupation", "nov_occ_measurer_weigher"),
    "местные": ("generic", "local_people"),
    "местный": ("generic", "local_person"),
    "местный хозяин": ("role", "nov_role_householder"),
    "монастырский сторож": ("role", "nov_role_church_guard"),
    "монах": ("role", "nov_role_monk"),
    "монах/работник": ("role", "nov_role_monastery_worker"),
    "нашедший": ("generic", "finder"),
    "обидчик": ("generic", "offending_party"),
    "обиженный": ("generic", "offended_party"),
    "охотник": ("role", "nov_role_hunter"),
    "пассажир": ("generic", "passenger"),
    "пастух": ("role", "nov_role_pastoral_worker"),
    "перевозчик": ("role", "nov_role_ferryman"),
    "плотник": ("occupation", "nov_occ_carpenter"),
    "подозреваемые": ("generic", "suspects"),
    "подозреваемый": ("generic", "suspect"),
    "покупатель": ("generic", "buyer"),
    "поп": ("role", "nov_role_priest"),
    "поручитель": ("generic", "guarantor_person"),
    "прихожанин": ("generic", "parishioner"),
    "пришлый": ("role", "nov_role_outsider"),
    "проводник": ("role", "nov_role_guide"),
    "продавец": ("generic", "seller"),
    "промысловик": ("role", "nov_role_forest_promyslovik"),
    "путник": ("generic", "traveler"),
    "путники": ("generic", "travelers"),
    "пьяный/раздражённый": ("generic", "agitated_person"),
    "работник": ("role", "nov_role_hired_worker"),
    "работники": ("role", "nov_role_hired_worker"),
    "разыскивающий": ("generic", "searcher"),
    "родня": ("generic", "kin"),
    "рыбак": ("role", "nov_role_fisher"),
    "сборщик": ("role", "nov_role_virnik"),  # candidate role, social_strata_legal_status
    "свидетели": ("generic", "witnesses"),
    "свидетель": ("generic", "witness"),
    "слуга": ("role", "nov_role_servant"),
    "случайные люди": ("generic", "bystanders"),
    "сосед": ("generic", "neighbor"),
    "соседи": ("generic", "neighbors"),
    "староста": ("role", "nov_role_starosta"),
    "старший": ("role", "nov_role_city_elder"),
    "сторож": ("role", "nov_role_guard"),
    "страж": ("role", "nov_role_guard"),
    "страж/сторож": ("role", "nov_role_guard"),
    "торговец": ("role", "nov_role_trader"),
    "ухаживающий": ("generic", "caretaker"),
    "хозяева": ("generic", "householders"),
    "хозяева дворов": ("generic", "householders"),
    "хозяева запасов": ("generic", "store_owners"),
    "хозяин": ("role", "nov_role_householder"),
    "хозяин скота": ("role", "nov_role_householder"),
    "церковные люди": ("generic", "church_people"),
    "церковный сторож": ("role", "nov_role_church_guard"),
    "чужой": ("role", "nov_role_outsider"),
    "чужой рубщик": ("generic", "outsider_woodcutter"),
}
