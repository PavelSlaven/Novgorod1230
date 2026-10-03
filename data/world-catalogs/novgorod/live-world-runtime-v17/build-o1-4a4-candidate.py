#!/usr/bin/env python3
"""Build the 4a4 O1 homestead review candidate without changing 4a2/4a3 inputs."""

import argparse
import copy
import csv
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / "data/world-catalogs/novgorod"
TASK_OUT = Path("/srv/novgorod-work/fleet/tasks/v17-channels/out")
HERE = DATA / "live-world-runtime-v17"
START_DATA = HERE / "ordinary-materialization-o1-start-data-candidate.json"
PLACEMENT_4A3 = HERE / "ordinary-materialization-o1-placement-authoring-4a3-candidate.json"
OWNERSHIP_4A3 = HERE / "ordinary-materialization-o1-ownership-authoring-4a3-candidate.json"
ATTEST_A = TASK_OUT / "opus/o1a-attestation-draft.json"
ATTEST_B = TASK_OUT / "opus/o1b-attestation-draft.json"
REGISTRY = DATA / "game-base-v1/places-binding/categories/category_registry.csv"
OUT_POOL = HERE / "ordinary-materialization-o1-4a4-candidate.json"
OUT_PLACEMENT = HERE / "ordinary-materialization-o1-placement-authoring-4a4-candidate.json"
OUT_REPORT = TASK_OUT / "v17-channels-o1-data-4a4.md"

G4 = "g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_locality@1"
PF = "pf_peasant_homestead@1"

REJECTED = {
    "pr_a2e55eee216b584d": "it_ps_quill: страта писца; только явный контекст, не автоматическое наполнение.",
    "pr_8d7283c31896f66a": "it_ps_scribe_knife: функции и владелец писца; вне пула двора смерда.",
    "pr_8b8877b0b5d6304d": "it_ps_comb_case: explicit_context_only; остаётся в запасе мира.",
}
GAPS = {
    "pr_03f58bdce56a4b98": "it_hh_bark_case: контейнерная форма без существующей категории container_form; решение владельца контейнеров.",
    "pr_6799f4e1aa8721c2": "it_ps_wooden_flask: нет сельского основания; также не решён фасет container_form.",
    "pr_fa135671049a473a": "it_hh_swaddling_cloth: только child-conditional; стартовый состав не создаёт младенца.",
}
CONTAINER_CATEGORY = {
    "pr_1d74054e7a56924f": "cat_container_form_bucket_v1",
    "pr_1ea1130e807a7799": "cat_container_form_cask_v1",
    "pr_c5fced1141ce47ad": "cat_container_form_tub_v1",
    "pr_324f66380a3ac4ef": "cat_container_form_carrying_basket_v1",
    "pr_dc29d7d9a216fc97": "cat_container_form_sack_v1",
    "pr_778a18a1b37b42b6": "cat_container_form_small_soft_bag_v1",
    "pr_804e4033a1f92cee": "cat_container_form_birch_bark_box_v1",
    "pr_6b3aed4a3cdde2cf": "cat_container_form_knife_sheath_v1",
}
TUB_VARIANT_PR = "pr_320d010b5bbcad63"
RARE = {
    "pr_8ac3452938c181e1", "pr_f1910c9dd6b9c22b",
    "pr_3b69bc5d887f0d94", "pr_fc849544932d1ecd",
    "pr_558f8a68fa018bb9", "pr_69e8c51d0432bfc7",
    "pr_33dbe944cad6306b", "pr_33fc66815e7b904e",
    "pr_1b1d2e6d1622a471", "pr_666699806d22311e",
}
OPEN_ONLY = {
    "pr_67ae629fa56a23b5",  # hand quern
    "pr_beebe70fcabd3fad",  # trough
    "pr_c5fced1141ce47ad",  # tub (also represents washtub source row)
    TUB_VARIANT_PR,
}


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")


