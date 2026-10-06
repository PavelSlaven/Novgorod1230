"""Candidate provenance ledger for the D39 BIC archive crosswalk selection."""
import json
import os
import re
import csv
import unicodedata


GROUP = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
MANIFEST = os.path.join(GROUP, "authoring", "archive_inclusion_manifest.json")
NEEDS_CHECK = os.path.join(GROUP, "authoring", "needs_check.csv")
FIELDS = ["archive_ref", "archive_name", "archive_action", "match_type", "game_base_ref", "owner_group", "target_group", "target_ref", "basis", "evidence_basis", "family_key",
          "derivation", "confidence", "period", "region", "generation_policy", "anachronism_risk", "semantic_result", "guard_result", "dedup_result", "reason"]
NEEDS_CHECK_FIELDS = ["archive_id", "current_result", "current_target_group", "current_target_ref", "reason_code", "finding_ref", "cluster_id", "note", "block_pattern_ru", "block_pattern_lat", "doubt_kind", "block_region", "block_period", "block_exception"]
DENY = re.compile(r"картоф|кукуруз|(?<!\w)томат|подсолн|табак|индейк|тяжелов|\bчай\b|кофе|сахар|огнестрел|порох|пищал|кирпичн\w* изб|стекольн|застеклённ\w* окн\w* изб", re.I)


def expected_basis(action, confidence, evidence_basis):
    evidence = (evidence_basis or "").casefold()
    if action == "include_analogy" or confidence in {"C", "D"} or "гипотез" in evidence:
        return "analogy"
    if confidence == "A" and "прям" in evidence:
        return "sourced"
    if confidence == "B" and "реконструкц" in evidence:
        return "logical_necessity"
    return "logical_necessity"


def normalize_name(value):
    value = unicodedata.normalize("NFKC", value or "").casefold()
    return "".join(ch for ch in value if ch.isalnum())


def material_family(value):
    text = re.sub(r"[^a-zа-яё]+", "_", (value or "").casefold()).strip("_")
    aliases = {
        "wood": "wood", "timber": "wood", "shingle_conifer": "wood", "дерево": "wood", "древесина": "wood",
        "birch_bark": "birch_bark", "береста": "birch_bark",
        "iron": "iron", "железо": "iron", "metal": "metal", "металл": "metal",
        "bronze": "bronze", "бронза": "bronze", "copper": "copper", "медь": "copper",
        "lime": "lime", "известь": "lime", "clay": "clay", "глина": "clay",
        "ceramic": "clay", "керамика": "clay", "plinfa": "clay", "плинфа": "clay",
        "stone": "stone", "камень": "stone", "quartz_sand": "sand", "sand": "sand", "песок": "sand",
        "beeswax": "wax", "wax": "wax", "воск": "wax", "bone": "bone", "кость": "bone",
        "leather": "leather", "кожа": "leather", "moss": "moss", "мох": "moss",
    }
    for part in text.split("_"):
        if part in aliases:
            return aliases[part]
        for prefix, family in (("дерев", "wood"), ("плинф", "clay"), ("извест", "lime"),
                               ("желез", "iron"), ("бронз", "bronze"), ("мед", "copper"),
                               ("глин", "clay"), ("камен", "stone"), ("берест", "birch_bark")):
            if part.startswith(prefix):
                return family
    return aliases.get(text)


def source_material_family(source):
    """Prefer explicit core-material nouns over a mixed/composite primary_material."""
    scope = source.get("_scope", source)
    name = (scope.get("name_ru") or source.get("name_ru") or "").casefold()
    explicit = (
        ("дерев", "wood"), ("древес", "wood"), ("бревн", "wood"), ("доск", "wood"),
        ("плинф", "clay"), ("посуд", "clay"), ("керамик", "clay"),
        ("камен", "stone"), ("щебен", "stone"),
        ("желез", "iron"), ("гвозд", "iron"), ("заклеп", "iron"),
        ("мед", "copper"), ("берест", "birch_bark"),
        ("извест", "lime"), ("штукатур", "lime"), ("кость", "bone"), ("костя", "bone"),
        ("кож", "leather"), ("мох", "moss"),
    )
    for token, family in explicit:
        if token in name:
            if family == "wood" and (
                re.search(r"(?:отпечат|след|остат|примес)[^,;]{0,28}" + re.escape(token), name)
                or re.search(r"\bна\s+(?:доск|древес)[^,;]*", name)
            ):
                continue  # wood is only a contact/substrate, not the item's core material.
            return family
    source_material = scope.get("primary_material", "")
    if not source_material and scope.get("subcategory", "").endswith(("_material", "_waste")):
        source_material = scope.get("materials", "")
    return material_family(source_material)


