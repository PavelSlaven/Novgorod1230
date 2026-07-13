#!/usr/bin/env python3
"""Generate universal social layer seed CSVs for world_base importer."""
from __future__ import annotations

import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data" / "world-base-seeds"
NOW = "2026-07-08T00:00:00Z"
AUDIT = "Universal social layer seed v1; explicit data, not procedural."

BASE_COLS = [
    "id", "slug", "title", "summary", "game_use", "limits",
    "status", "confidence", "sources", "audit_notes", "created_at", "updated_at",
]


def row(id_: str, title: str, summary: str = "", game_use: str = "") -> dict:
    return {
        "id": id_,
        "slug": id_,
        "title": title,
        "summary": summary or title,
        "game_use": game_use or f"Canonical {title.lower()} reference.",
        "limits": "Do not invent regional variants without social_position_archetype mapping.",
        "status": "approved",
        "confidence": "high",
        "sources": json.dumps(["seed:universal_social_layer_v1"], ensure_ascii=False),
        "audit_notes": AUDIT,
        "created_at": NOW,
        "updated_at": NOW,
    }


def write_csv(name: str, cols: list[str], rows: list[dict]) -> None:
    path = OUT / name
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {path.name}: {len(rows)} rows")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    classes = [
        row("ruling_dynastic_elite", "Правящая династическая элита"),
        row("ecclesiastical_elite", "Церковная элита"),
        row("urban_elite", "Городская элита"),
        row("landholding_notable", "Знатные землевладельцы"),
        row("free_commoner", "Свободные простолюдины"),
        row("dependent_commoner", "Зависимые простолюдины"),
        row("unfree_dependent", "Несвободные зависимые"),
        row("captive_unfree", "Пленные и невольники"),
        row("outsider_foreign", "Иностранцы и чужеземцы"),
        row("marginal_outcast", "Маргиналы и изгои"),
    ]
    write_csv("social_classes_v1.csv", BASE_COLS, classes)

    roles = [
        row("ruler", "Правитель"),
        row("official_manager", "Должностной управитель"),
        row("landholder_notable", "Землевладелец-знатный"),
        row("armed_retainer", "Вооружённый служилый"),
        row("guard_watchman", "Страж и дозорный"),
        row("cleric", "Священнослужитель"),
        row("monastic", "Монашествующий"),
        row("ecclesiastical_agent", "Церковный агент"),
        row("common_householder", "Городской домохозяин"),
        row("artisan_master", "Ремесленник-мастер"),
        row("elite_household_member", "Член знатного двора"),
        row("merchant_trader", "Купец и торговец"),
        row("rural_householder", "Сельский домохозяин"),
        row("rural_laborer", "Сельский работник"),
        row("forest_or_water_producer", "Лесной или водный промысленник"),
        row("traveler_outsider", "Путник и чужак"),
    ]
    write_csv("social_role_archetypes_v1.csv", BASE_COLS, roles)

    legal = [
        row("free", "Свободный"),
        row("dependent", "Зависимый"),
        row("unfree", "Несвободный"),
        row("captive", "Пленный"),
        row("unclear", "Неясный статус"),
        row("outcast", "Изгой"),
        row("privileged_foreign", "Привилегированный иностранец"),
        row("ecclesiastical", "Церковный статус"),
    ]
    write_csv("legal_status_archetypes_v1.csv", BASE_COLS, legal)

    deps = [
        row("none", "Без зависимости"),
        row("household_dependency", "Зависимость от двора"),
        row("debt_dependency", "Долговая зависимость"),
        row("lord_dependency", "Зависимость от господина"),
        row("monastery_dependency", "Монастырская зависимость"),
        row("office_service", "Служебная должность"),
        row("military_service", "Военная служба"),
        row("merchant_house_service", "Служба у купца"),
        row("kin_guardianship", "Родовая опека"),
        row("no_local_guarantor", "Нет местного поручителя"),
        row("owner_control", "Контроль владельца"),
        row("captor_control", "Контроль пленителя"),
        row("monastic_rule", "Монастырский устав"),
        row("creditor_pressure", "Давление кредитора"),
    ]
    write_csv("dependency_archetypes_v1.csv", BASE_COLS, deps)

    mob = [
        row("local_bound", "Привязан к месту"),
        row("locally_mobile", "Местная мобильность"),
        row("regionally_mobile", "Региональная мобильность"),
        row("road_mobile", "Дорожная мобильность"),
        row("restricted_by_master", "Ограничен господином"),
        row("restricted_by_debt", "Ограничен долгом"),
        row("fugitive", "Беглец"),
        row("no_guarantor", "Без поручителя"),
    ]
    write_csv("mobility_archetypes_v1.csv", BASE_COLS, mob)

    occs = [
        row("military_security", "Военная служба и охрана"),
        row("transport_guiding", "Перевозка и проводничество"),
        row("administration_law", "Управление и право"),
        row("religious_literate", "Церковная грамотная служба"),
        row("craft_production", "Ремесленное производство"),
        row("trade_exchange", "Торговля и обмен"),
        row("forest_hunting", "Лес и охота"),
        row("fishing_water", "Рыболовство и водный промысел"),
        row("agriculture", "Земледелие"),
        row("animal_husbandry", "Скотоводство"),
        row("healing_care", "Лечение и уход"),
        row("domestic_service", "Домашняя служба"),
        row("illicit_marginal", "Теневой и маргинальный промысел"),
        row("wage_labor", "Наёмный труд"),
        row("hospitality_service", "Гостеприимство и приют"),
    ]
    write_csv("occupation_archetypes_v1.csv", BASE_COLS, occs)

    skills = [
        row("athletics", "Атлетика"),
        row("stealth", "Скрытность"),
        row("melee_combat", "Ближний бой"),
        row("ranged_combat", "Дальний бой"),
        row("craft", "Ремесло"),
        row("household", "Хозяйство"),
        row("survival", "Выживание"),
        row("travel_transport", "Путь и транспорт"),
        row("healing", "Лечение"),
        row("observation", "Наблюдательность"),
        row("communication_trade", "Общение и торг"),
        row("custom_law_literacy", "Обычай и закон"),
    ]
    write_csv("skill_catalog_v1.csv", BASE_COLS, skills)

    positions = [
        ("free_rural_householder_commoner", "Свободный сельский домохозяин", "free_commoner", "rural_householder", "free", "none", "local_bound"),
        ("debt_dependent_commoner", "Должник-закуп", "dependent_commoner", "rural_householder", "dependent", "debt_dependency", "restricted_by_debt"),
        ("contract_dependent_laborer", "Рядович по договору", "dependent_commoner", "rural_laborer", "dependent", "lord_dependency", "locally_mobile"),
        ("unfree_household_dependent", "Холоп при дворе", "unfree_dependent", "elite_household_member", "unfree", "owner_control", "restricted_by_master"),
        ("privileged_long_distance_merchant", "Привилегированный гость-купец", "free_commoner", "merchant_trader", "free", "merchant_house_service", "regionally_mobile"),
        ("foreign_privileged_merchant_outsider", "Иностранный привилегированный гость", "outsider_foreign", "merchant_trader", "privileged_foreign", "no_local_guarantor", "road_mobile"),
        ("displaced_status_lost_outsider", "Изгой без местного статуса", "marginal_outcast", "traveler_outsider", "outcast", "no_local_guarantor", "no_guarantor"),
        ("captive_unfree_person", "Пленник", "captive_unfree", "traveler_outsider", "captive", "captor_control", "restricted_by_master"),
        ("elite_household_dependent_agent", "Боярский человек", "landholding_notable", "elite_household_member", "dependent", "household_dependency", "locally_mobile"),
        ("ecclesiastical_household_agent", "Владычный человек", "ecclesiastical_elite", "ecclesiastical_agent", "ecclesiastical", "monastery_dependency", "locally_mobile"),
        ("regional_dynastic_ruler", "Региональный князь", "ruling_dynastic_elite", "ruler", "free", "none", "regionally_mobile"),
        ("high_ecclesiastical_ruler", "Высший церковный правитель", "ecclesiastical_elite", "cleric", "ecclesiastical", "office_service", "regionally_mobile"),
        ("urban_elite_office_holder", "Городской должностной элитарий", "urban_elite", "official_manager", "free", "office_service", "locally_mobile"),
        ("free_urban_householder", "Свободный городской домохозяин", "free_commoner", "common_householder", "free", "none", "locally_mobile"),
        ("rural_laborer_commoner", "Сельский наёмный работник", "free_commoner", "rural_laborer", "free", "none", "locally_mobile"),
        ("forest_water_producer_commoner", "Лесной или водный промысленник", "free_commoner", "forest_or_water_producer", "free", "none", "local_bound"),
        ("artisan_master_urban", "Городской ремесленник-мастер", "free_commoner", "artisan_master", "free", "none", "locally_mobile"),
        ("armed_retainer_service", "Вооружённый служилый", "landholding_notable", "armed_retainer", "dependent", "military_service", "locally_mobile"),
        ("guard_watchman_service", "Страж и дозорный", "free_commoner", "guard_watchman", "dependent", "office_service", "locally_mobile"),
        ("monastic_community_member", "Монашествующий", "ecclesiastical_elite", "monastic", "ecclesiastical", "monastic_rule", "restricted_by_master"),
        ("parish_cleric", "Приходской священник", "ecclesiastical_elite", "cleric", "ecclesiastical", "office_service", "locally_mobile"),
        ("landholding_notable_rural", "Сельский землевладелец", "landholding_notable", "landholder_notable", "free", "none", "local_bound"),
        ("dependent_servant_household", "Служилый зависимый", "dependent_commoner", "elite_household_member", "dependent", "household_dependency", "restricted_by_master"),
        ("transport_worker_itinerant", "Дорожный перевозчик", "free_commoner", "traveler_outsider", "free", "none", "road_mobile"),
        ("traveler_guide_itinerant", "Проводник и путник", "free_commoner", "traveler_outsider", "free", "none", "road_mobile"),
        ("marginal_outcast_low_status", "Низкостатусный маргинал", "marginal_outcast", "traveler_outsider", "outcast", "no_local_guarantor", "fugitive"),
        ("military_officer_elite", "Военный начальник", "ruling_dynastic_elite", "armed_retainer", "free", "military_service", "regionally_mobile"),
        ("urban_merchant_trader", "Городской купец", "free_commoner", "merchant_trader", "free", "none", "locally_mobile"),
        ("ecclesiastical_official_manager", "Церковный управитель", "ecclesiastical_elite", "official_manager", "ecclesiastical", "office_service", "locally_mobile"),
        ("bonded_laborer_dependent", "Обязанный работник", "dependent_commoner", "rural_laborer", "dependent", "creditor_pressure", "restricted_by_debt"),
    ]
    pos_cols = [
        "id", "slug", "title", "social_class_id", "role_archetype_id",
        "legal_status_archetype_id", "dependency_archetype_id", "mobility_archetype_id",
        "property_rights_model", "weapon_rights_model", "court_voice_model",
        "typical_power_over_others", "typical_power_over_them",
        "summary", "game_use", "limits", "status", "confidence", "sources",
        "audit_notes", "created_at", "updated_at",
    ]
    pos_rows = []
    for pid, title, cls, role, legal_id, dep, mob_id in positions:
        pos_rows.append({
            "id": pid,
            "slug": pid,
            "title": title,
            "social_class_id": cls,
            "role_archetype_id": role,
            "legal_status_archetype_id": legal_id,
            "dependency_archetype_id": dep,
            "mobility_archetype_id": mob_id,
            "property_rights_model": "",
            "weapon_rights_model": "",
            "court_voice_model": "",
            "typical_power_over_others": "",
            "typical_power_over_them": "",
            "summary": title,
            "game_use": f"Canonical position for {title}.",
            "limits": "Map regional roles here; do not duplicate ontology per region.",
            "status": "approved",
            "confidence": "high",
            "sources": json.dumps(["seed:universal_social_layer_v1"], ensure_ascii=False),
            "audit_notes": AUDIT,
            "created_at": NOW,
            "updated_at": NOW,
        })
    write_csv("social_position_archetypes_v1.csv", pos_cols, pos_rows)

    skill_defaults = [
        ("military_security", ["melee_combat", "athletics"], ["ranged_combat", "observation"], [], []),
        ("transport_guiding", ["travel_transport", "survival"], ["observation", "communication_trade"], [], []),
        ("administration_law", ["custom_law_literacy", "communication_trade"], ["observation"], [], []),
        ("religious_literate", ["custom_law_literacy"], ["healing", "communication_trade"], [], []),
        ("craft_production", ["craft"], ["observation"], [], []),
        ("trade_exchange", ["communication_trade"], ["observation", "craft"], [], []),
        ("forest_hunting", ["survival", "stealth"], ["ranged_combat", "craft"], [], []),
        ("fishing_water", ["survival"], ["craft", "household"], [], []),
        ("agriculture", ["household", "survival"], ["athletics"], [], []),
        ("animal_husbandry", ["household"], ["survival", "travel_transport"], [], []),
        ("healing_care", ["healing"], ["observation", "household"], [], []),
        ("domestic_service", ["household"], ["stealth", "communication_trade"], [], []),
        ("illicit_marginal", ["stealth"], ["survival", "melee_combat"], [], []),
        ("wage_labor", ["athletics"], ["household", "craft"], [], []),
        ("hospitality_service", ["household", "communication_trade"], ["craft"], [], []),
    ]
    osd_cols = [
        "occupation_archetype_id", "primary_skill_ids", "secondary_skill_ids",
        "gate_skill_ids", "forbidden_skill_ids", "default_level_logic",
        "status", "confidence", "sources", "audit_notes", "created_at", "updated_at",
    ]
    osd_rows = []
    for occ_id, primary, secondary, gate, forbidden in skill_defaults:
        osd_rows.append({
            "occupation_archetype_id": occ_id,
            "primary_skill_ids": json.dumps(primary, ensure_ascii=False),
            "secondary_skill_ids": json.dumps(secondary, ensure_ascii=False),
            "gate_skill_ids": json.dumps(gate, ensure_ascii=False),
            "forbidden_skill_ids": json.dumps(forbidden, ensure_ascii=False),
            "default_level_logic": "primary +2 typical, secondary +1 if biography supports",
            "status": "approved",
            "confidence": "high",
            "sources": json.dumps(["seed:universal_social_layer_v1"], ensure_ascii=False),
            "audit_notes": AUDIT,
            "created_at": NOW,
            "updated_at": NOW,
        })
    write_csv("occupation_skill_defaults_v1.csv", osd_cols, osd_rows)

    # ponytail: sparse class-role matrix — only plausible pairs marked allowed
    allowed_pairs = {
        ("ruling_dynastic_elite", "ruler"), ("ruling_dynastic_elite", "armed_retainer"), ("ruling_dynastic_elite", "official_manager"),
        ("ecclesiastical_elite", "cleric"), ("ecclesiastical_elite", "monastic"), ("ecclesiastical_elite", "ecclesiastical_agent"), ("ecclesiastical_elite", "official_manager"),
        ("urban_elite", "official_manager"), ("urban_elite", "merchant_trader"), ("urban_elite", "common_householder"),
        ("landholding_notable", "landholder_notable"), ("landholding_notable", "armed_retainer"), ("landholding_notable", "elite_household_member"),
        ("free_commoner", "common_householder"), ("free_commoner", "artisan_master"), ("free_commoner", "merchant_trader"),
        ("free_commoner", "rural_householder"), ("free_commoner", "rural_laborer"), ("free_commoner", "forest_or_water_producer"),
        ("free_commoner", "guard_watchman"), ("free_commoner", "traveler_outsider"),
        ("dependent_commoner", "rural_laborer"), ("dependent_commoner", "elite_household_member"), ("dependent_commoner", "rural_householder"),
        ("unfree_dependent", "elite_household_member"),
        ("captive_unfree", "traveler_outsider"),
        ("outsider_foreign", "merchant_trader"), ("outsider_foreign", "traveler_outsider"),
        ("marginal_outcast", "traveler_outsider"),
    }
    crr_cols = [
        "social_class_id", "role_archetype_id", "is_allowed", "notes",
        "status", "confidence", "sources", "audit_notes", "created_at", "updated_at",
    ]
    crr_rows = []
    for cls in [r["id"] for r in classes]:
        for role in [r["id"] for r in roles]:
            if (cls, role) in allowed_pairs:
                crr_rows.append({
                    "social_class_id": cls,
                    "role_archetype_id": role,
                    "is_allowed": "true",
                    "notes": "",
                    "status": "approved",
                    "confidence": "high",
                    "sources": json.dumps(["seed:universal_social_layer_v1"], ensure_ascii=False),
                    "audit_notes": AUDIT,
                    "created_at": NOW,
                    "updated_at": NOW,
                })
    write_csv("class_role_rules_v1.csv", crr_cols, crr_rows)

    role_occ_pairs = [
        ("ruler", "administration_law"), ("ruler", "military_security"),
        ("official_manager", "administration_law"),
        ("landholder_notable", "agriculture"), ("landholder_notable", "military_security"),
        ("armed_retainer", "military_security"),
        ("guard_watchman", "military_security"),
        ("cleric", "religious_literate"), ("monastic", "religious_literate"),
        ("ecclesiastical_agent", "religious_literate"), ("ecclesiastical_agent", "administration_law"),
        ("common_householder", "domestic_service"), ("common_householder", "craft_production"),
        ("artisan_master", "craft_production"),
        ("elite_household_member", "domestic_service"), ("elite_household_member", "military_security"),
        ("merchant_trader", "trade_exchange"),
        ("rural_householder", "agriculture"), ("rural_householder", "animal_husbandry"),
        ("rural_laborer", "wage_labor"), ("rural_laborer", "agriculture"),
        ("forest_or_water_producer", "forest_hunting"), ("forest_or_water_producer", "fishing_water"),
        ("traveler_outsider", "transport_guiding"), ("traveler_outsider", "hospitality_service"),
        ("traveler_outsider", "illicit_marginal"),
    ]
    ror_cols = [
        "role_archetype_id", "occupation_archetype_id", "is_allowed", "notes",
        "status", "confidence", "sources", "audit_notes", "created_at", "updated_at",
    ]
    ror_rows = []
    for role_id, occ_id in role_occ_pairs:
        ror_rows.append({
            "role_archetype_id": role_id,
            "occupation_archetype_id": occ_id,
            "is_allowed": "true",
            "notes": "",
            "status": "approved",
            "confidence": "high",
            "sources": json.dumps(["seed:universal_social_layer_v1"], ensure_ascii=False),
            "audit_notes": AUDIT,
            "created_at": NOW,
            "updated_at": NOW,
        })
    write_csv("role_occupation_rules_v1.csv", ror_cols, ror_rows)


if __name__ == "__main__":
    main()