def checked_snapshot(source_hashes, attestation):
    expected = attestation["snapshot_sha256"]
    for path in (START_DATA, PLACEMENT_4A3, OWNERSHIP_4A3):
        rel = path.name
        if rel not in expected:
            raise ValueError(f"reviewed snapshot pin missing: {rel}")
        if digest(path) != expected[rel]:
            raise ValueError(f"reviewed source changed since Opus snapshot: {rel}")
        source_hashes[rel] = digest(path)


def container_category_ids():
    with REGISTRY.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    found = {}
    for row in rows:
        if row["category_id"] in CONTAINER_CATEGORY.values():
            found[row["category_id"]] = (row["facet"], row["status"])
    if set(found) != set(CONTAINER_CATEGORY.values()):
        missing = sorted(set(CONTAINER_CATEGORY.values()) - set(found))
        raise ValueError(f"container_form categories absent from registry: {missing}")
    if any(facet != "container_form" or status != "draft"
           for facet, status in found.values()):
        raise ValueError("expected existing draft container_form categories")
    return found


def build_pool(source, attestation_a, attestation_b, source_hashes):
    rules = source["candidate_presence_rules"]
    by_id = {row["pr_id"]: row for row in rules}
    homestead = [row for row in rules if row["scope_ref"] == PF]
    if attestation_a["decision"] != "APPROVE_WITH_LIMITS" or \
            attestation_b["decision"] != "approve_with_limits":
        raise ValueError("unexpected Opus A/B decision")
    if len(homestead) != 82 or len(attestation_a["approved_rows_items"]) != 55:
        raise ValueError("unexpected reviewed homestead source size")
    if len(attestation_a["rows_needing_fix"]) != 24 or len(attestation_a["rejected_rows"]) != 3:
        raise ValueError("unexpected Opus A decision counts")
    if not set(REJECTED).issubset(by_id) or not set(GAPS).issubset(by_id):
        raise ValueError("review row IDs do not match pinned 4a2 source")
    if TUB_VARIANT_PR not in by_id:
        raise ValueError("washtub source row missing")

    source_hashes["o1a-attestation-draft.json"] = digest(ATTEST_A)
    source_hashes["o1b-attestation-draft.json"] = digest(ATTEST_B)
    for path in (PLACEMENT_4A3, OWNERSHIP_4A3):
        source_hashes[path.name] = digest(path)

    exclusions = []
    for pr_id, reason in REJECTED.items():
        exclusions.append({"pr_id": pr_id, "item_ref": by_id[pr_id]["item_ref"],
                           "decision": "rejected_from_o1_pool", "reason": reason})
    for pr_id, reason in GAPS.items():
        exclusions.append({"pr_id": pr_id, "item_ref": by_id[pr_id]["item_ref"],
                           "decision": "typed_gap_not_in_o1_pool", "reason": reason})

    out = []
    for row in homestead:
        pr_id = row["pr_id"]
        if pr_id in REJECTED or pr_id in GAPS or pr_id == TUB_VARIANT_PR:
            continue
        item = copy.deepcopy(row)
        if pr_id in CONTAINER_CATEGORY:
            item["category_ref"] = CONTAINER_CATEGORY[pr_id]
            item["facet_decision"] = "existing_container_form_draft"
        if pr_id == "pr_c5fced1141ce47ad":
            washtub = by_id[TUB_VARIANT_PR]
            item["variants"] = [*item.get("variants", []), {
                "source_pool": washtub["source_pool"],
                "source_row_id": washtub["source_row_id"],
                "item_ref": washtub["item_ref"],
            }]
            item["merged_source_pr_ids"] = [pr_id, TUB_VARIANT_PR]
            item["source_refs"] = ";".join(sorted(set(
                filter(None, (item.get("source_refs", "") + ";"
                              + washtub.get("source_refs", "")).split(";")))))
            item["merge_frequency_note"] = (
                "Варианты объединены по category_ref; исходные частоты кадки "
                "(common/500000) и лохани (contextual/250000) различаются. "
                "500000 оставлено как кандидат кадки; частота объединённого правила "
                "требует короткого переутверждения Opus."
            )
        if pr_id in RARE:
            item["frequency_class"] = "rare"
            item["probability_ppm_candidate"] = "125000"
        if pr_id == "pr_ebc47f9329ad0665":
            item["frequency_class"] = "common"
            item["probability_ppm_candidate"] = "500000"
            item["source_refs"] = "master:n1230:material_item:int0016"
            item["regional_material_note"] = (
                "Трава/сено — основные кандидатные материалы; солома оставлена "
                "только вариантом. Это авторское ограничение для среза, не доказательство пашни."
            )
        if pr_id == "pr_60054a3a805e2024":
            item["source_refs"] = "master:n1230:material_item:int0021"
        item["source_status"] = "candidate"
        out.append(item)
    out.sort(key=lambda row: row["pr_id"])

    # The reviewed artifact is a detached candidate copy. Keep its item records
    # consistent with the revised homestead rules without editing source catalogs.
    records_by_id = {row["it_id"]: row for row in source["candidate_item_records"]}
    for row in out:
        if row["pr_id"] in CONTAINER_CATEGORY:
            for item_ref in [row["item_ref"],
                             *[variant["item_ref"] for variant in row.get("variants", [])]]:
                record = records_by_id.get(item_ref)
                if record is not None:
                    record["category_id"] = row["category_ref"]
    mat = records_by_id.get("it_hh_straw_mat")
    if mat is None:
        raise ValueError("candidate item record missing: it_hh_straw_mat")
    mat["material"] = "grass;hay"
    mat["candidate_material_variants"] = ["straw"]
    mat["master_refs"] = ";".join(
        ref for ref in mat["master_refs"].split(";")
        if ref != "n1230:material_item:msc0001")
    mat["source_refs"] = ";".join(
        ref for ref in mat["source_refs"].split(";")
        if ref != "master:n1230:material_item:msc0001")
    mat["candidate_material_note"] = (
        "Grass/hay are the candidate materials; straw is only a variant, "
        "not evidence of local arable production."
    )
    blanket = records_by_id.get("it_hh_wool_blanket")
    if blanket is None:
        raise ValueError("candidate item record missing: it_hh_wool_blanket")
    blanket["master_refs"] = ";".join(
        ref for ref in blanket["master_refs"].split(";")
        if ref != "n1230:material_item:mil0023")
    blanket["source_refs"] = ";".join(
        ref for ref in blanket["source_refs"].split(";")
        if ref != "master:n1230:material_item:mil0023")
    blanket["attestation"] = (
        "Candidate dwelling basis: master INT0021. MIL0023 is not used for this rule."
    )

    accepted_unchanged = set(attestation_a["approved_rows_items"])
    output_by_id = {row["pr_id"]: row for row in out}
    source_by_id = {row["pr_id"]: row for row in homestead}
    for pr_id in accepted_unchanged:
        if output_by_id.get(pr_id) != source_by_id[pr_id]:
            raise ValueError(f"unchanged Opus A row changed: {pr_id}")

    result = copy.deepcopy(source)
    result["schema"] = "rus.v17_channels.o1_homestead_candidate.v2"
    result["candidate_id"] = "novgorod_v17_vikhtuy_o1_homestead_4a4_candidate"
    result["status"] = "pending_short_reapproval"
    result["approved"] = False
    result["import_authorized"] = False
    result["activation_authorized"] = False
    result["scope_selectors"] = [{
        "scope_kind": "place_family",
        "place_family_ref": PF,
        "g4_ref": G4,
        "source_pf_id": "peasant_homestead",
    }]
    result["target"] = {
        "world_revision_id": source["target"]["world_revision_id"],
        "g4_ref": G4,
        "regional_scope_label": "Нижняя Двина / Вихтуй",
        "regional_scope_status": "candidate_limit",
        "region_id": None,
        "region_id_gap": (
            "В presence-контракте есть PF scope и optional region_id, но "
            "одобренный region_id для узкой зоны Вихтуя не найден. Этот sidecar "
            "ограничивает пакет целевым G4; он не разрешает импорт PF-правил как глобальных."
        ),
        "scope_limit": "Только homestead PF внутри Vikhtuy G4; никакого global PF import, generated/visited places или outbuildings.",
    }
    result["approval_requests"] = [
        "Коротко переутвердить изменённые homestead rows по таблице out/v17-channels-o1-data-4a4.md; 55 unchanged rows сверяются скриптом с подписью A.",
        "Утвердить или заменить общую частоту после объединения kadka/lohanya: исходные frequency классы различаются.",
        "Подтвердить, что candidate regional limit применяется только к Vikhtuy G4; до одобренного region_id/import mapping activation запрещена.",
        "Не утверждать outbuildings, spouse access, внутренности избы, 69 master-only rows или children gap этим пакетом.",
    ]
    result["candidate_presence_rules"] = out
    result["candidate_item_records"] = source["candidate_item_records"]
    result["source_scope_rows_not_submitted"] = {
        "outbuildings": [copy.deepcopy(row) for row in rules
                         if row["scope_ref"] == "pf_outbuildings@1"],
        "note": "Сохранены из 4a2 как исходные candidates; REVIEW-8 не утверждает их.",
    }
    result["excluded_or_gap_rows"] = exclusions
    result["unresolved_coverage_gaps"] = [
        {"id": "dwelling_interior_items", "count": 5,
         "items": ["it_hh_splinter_holder_wood", "it_hh_tallow_candle",
                   "it_hh_spindle", "it_hh_needle", "it_hh_dipper"],
         "reason": "Внутренности dwelling_interior; не авторить для homestead PF."},
        {"id": "master_archive_rows_without_item", "count": 69,
         "reason": "Нет записи предмета; не считать историческим отсутствием."},
        {"id": "children_in_composition", "count": None,
         "reason": "Утверждённый composition не создаёт детей; не выводить их из вещей."},
    ]
    result["review_result"] = {
        "o1a_verdict": attestation_a["decision"],
        "o1b_verdict": attestation_b["decision"],
        "unchanged_rows": 55,
        "rows_needing_fix_before_reapproval": 24,
        "rejected_rows": 3,
        "source_homestead_rows": 82,
        "candidate_homestead_rows": len(out),
        "all_rows_remain_candidate": True,
    }
    result["candidate_counts_4a4"] = {
        "homestead_presence_rules": len(out),
        "outbuilding_rules_submitted": 0,
        "rejected_from_pool": len(REJECTED),
        "typed_gaps_not_in_pool": len(GAPS),
        "merged_source_rows": 2,
    }
    result["source_pins_4a4"] = source_hashes
    return result, exclusions