def material_identity_error(source, target_id, target_class):
    """Reject a material target unless source and target identify same material family."""
    source_family = source_material_family(source)
    target_family = material_family(target_id.removeprefix("mat_").removeprefix("mt_")) or material_family(target_class)
    if not source_family:
        return "source has no canonical primary_material"
    if not target_family:
        return "target has no canonical material identity"
    if source_family != target_family and {source_family, target_family} != {"iron", "metal"}:
        return "material mismatch: %s -> %s" % (source_family, target_family)
    return ""


TARGET_ID_FIELDS = {
    "buildings/materials_vocab.csv": "mat_id",
    "buildings/building_parts.csv": "bp_id",
    "containers/container_forms.csv": "ct_id",
    "interiors/material_entities.csv": "item_id",
    "interiors/furniture_fixtures_light.csv": "item_id",
    "interiors/scenes.csv": "sc_id",
}


def records():
    with open(MANIFEST, encoding="utf-8") as f:
        data = json.load(f)
    return data["records"]


def needs_check_records():
    if not os.path.exists(NEEDS_CHECK):
        return []
    with open(NEEDS_CHECK, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames != NEEDS_CHECK_FIELDS:
            raise ValueError("needs_check.csv has invalid header")
        return list(reader)


def default_master_dir(group):
    return os.path.abspath(os.path.join(group, "..", "..", "sources", "master-archive-v1", "data"))


def build_entity_rows(group, read_csv, matcult_dir=None, master_dir=None):
    master_root = os.path.join(master_dir or default_master_dir(group), "normalized_source_tables", "material_entities")
    source_rows = {r.get("item_id"): r for r in read_csv(os.path.join(master_root, "material_entities.csv"), ",")}
    material_fields = list(next(iter(source_rows.values()), {}).keys())
    mil_path = os.path.abspath(os.path.join(group, "..", "items-weapons-armour", "authoring", "master_military_snapshot.csv"))
    military_rows = {r.get("item_id"): r for r in read_csv(mil_path, ",")}
    matcult_rows = {}
    if matcult_dir:
        matcult_rows = {r.get("item_id"): r for r in read_csv(os.path.join(matcult_dir, "catalog_items.csv"), ",")}
    result = []
    queued = {row["archive_id"] for row in needs_check_records()}
    for item in records():
        if item.get("owner_group") != "buildings-interiors-containers" or item.get("semantic_result") != "distinct" or item.get("match_type") != "new":
            continue
        archive_id = item.get("archive_ref", "").rsplit(":", 1)[-1]
        if archive_id in queued:
            continue
        source = source_rows.get(archive_id)
        is_catalog_entity = False
        if source is None and archive_id in {"CON0019"}:
            source = matcult_rows.get(archive_id)
            is_catalog_entity = bool(source)
        if source is None and archive_id in {"MIL0014", "MIL0028"}:
            source = military_rows.get(archive_id)
            is_catalog_entity = bool(source)
        if source is None:
            if "/catalog_items.csv:" in item.get("archive_ref", ""):
                continue  # REL* entities are built into furniture_fixtures_light.csv from the matcult catalogue.
            raise ValueError("BIC archive entity source unresolved: " + archive_id)
        if is_catalog_entity:
            row = {field: "" for field in material_fields}
            source_ids = [value.strip() for value in source.get("source_ids", "").split("|") if value.strip()]
            materials = [value.strip() for value in source.get("materials", "").split(",") if value.strip()]
            row.update(
                name_ru=source.get("name_ru", ""), record_origin="imp_bic_archive_addition",
                object_scope="material_entity_type", entity_kind="equipment" if archive_id.startswith("MIL") else "waste",
                category=source.get("category", ""), subcategory=source.get("subcategory", ""),
                description_ru=source.get("description_ru", ""), function=source.get("function", ""),
                family_key=item.get("family_key", ""), who_used=source.get("who_used", ""),
                profession_scope=source.get("profession_scope", ""), where_used=source.get("where_used", ""),
                social_scope=source.get("social_scope", ""), military_scope=source.get("military_scope", ""),
                region_scope=item.get("region", ""), period_from=item.get("period", "").split("–", 1)[0],
                period_to=item.get("period", "").split("–", 1)[-1], primary_material="mixed",
                materials=json.dumps(materials, ensure_ascii=False), construction=source.get("construction", ""),
                dimensions=source.get("dimensions", ""), weight_if_known=source.get("weight_if_known", ""),
                wear_and_condition=source.get("wear_and_condition", ""),
                historical_confidence=source.get("historical_confidence", ""),
                locality_precision=source.get("locality_precision", ""), evidence_basis=source.get("evidence_basis", ""),
                source_ids=json.dumps(source_ids, ensure_ascii=False),
                do_not_confuse_with=source.get("do_not_confuse_with", ""),
                anachronism_risk=source.get("anachronism_risk", ""),
                notes_for_image_generation=source.get("notes_for_image_generation", ""),
                period_note=source.get("period_note", ""), generation_policy=source.get("generation_policy", ""),
                visual_reference_required=source.get("visual_reference_required", ""),
            )
            if archive_id == "CON0019":
                row["primary_material"] = "clay"
            refs = [item.get("archive_ref", "")]
            if archive_id.startswith("MIL"):
                refs.append("items-weapons-armour/authoring/master_military_snapshot.csv#" + archive_id)
            refs.extend("matcult_src:" + source_id for source_id in source_ids)
        else:
            row = dict(source)
            refs = ["sources/master-archive-v1/data/normalized_source_tables/material_entities/material_entities.csv:" + archive_id]
        row.update(
            item_id="n1230:material_item:" + archive_id.lower(),
            basis=item.get("basis", ""),
            derivation=("category-level evidence (category_form_material_process_or_context): " if item.get("basis") == "sourced" else "") + source.get("evidence_basis", ""),
            source_refs=refs,
            confidence=source.get("historical_confidence", ""),
            status="candidate",
        )
        result.append(row)
    return result


def build_ledger(group, read_csv, matcult_dir=None, existing_group=None, master_dir=None):
    rows = records()
    needs_check = {row["archive_id"]: row for row in needs_check_records()}
    master_root = os.path.join(master_dir or default_master_dir(group), "normalized_source_tables", "material_entities")
    source_cache = {}
    for filename, id_field in (("material_entities.csv", "item_id"), ("state_variants.csv", "state_id")):
        try:
            source_cache.update({r.get(id_field): r for r in read_csv(os.path.join(master_root, filename), ",")})
        except (OSError, TypeError):
            pass
    if matcult_dir:
        source_cache.update({r.get("item_id"): r for r in read_csv(os.path.join(matcult_dir, "catalog_items.csv"))})
    included_matcult_ids = {
        item.get("archive_ref", "").rsplit(":", 1)[-1]
        for item in rows
        if item.get("owner_group") == "buildings-interiors-containers"
        and item.get("semantic_result") == "distinct"
        and "/catalog_items.csv:" in item.get("archive_ref", "")
    }
    existing = set()
    existing_group = existing_group or group
    for rel, col in (("buildings/building_types.csv", "name_ru"), ("buildings/building_parts.csv", "name_ru"),
                     ("containers/container_forms.csv", "name_ru"), ("interiors/furniture_fixtures_light.csv", "name_ru"),
                     ("interiors/matcult_item_refs.csv", "name_ru")):
        path = os.path.join(existing_group, rel)
        if os.path.exists(path):
            existing.update(
                normalize_name(r.get(col, ""))
                for r in read_csv(path)
                if r.get(col)
                and not (rel in {"interiors/furniture_fixtures_light.csv", "interiors/matcult_item_refs.csv"}
                         and r.get("item_id", "") in included_matcult_ids)
            )
    seen_new = set()
    result = []
    for item in rows:
        row = {k: item.get(k, "") for k in FIELDS}
        if row.get("basis") == "sourced" and "category-level evidence (category_form_material_process_or_context)" not in row.get("reason", "").casefold() and "уровень категории" not in row.get("reason", "").casefold():
            row["reason"] = (row.get("reason", "") + " Основание: category-level evidence (category_form_material_process_or_context).").strip()
        archive_id = item.get("archive_ref", "").rsplit(":", 1)[-1]
        queued = needs_check.get(archive_id)
        source = source_cache.get(archive_id, {})
        row["generation_policy"] = source.get("generation_policy", "")
        row["anachronism_risk"] = source.get("anachronism_risk", "")
        if queued:
            row["match_type"] = "needs_check"
            row["archive_action"] = "needs_check"
            row["semantic_result"] = "needs_check"
            row["guard_result"] = "needs_check"
            row["dedup_result"] = "needs_check"
            result.append(row)
            continue
        issues = []
        semantic = item.get("semantic_result", "")
        if semantic == "routed":
            row["dedup_result"] = "routed_to_owner"
        elif semantic == "reference":
            row["dedup_result"] = "referenced_existing"
        elif semantic == "rejected":
            row["dedup_result"] = "rejected_d38"
        elif semantic == "duplicate_rejected":
            row["dedup_result"] = "rejected_semantic_duplicate"
            issues.append("semantic_duplicate")
        elif semantic == "context_only":
            row["dedup_result"] = "context_only"
        elif item.get("match_type") == "new":
            key = normalize_name(item.get("archive_name", ""))
            if not key:
                issues.append("empty_name")
            elif key in existing or key in seen_new:
                row["dedup_result"] = "rejected_duplicate"
                issues.append("normalized_name_duplicate")
            else:
                seen_new.add(key)
                row["dedup_result"] = "unique_new_name"
        else:
            row["dedup_result"] = "context_only" if semantic == "context_only" else "variant_not_new_entity"
        text = " ".join((item.get("archive_name", ""), item.get("period", ""), item.get("region", "")))
        hit = DENY.search(text)
        if hit:
            issues.append("denylist:" + hit.group(0))
        years = [int(y) for y in re.findall(r"(?<!\d)(1[01-9]\d{2}|20\d{2})(?!\d)", item.get("period", ""))]
        if years:
            if not (min(years) <= 1230 <= max(years)):
                issues.append("period_excludes_1230")
        elif "1230" not in item.get("period", "") and not item.get("period", "").strip():
            issues.append("period_missing")
        if not item.get("region", "").strip():
            issues.append("region_missing")
        if semantic == "rejected":
            row["guard_result"] = "reject:d38_research_only"
        elif issues:
            row["guard_result"] = "reject:" + "|".join(issues)
        elif semantic == "routed":
            row["guard_result"] = "pass:routed"
        else:
            row["guard_result"] = {"variant": "pass:variant", "context_only": "pass:context_only"}.get(semantic, "pass:included")
        if issues:
            row["reason"] = (row["reason"] + " Guard: " + ", ".join(issues)).strip()
        result.append(row)
    return result


def validate_ledger(ledger, repo, matcult_dir, read_csv, master_dir=None):
    errors = []
    terminal_decisions = {"distinct": "entity", "variant": "variant", "routed": "routed", "reference": "ref", "rejected": "reject", "duplicate_rejected": "rejected", "needs_check": "needs_check"}
    authored = records()
    authored_by_ref = {item.get("archive_ref", ""): item for item in authored}
    authored_ids = [item.get("archive_ref", "").rsplit(":", 1)[-1] for item in authored]
    if len(authored) != 467 or len(set(authored_ids)) != len(authored_ids):
        errors.append("BIC authoring decision set must classify all 467 reviewed and receiving rows")
    queue_rows = needs_check_records()
    queue_by_id = {}
    for i, queue_row in enumerate(queue_rows, 2):
        archive_id = queue_row.get("archive_id", "").strip()
        where = "needs_check.csv[%d]" % i
        if not archive_id or archive_id in queue_by_id:
            errors.append("%s missing/duplicate archive_id" % where)
            continue
        queue_by_id[archive_id] = queue_row
        if archive_id not in set(authored_ids):
            errors.append("%s archive_id is absent from the authored manifest: %s" % (where, archive_id))
        if queue_row.get("reason_code", "") not in {"review_finding", "unresolved"} and not re.fullmatch(r"ICA_[A-Z_]+", queue_row.get("reason_code", "")):
            errors.append("%s invalid reason_code" % where)
        if queue_row.get("finding_ref", "") and not re.fullmatch(r"round3-(?:bicw|crafts)\.md#L[1-9][0-9]*", queue_row["finding_ref"]):
            errors.append("%s invalid finding_ref" % where)
        if not queue_row.get("current_result", "").strip():
            errors.append("%s missing current_result" % where)
        item = next((row for row in authored if row.get("archive_ref", "").endswith(":" + archive_id)), None)
        if item:
            expected_target = item.get("target_ref", "") or item.get("game_base_ref", "")
            if queue_row.get("current_result", "") != item.get("semantic_result", ""):
                errors.append("%s current_result differs from manifest proposal: %s" % (where, archive_id))
            if queue_row.get("current_target_group", "") != item.get("target_group", "") or queue_row.get("current_target_ref", "") != expected_target:
                errors.append("%s current target differs from manifest proposal: %s" % (where, archive_id))
    decision_ids = set(authored_ids) - set(queue_by_id)
    if (decision_ids & set(queue_by_id)) or (decision_ids | set(queue_by_id)) != set(authored_ids) or len(authored_ids) != 467:
        errors.append("BIC decisions and needs_check queue do not partition all 467 archive IDs")
    for item in authored:
        semantic = item.get("semantic_result", "")
        expected_decision = terminal_decisions.get(semantic)
        if not expected_decision or item.get("decision") != expected_decision:
            errors.append("BIC authoring row %s lacks an explicit terminal decision" % item.get("archive_ref", "?"))
        if semantic == "distinct" and item.get("owner_group") != "buildings-interiors-containers":
            errors.append("BIC entity decision lacks explicit owner_group: %s" % item.get("archive_ref", "?"))
        if semantic == "reference" and item.get("match_type") != "reference":
            errors.append("BIC reference must use match_type=reference: %s" % item.get("archive_ref", "?"))
        if semantic == "rejected" and (item.get("match_type") != "rejected" or item.get("anachronism_result") != "rejected"):
            errors.append("BIC D38 rejection must use match_type=rejected and anachronism_result=rejected: %s" % item.get("archive_ref", "?"))
    required = set(FIELDS) - {"family_key", "owner_group", "generation_policy", "anachronism_risk", "target_group", "target_ref"}
    master_dir = master_dir or os.path.join(repo, "data/world-catalogs/novgorod/sources/master-archive-v1/data")
    master_cache = {}
    matcult_cache = {}
    for rel, id_col in (("data/normalized_source_tables/material_entities/material_entities.csv", "item_id"),
                        ("data/normalized_source_tables/material_entities/state_variants.csv", "state_id")):
        path = os.path.join(master_dir, rel[len("data/"):])
        try:
            master_cache[rel] = {r.get(id_col): r for r in read_csv(path)}
        except OSError:
            pass
    matcult_cache = {r.get("item_id"): r for r in read_csv(os.path.join(matcult_dir, "catalog_items.csv"))}
    expected_ledger = build_ledger(GROUP, read_csv, matcult_dir, master_dir=master_dir)
    if ledger != expected_ledger:
        errors.append("generated archive inclusion ledger differs from authored manifest/current guards/catalog")
    entity_rows = read_csv(os.path.join(GROUP, "interiors/material_entities.csv")) if os.path.exists(os.path.join(GROUP, "interiors/material_entities.csv")) else []
    entities_by_ref = {row.get("item_id", "").casefold(): row for row in entity_rows}
    target_fields = dict(TARGET_ID_FIELDS)
    target_fields.update({"buildings/building_types.csv": "bt_id", "containers/content_categories.csv": "category_id",
                          "items/household.csv": "item_id", "items/personal.csv": "item_id",
                          "materials_registry/material_entities.csv": "item_id", "places/place_families.csv": "pf_id",
                          "places-binding/places/place_families.csv": "pf_id"})
    existing = set()
    for rel in ("buildings/building_types.csv", "buildings/building_parts.csv", "containers/container_forms.csv",
                "interiors/furniture_fixtures_light.csv", "interiors/matcult_item_refs.csv"):
        path = os.path.join(GROUP, rel)
        if os.path.exists(path):
            existing.update(normalize_name(r.get("name_ru", "")) for r in read_csv(path) if r.get("name_ru"))
    seen = set()
    seen_families = {}
    for i, row in enumerate(ledger, 1):
        where = "archive_inclusion_ledger[%d]" % i
        ident = row.get("archive_ref", "").rsplit(":", 1)[-1]
        queued = ident in queue_by_id
        if queued and (row.get("semantic_result") != "needs_check"
                       or row.get("match_type") != "needs_check"
                       or row.get("archive_action") != "needs_check"):
            errors.append("%s queued archive ID lacks neutral needs_check status: %s" % (where, ident))
        needs_ref = row.get("match_type") == "variant" and row.get("semantic_result") != "routed" and not queued
        missing = [k for k in required if (needs_ref or k != "game_base_ref") and not str(row.get(k, "")).strip()]
        if missing:
            errors.append("%s missing required fields: %s" % (where, ",".join(sorted(missing))))
        if row.get("basis") not in {"sourced", "analogy", "logical_necessity"}:
            errors.append("%s invalid basis" % where)
        if row.get("confidence") not in {"A", "B", "C", "D"}:
            errors.append("%s invalid confidence" % where)
        if row.get("match_type") not in ({"new", "variant", "reference", "rejected", "needs_check"} if queued else {"new", "variant", "reference", "rejected"}):
            errors.append("%s invalid match_type" % where)
        if row.get("archive_action") not in ({"include_d39", "include_analogy", "add_variant", "reference_only", "reject_d38", "needs_check"} if queued else {"include_d39", "include_analogy", "add_variant", "reference_only", "reject_d38"}):
            errors.append("%s invalid archive_action" % where)
        if row.get("match_type") == "variant" and row.get("archive_action") not in {"add_variant", "include_d39"}:
            errors.append("%s variant has invalid archive_action" % where)
        if row.get("archive_action") == "add_variant" and row.get("match_type") != "variant" and row.get("semantic_result") not in {"routed", "reference", "rejected"}:
            errors.append("%s add_variant creates a new entity" % where)
        if row.get("semantic_result") not in ({"distinct", "variant", "duplicate_rejected", "context_only", "routed", "reference", "rejected", "needs_check"} if queued else {"distinct", "variant", "duplicate_rejected", "context_only", "routed", "reference", "rejected"}):
            errors.append("%s missing/invalid semantic_result" % where)
        if not queued:
            if "семантическое решение:" not in row.get("reason", "").casefold():
                errors.append("%s lacks explicit semantic decision rationale" % where)
            expected = expected_basis(row.get("archive_action"), row.get("confidence"), row.get("evidence_basis"))
            if row.get("basis") != expected:
                errors.append("%s basis does not match source evidence (expected %s)" % (where, expected))
            if row.get("basis") == "sourced" and not any(marker in row.get("reason", "").casefold() for marker in ("уровень категории", "category-level evidence (category_form_material_process_or_context)")):
                errors.append("%s sourced basis lacks category-level caveat" % where)
        ref = row.get("archive_ref", "")
        ident = ref.rsplit(":", 1)[-1]
        canonical = None
        expected_derivation = ident
        if ref.startswith("data/normalized_source_tables/"):
            source_path = ref.split(":", 1)[0]
            canonical = master_cache.get(source_path, {}).get(ident)
            if os.path.exists(os.path.join(master_dir, source_path[len("data/"):])):
                expected_derivation = source_path + "#" + ident
            if source_path.endswith("state_variants.csv") and canonical:
                base_id = canonical.get("base_item_id", "")
                base = master_cache.get("data/normalized_source_tables/material_entities/material_entities.csv", {}).get(base_id)
                canonical = dict(canonical)
                canonical["_scope"] = base or matcult_cache.get(base_id, {})
        elif "/catalog_items.csv:" in ref:
            canonical = matcult_cache.get(ident)
        if not canonical:
            errors.append("%s unresolved archive source: %s" % (where, ref))
        else:
            scope = canonical.get("_scope", canonical)
            canonical_period = str(scope.get("period_from", "")) + "–" + str(scope.get("period_to", ""))
            if canonical_period == "–":
                canonical_period = scope.get("period_note", "")
            checks = [("archive_name", canonical.get("name_ru", "")),
                      ("confidence", canonical.get("historical_confidence", "")),
                      ("evidence_basis", canonical.get("evidence_basis", "")),
                      ("generation_policy", canonical.get("generation_policy", "")),
                      ("anachronism_risk", canonical.get("anachronism_risk", "")),
                      ("family_key", scope.get("family_key", "")),
                      ("period", canonical_period), ("region", scope.get("region_scope", "")),
                      ("derivation", expected_derivation)]
            for field, value in checks:
                if field in canonical or field in {"archive_name", "confidence", "evidence_basis", "family_key", "period", "region", "derivation"}:
                    if row.get(field, "") != value:
                        errors.append("%s %s differs from canonical source (expected %s)" % (where, field, value))
        if queued:
            entity_id = "n1230:material_item:" + ident.lower()
            if entity_id.casefold() in entities_by_ref or ident.casefold() in entities_by_ref:
                errors.append("%s needs_check row materialized an entity: %s" % (where, ident))
            years = [int(y) for y in re.findall(r"(?<!\d)(1[01-9]\d{2}|20\d{2})(?!\d)", row.get("period", ""))]
            if not years or not (min(years) <= 1230 <= max(years)):
                errors.append("%s queued period missing or excludes 1230: %s" % (where, row.get("period", "")))
            if not row.get("region", "").strip():
                errors.append("%s queued region missing" % where)
            continue
        if row.get("semantic_result") == "routed":
            if not row.get("target_group"):
                errors.append("%s routed record missing target_group" % where)
            elif row.get("target_ref") and row.get("game_base_ref") != row.get("target_ref"):
                errors.append("%s routed game_base_ref must equal target_ref" % where)
            if row.get("match_type") == "variant":
                errors.append("%s routed record cannot be a variant" % where)
        elif row.get("semantic_result") == "reference":
            if not row.get("target_ref") or not row.get("game_base_ref"):
                errors.append("%s reference record missing stable target_ref/game_base_ref" % where)
            elif row.get("game_base_ref") != row.get("target_ref"):
                errors.append("%s reference game_base_ref must equal target_ref" % where)
            if not row.get("target_group"):
                errors.append("%s reference record missing target_group" % where)
            else:
                target = row.get("target_ref", "")
                if "#" not in target:
                    errors.append("%s reference target is not a stable file/id ref: %s" % (where, target))
                else:
                    target_path, target_id = target.rsplit("#", 1)
                    target_group = row.get("target_group", "")
                    base = os.path.join(repo, "data/world-catalogs/novgorod/game-base-v1")
                    target_root = GROUP if target_group == "buildings-interiors-containers" else os.path.join(base, target_group)
                    if target_group == "places-binding":
                        target_root = base
                    path = os.path.join(target_root, target_path)
                    field = target_fields.get(target_path)
                    try:
                        target_rows = read_csv(path)
                        if not field and target_rows:
                            field = next(iter(target_rows[0]))
                        target_exists = bool(field) and any(values.get(field) == target_id for values in target_rows)
                    except (OSError, ValueError):
                        target_exists = False
                    if not target_exists:
                        errors.append("%s unresolved reference target: %s#%s" % (where, target_path, target_id))
        elif row.get("semantic_result") == "rejected":
            if authored_by_ref.get(ref, {}).get("anachronism_result") != "rejected" or row.get("archive_action") != "reject_d38":
                errors.append("%s D38 rejection lacks rejected result/action" % where)
            source_policy = (canonical or {}).get("generation_policy") or (canonical or {}).get("_scope", {}).get("generation_policy", "")
            if source_policy != "research_only" or "d38" not in row.get("reason", "").casefold():
                errors.append("%s D38 rejection lacks research_only source or concrete reason" % where)
        elif row.get("match_type") == "variant":
            source_policy = (canonical or {}).get("generation_policy") or (canonical or {}).get("_scope", {}).get("generation_policy", "")
            if source_policy == "research_only":
                errors.append("%s D38 rejects research_only variant: %s" % (where, ident))
            target = row.get("game_base_ref", "")
            if not target.startswith("buildings-interiors-containers/"):
                errors.append("%s variant target outside BIC: %s" % (where, target))
            else:
                target_rel = target[len("buildings-interiors-containers/"):]
                if "#" in target_rel:
                    target_path, target_id = target_rel.rsplit("#", 1)
                else:
                    target_path, target_id = target_rel.rsplit(":", 1)
                path = os.path.join(GROUP, target_path)
                try:
                    target_rows = read_csv(path)
                    id_field = TARGET_ID_FIELDS.get(target_path)
                    target_row = next((values for values in target_rows
                                       if id_field and values.get(id_field) == target_id), None)
                    target_exists = not re.fullmatch(r"row-\d+", target_id) and target_row is not None
                except (OSError, ValueError):
                    target_exists = False
                    target_row = None
                if not target_exists:
                    errors.append("%s unresolved/noncanonical variant target: %s" % (where, target))
                target_identity = target_id.rsplit(":", 1)[-1].casefold()
                source_identity = ident.rsplit(":", 1)[-1].casefold()
                if target_identity == source_identity:
                    errors.append("%s variant targets itself: %s" % (where, target))
                if target_path == "buildings/materials_vocab.csv" and target_row:
                    identity_error = material_identity_error(canonical or {}, target_id, target_row.get("material_class", ""))
                    if identity_error:
                        errors.append("%s variant target material/category mismatch: %s -> %s (%s)" % (
                            where, ident, target_id, identity_error))
        if row.get("semantic_result") == "distinct":
            if "/catalog_items.csv:" in ref:
                entity_ids = {value.get("item_id", "").casefold() for value in read_csv(os.path.join(GROUP, "interiors/furniture_fixtures_light.csv"))}
                if (row.get("owner_group") != "buildings-interiors-containers"
                        or (ident.casefold() not in entity_ids
                            and ("n1230:material_item:" + ident.lower()).casefold() not in entities_by_ref)):
                    errors.append("%s distinct matcult row lacks its BIC entity owner row: %s" % (where, ident))
            else:
                entity_id = "n1230:material_item:" + ident.lower()
                if row.get("owner_group") != "buildings-interiors-containers" or entity_id.casefold() not in entities_by_ref:
                    errors.append("%s distinct archive row lacks its BIC entity owner row: %s" % (where, ident))
        if row.get("match_type") == "new" and row.get("semantic_result") not in {"duplicate_rejected", "context_only", "routed", "reference", "rejected"}:
            key = normalize_name(row.get("archive_name", ""))
            if not key or key in existing or key in seen:
                errors.append("%s normalized-name duplicate/empty: %s" % (where, row.get("archive_name", "")))
            seen.add(key)
        if row.get("match_type") == "new" and row.get("semantic_result") == "distinct" and row.get("family_key"):
            family = row["family_key"]
            if family in seen_families:
                errors.append("%s unresolved family_key duplicate with %s: %s" % (where, seen_families[family], family))
            seen_families[family] = where
        allowed_guards = {"pass:included", "pass:variant", "pass:context_only", "pass:routed", "pass:reference"}
        if row.get("semantic_result") == "rejected":
            allowed_guards = {"reject:d38_research_only"}
        if row.get("semantic_result") == "duplicate_rejected":
            allowed_guards = {"reject:semantic_duplicate"}
        if row.get("guard_result") not in allowed_guards:
            errors.append("%s failed inclusion guards: %s" % (where, row.get("guard_result", "")))
        years = [int(y) for y in re.findall(r"(?<!\d)(1[01-9]\d{2}|20\d{2})(?!\d)", row.get("period", ""))]
        if not years or not (min(years) <= 1230 <= max(years)):
            errors.append("%s period missing or excludes 1230: %s" % (where, row.get("period", "")))
        if not row.get("region", "").strip():
            errors.append("%s region missing" % where)
    return errors