def build_placement(pool, placement_source, source_hashes):
    candidate_by_id = {row["pr_id"]: row for row in pool["candidate_presence_rules"]}
    original_rows = {row["pr_id"]: row for row in
                     read_json(START_DATA)["candidate_presence_rules"]}
    by_presence = {row["presence_pr_id"]: row
                   for row in placement_source["candidate_rules"]}
    rules = []
    used_source_ids = set()
    for row in pool["candidate_presence_rules"]:
        source_ids = row.get("merged_source_pr_ids", [row["pr_id"]])
        if not any(original_rows[pr_id]["placement_basis_ref"] ==
                   "no_source:placement_modes_absent" for pr_id in source_ids):
            continue
        primary_id = row["pr_id"]
        placement = copy.deepcopy(by_presence[primary_id])
        placement["rule_id"] = f"placement_{primary_id}"
        placement["presence_pr_id"] = primary_id
        placement["source_presence_pr_ids"] = source_ids
        placement["scope_ref"] = PF
        placement["category_ref"] = row["category_ref"]
        placement["allowed_item_refs"] = [row["item_ref"],
            *[variant["item_ref"] for variant in row.get("variants", [])]]
        placement["variant_source_rows"] = [
            {"source_row_id": variant["source_row_id"],
             "source_pool": variant["source_pool"],
             "item_ref": variant["item_ref"]}
            for variant in row.get("variants", [])
        ]
        placement["entry_visible_if"] = row["entry_visible_if"]
        placement["search_only_if"] = row.get("search_only_if")
        placement["placement_basis_ref"] = [
            "data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md §8.1 (NULL/NULL => editorial 1/1 default)",
            "data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt §1, §12 (placement/disclosure semantics)",
            "no_source:placement_modes_absent (Stage 16 gap retained; not source-resolved)",
        ]
        placement["placement_owner_ref"] = original_rows[primary_id]["placement_owner_ref"]
        placement["entry_exposed_weight_candidate"] = int(
            row.get("entry_exposed_weight_candidate") or 1)
        placement["search_concealed_weight_candidate"] = int(
            row.get("search_concealed_weight_candidate") or 0)
        if primary_id in OPEN_ONLY:
            placement["search_only_if"] = None
            placement["entry_exposed_weight_candidate"] = 1
            placement["search_concealed_weight_candidate"] = 0
            placement["placement_basis_ref"].append(
                "logical_necessity: catalog size_band large/bulky + items_and_property.txt §12")
            placement["editorial_note"] = (
                "Только открыто: крупная/тяжёлая вещь не может быть concealed; "
                "это не историческая вероятность. Source Stage 16 gap сохранён."
            )
        used_source_ids.update(source_ids)
        rules.append(placement)
    rules.sort(key=lambda item: item["rule_id"])

    all_homestead_gaps = {row["pr_id"] for row in original_rows.values()
        if row["scope_ref"] == PF
        and row["placement_basis_ref"] == "no_source:placement_modes_absent"}
    gap_rows_retained = set()
    for row in pool["candidate_presence_rules"]:
        for source_id in row.get("merged_source_pr_ids", [row["pr_id"]]):
            if source_id in all_homestead_gaps:
                gap_rows_retained.add(source_id)
    excluded_gap_ids = all_homestead_gaps - gap_rows_retained

    result = copy.deepcopy(placement_source)
    result["schema"] = "rus.v17_channels.o1_placement_authoring_candidate.v2"
    result["candidate_id"] = "novgorod_v17_vikhtuy_o1_placement_4a4_candidate"
    result["status"] = "pending_short_reapproval"
    result["approved"] = False
    result["import_authorized"] = False
    result["activation_authorized"] = False
    result["scope"] = "Только candidate homestead PF rows в Vikhtuy G4; outbuildings и другие G4 не входят."
    result["candidate_rules"] = rules
    result["source_gap_marker_register"] = {
        "source_marker": "no_source:placement_modes_absent",
        "source_row_count": len(all_homestead_gaps),
        "retained_source_pr_ids": sorted(gap_rows_retained),
        "excluded_source_pr_ids": sorted(excluded_gap_ids),
        "all_original_markers_preserved_in_pool_or_exclusion_record":
            len(gap_rows_retained | excluded_gap_ids) == len(all_homestead_gaps),
        "placement_owner_ref_preserved_for_candidate_rows": True,
        "note": "Merge может свести два source PR к одной derived presence/placement row; source IDs сохранены отдельно.",
    }
    result["source_pins_4a4"] = source_hashes
    result["counts"] = {
        "candidate_placement_rules": len(rules),
        "source_no_source_markers": len(all_homestead_gaps),
        "open_only_rules": sum(1 for row in rules
                               if row["search_only_if"] is None),
        "source_rows_merged": sum(len(row["source_presence_pr_ids"]) - 1
                                   for row in rules),
    }
    result["approval_request"] = (
        "Повторно утвердить только changed homestead placement rows: 4 O1B-01 source rows now open-only; "
        "remaining no_source rows retain Stage 16 marker and owner. No import/activation."
    )
    return result


def render_report(pool, placement):
    return f"""# O1 homestead 4a4: candidate corrections for short re-approval

Статус пакета: `pending_short_reapproval`; `approved=false`, `import_authorized=false`, `activation_authorized=false`. Исходные 4a2/4a3 файлы и game-base каталоги не изменялись.

## Объём

- Opus A: 55/82 unchanged rows сверяются с attestation; из 24 нуждавшихся в правке 21 строка остаётся в пуле после candidate correction, 3 выведены в typed gaps; 3 rejected исключены только из автоматического O1 pool.
- Opus B: владение/размещение остаются кандидатами `approve_with_limits`; spouse access не включён. `owner_ref/controller_ref` будущий runtime связывает по slot правилу, при этом `holder_ref=null` для размещённой вещи.
- В 4a4 остаются {pool['candidate_counts_4a4']['homestead_presence_rules']} homestead presence rules; обитательские и outbuilding rules не включены. Outbuildings представлены отдельно только как исходные rows без утверждения.

## Изменённые правила

| Группа | Строки | Изменение |
|---|---|---|
| Отклонено из автозаполнения | `pr_a2e55eee216b584d`, `pr_8d7283c31896f66a`, `pr_8b8877b0b5d6304d` | Перо, нож писца, чехол для гребня остаются в источниках/запасе мира; O1 не бросает их автоматически. |
| Container facet | `pr_1d74054e7a56924f`, `pr_1ea1130e807a7799`, `pr_c5fced1141ce47ad`, `pr_324f66380a3ac4ef`, `pr_dc29d7d9a216fc97`, `pr_778a18a1b37b42b6`, `pr_804e4033a1f92cee`, `pr_6b3aed4a3cdde2cf`, `pr_320d010b5bbcad63` | Использованы существующие draft `container_form` категории. Кадка/лохань сведены в одно правило с вариантами; различие исходной частоты отмечено как открытый пункт переутверждения. Нет параллельных O1 правил по `cat_item_object_*`. |
| Container gaps | `pr_03f58bdce56a4b98`, `pr_6799f4e1aa8721c2` | Берестяной чехол и фляга не включены: нужен владелец container facet; для фляги также нет сельского основания. |
| Редкость | `pr_8ac3452938c181e1`, `pr_f1910c9dd6b9c22b`, `pr_3b69bc5d887f0d94`, `pr_fc849544932d1ecd`, `pr_558f8a68fa018bb9`, `pr_69e8c51d0432bfc7`, `pr_33dbe944cad6306b`, `pr_33fc66815e7b904e`, `pr_1b1d2e6d1622a471`, `pr_666699806d22311e` | Класс `rare`, candidate `125000 ppm`; variants не удалены. Калибровка остаётся candidate. |
| Соломенный мат | `pr_ebc47f9329ad0665` | `ubiquitous/1000000` → `common/500000`; основание строки — INT0016. В item candidate материалы `grass;hay`, солома отдельно записана как вариант. |
| Пелёнка | `pr_fa135671049a473a` | Убрана из unconditional O1. Остаётся child-conditional gap до появления младенца в составе. |
| Одеяло | `pr_60054a3a805e2024` | В rule basis оставлен INT0021; военная ассоциация MIL0023 убрана. |
| Placement O1B-01 | `pr_67ae629fa56a23b5`, `pr_beebe70fcabd3fad`, `pr_c5fced1141ce47ad`, `pr_320d010b5bbcad63` | Только открыто: `search_only_if=null`, concealed weight 0, exposed weight 1. После merge tub/washtub это 3 derived rules, 4 исходных PR refs. Основание — size/mass/carry form + §12, не историческая вероятность. |
| Placement O1B-06 | все исходные homestead no-source rows | `no_source:placement_modes_absent` и `placement_owner_ref` сохранены в candidate или exclusion register; редакционный §8.1 не закрывает Stage 16 gap. |

## Ограничения scope и пробелы

Кандидат ограничен G4 `{G4}` и PF `pf_peasant_homestead@1` с меткой региона «Нижняя Двина / Вихтуй». Одобренного узкого `region_id` не найдено; контракт presence умеет PF и optional `region_id`, поэтому sidecar scope нельзя превращать в глобальные PF rows при импорте. Нужна отдельная проверка/решение owner до активации. Это кандидатная граница, не новая схема.

Без предметных строк оставлены 5 вещей внутренности `dwelling_interior`, 69 master-only rows без item record и child-conditional items. Пелёнка не доказывает наличие младенца. `holder_kind=household_member` не материализуется как текущий holder; spouse access не утверждён.

Частота объединённой кадки/лоханей открыта: tub исходно common/500000, washtub contextual/250000. В кандидате сохранена базовая частота tub и отмечен запрос к Opus; это не финальное решение.

## Source pins

4a2: `{pool['source_pins_4a4']['ordinary-materialization-o1-start-data-candidate.json']}`  
4a3 placement: `{pool['source_pins_4a4']['ordinary-materialization-o1-placement-authoring-4a3-candidate.json']}`  
4a3 ownership: `{pool['source_pins_4a4']['ordinary-materialization-o1-ownership-authoring-4a3-candidate.json']}`

Builder: `data/world-catalogs/novgorod/live-world-runtime-v17/build-o1-4a4-candidate.py`. Проверка: `python3 data/world-catalogs/novgorod/live-world-runtime-v17/build-o1-4a4-candidate.py --check`.
"""


def generate():
    source_hashes = {}
    source = read_json(START_DATA)
    placement_source = read_json(PLACEMENT_4A3)
    attestation_a = read_json(ATTEST_A)
    attestation_b = read_json(ATTEST_B)
    checked_snapshot(source_hashes, attestation_a)
    checked_snapshot({}, attestation_b)
    container_category_ids()
    pool, _ = build_pool(source, attestation_a, attestation_b, source_hashes)
    placement = build_placement(pool, placement_source, source_hashes)
    report = render_report(pool, placement)
    return pool, placement, report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="verify generated artifacts without writing")
    args = parser.parse_args()
    pool, placement, report = generate()
    if args.check:
        expected = ((OUT_POOL, pool), (OUT_PLACEMENT, placement))
        for path, data in expected:
            if not path.exists() or path.read_text(encoding="utf-8") != (
                    json.dumps(data, ensure_ascii=False, indent=2) + "\n"):
                raise SystemExit(f"STALE: {path}")
        if not OUT_REPORT.exists() or OUT_REPORT.read_text(encoding="utf-8") != report:
            raise SystemExit(f"STALE: {OUT_REPORT}")
        print(json.dumps({"pass": True,
                          "homestead_rules": len(pool["candidate_presence_rules"]),
                          "placement_rules": len(placement["candidate_rules"]),
                          "source_gap_markers": placement["source_gap_marker_register"]["source_row_count"],
                          "open_only_rules": placement["counts"]["open_only_rules"],
                          "import_authorized": False,
                          "activation_authorized": False}, ensure_ascii=False))
        return
    write_json(OUT_POOL, pool)
    write_json(OUT_PLACEMENT, placement)
    OUT_REPORT.write_text(report, encoding="utf-8")
    print(json.dumps({"written": [str(OUT_POOL), str(OUT_PLACEMENT),
                                   str(OUT_REPORT)],
                      "homestead_rules": len(pool["candidate_presence_rules"]),
                      "placement_rules": len(placement["candidate_rules"]),
                      "status": pool["status"],
                      "import_authorized": False,
                      "activation_authorized": False}, ensure_ascii=False))


if __name__ == "__main__":
    main()
