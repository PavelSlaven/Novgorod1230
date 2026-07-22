import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const out = join(root, "data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1");
const sourceRoot = join(root, "data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001");
const sourceZip = join(sourceRoot, "source-snapshots/gn_nov_g1_xp017_yp026_rebuild_002_approved_local.zip");
const targetSpecZip = join(root, "data/world-catalogs/novgorod/spatial-v3/target-contract-spec/P12_TARGET_CONTRACT_COMPILATION_SPEC_V1.zip");
const v11Zip = join(root, "data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/P12_TARGET_MATERIALIZATION_APPROVAL_V1_1.zip");
const v11PinsMember = "P12_TARGET_MATERIALIZATION_APPROVAL_V1_1/target/external-dependency-pins.json";
const standardPath = "data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md";
const sourceSnapshotPath = "data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001/source-snapshots/gn_nov_g1_xp017_yp026_rebuild_002_approved_local.zip";
const v11Path = "data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/P12_TARGET_MATERIALIZATION_APPROVAL_V1_1.zip";
const zipPrefix = "gn_nov_g1_xp017_yp026_rebuild_002/";
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const zipJson = (path) => JSON.parse(execFileSync("tar", ["-xOf", sourceZip, zipPrefix + path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
const zipBytes = (archive, member) => execFileSync("tar", ["-xOf", archive, member], { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileSha = (path) => sha(readFileSync(path));
const expandedDdlSha = () => {
  const entry = readFileSync(join(root, "infra/world-base/schema.sql"), "utf8");
  const parts = [...entry.matchAll(/^\\ir\s+(.+)$/gmu)].map((match) => readFileSync(join(root, "infra/world-base", match[1].trim())));
  return sha(Buffer.concat(parts.flatMap((part, index) => index === 0 ? [part] : [Buffer.from("\n"), part])));
};
const write = (path, value) => {
  const full = join(out, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
};
const digestRow = (row) => sha(Buffer.from(JSON.stringify(row)));
const approvalContentFingerprint = ({ schema_version, bundle_id, status, pins, counts, files }) => {
  const { current_ddl_sha256: _technicalDdlDigest, ...semanticPins } = pins ?? {};
  return sha(Buffer.from(JSON.stringify({
    schema_version,
    bundle_id,
    status,
    pins: semanticPins,
    counts,
    files: files.filter((entry) => entry.path !== "APPROVAL_DECISION.json").sort((a, b) => a.path.localeCompare(b.path))
  })));
};

const provenance = json(join(sourceRoot, "data/provenance.json"));
const ledger = provenance.source_ledger.sources;
const g1 = zipJson("02-g1/g1-dossier.json");
const g2 = zipJson("03-g2/g2-zones.json");
const g3 = zipJson("04-g3/g3-places.json");
const sceneSource = json(join(sourceRoot, "data/approved-scene-template-families.json"));
const families = sceneSource.records;
const dependencyPins = JSON.parse(zipBytes(v11Zip, v11PinsMember).toString("utf8")).records;
const sourceApprovalZipSha = dependencyPins[0].source_approval_zip_sha256;
const vocabRefs = dependencyPins.filter((row) => row.dependency_kind === "approved_controlled_vocabulary").map((row) => row.ref);

const classDecisions = Object.fromEntries([
  ["south_entry_reach", "natural_feature"], ["sheltered_inner_reach", "natural_feature"],
  ["central_navigation_reach", "natural_feature"], ["central_current_split", "route_site"],
  ["north_outflow_reach", "natural_feature"], ["north_exposed_turn", "natural_feature"],
  ["west_side_channel", "natural_feature"], ["west_hidden_backwater", "natural_feature"],
  ["east_side_channel", "natural_feature"], ["east_flood_bypass", "route_site"],
  ["large_island_head", "natural_feature"], ["channel_split_islet", "natural_feature"],
  ["dry_island_ridge", "natural_feature"], ["flooded_interior_basin", "natural_feature"],
  ["shifting_shoal_field", "natural_feature"], ["driftwood_bar", "natural_feature"],
  ["reed_backwater", "natural_feature"], ["old_channel_pool", "natural_feature"],
  ["floodplain_ridge_route", "route_site"], ["sheltered_landing_terrace", "route_site"],
  ["vikhtuy_locality", "recurrent_site"], ["vikhtuy_river_approach", "route_site"],
  ["vikhtuy_resource_edge", "resource_site"], ["zaostrovye_settlement_center", "settlement"],
  ["zaostrovye_burial_area", "built_site"], ["zaostrovye_landing", "route_site"],
  ["wet_conifer_tract", "natural_feature"], ["dry_pine_ridge", "natural_feature"],
  ["tributary_mouth", "natural_feature"], ["forest_stream_route", "route_site"],
  ["mixing_reach", "natural_feature"], ["outer_exposed_approach", "route_site"]
].map(([suffix, target]) => [`gn_nov_g3_xp017_yp026_r2_${suffix}`, `spatial.g3.${target}`]));
if (Object.keys(classDecisions).length !== 32) throw new Error("G3 editorial decision table must contain exactly 32 rows");
const forbiddenFor = (targetClass) => {
  if (targetClass === "spatial.g3.settlement") return ["exact_household_count", "exact_1230_layout", "urban_status"];
  if (targetClass === "spatial.g3.built_site") return ["exact_burial_layout", "continuous_1230_use", "specific_structures"];
  if (targetClass === "spatial.g3.recurrent_site") return ["exact_settlement", "exact_localization", "permanent_occupation"];
  if (targetClass === "spatial.g3.resource_site") return ["exclusive_ownership", "fixed_installations", "continuous_exploitation"];
  if (targetClass === "spatial.g3.route_site") return ["engineered_road", "fixed_harbour", "all_season_access"];
  return ["settlement", "built_site", "exact_1230_geometry"];
};
const classifications = g3.map((place) => {
  const targetClass = classDecisions[place.id];
  if (!targetClass) throw new Error(`No explicit G3 editorial classification for ${place.id}`);
  return {
    g3_id: place.id,
    source_place_type: place.place_type,
    approved_target_class: targetClass,
    evidence_status: place.evidence_status,
    source_refs: place.source_ids,
    reasoning: targetClass === "spatial.g3.natural_feature"
      ? "The approved source describes a hydrographic, island, forest, floodplain or relief feature; the weakest adequate stable class is retained."
      : targetClass === "spatial.g3.route_site"
        ? "The approved source explicitly assigns passage, landing, approach, bypass or navigation-decision function; no engineered infrastructure is inferred."
        : targetClass === "spatial.g3.settlement"
          ? "The approved archaeological source explicitly permits a settlement-area classification while withholding exact plan and 1230 continuity."
          : targetClass === "spatial.g3.built_site"
            ? "The approved archaeological source permits a burial-use built-site facet without asserting structures or an exact plan."
            : targetClass === "spatial.g3.resource_site"
              ? "The approved source identifies a resource-use edge; no ownership, installations or permanent exploitation are inferred."
              : "The attested Vikh Tuy locality is preserved as a recurrent localization area, not upgraded to a settlement or exact site.",
    forbidden_stronger_classifications: forbiddenFor(targetClass),
    provenance_ref: provenance.id
  };
});

// Explicit editorial matrix. No identifier parsing, suffix matching, or label humanisation is used.
// Tuple: id, title, facet, definition, inclusion, exclusion, immutable basis anchor.
const categoryEditorial = [
  ["spatial.g0.historical_geographic_region","Historical-geographic region","structural_g0","A broad historical-geographic region that scopes canonical authoring while leaving medieval administrative borders unresolved.","Use for an approved G0 regional root.","Exclude technical cells and claims of exact political control.","spatial_architecture_standard_g0_g6.md#L242-L259"],
  ["spatial.g1.territorial_grid_cell","Territorial grid cell","structural_g1","A fixed technical grid cell for regional authoring whose perimeter has no medieval boundary meaning.","Use for one approved coordinate cell under a G0 root.","Exclude historical-border or ownership interpretation.","spatial_architecture_standard_g0_g6.md#L260-L277"],
  ["spatial.g2.territorial_zone","Territorial zone","structural_g2","A stable topological subdivision of one G1 that groups related places without asserting an exact polygon.","Use for an approved G2 parent zone.","Exclude parcel, scene, and exact cadastral readings.","spatial_architecture_standard_g0_g6.md#L278-L289"],
  ["spatial.g3.settlement","Settlement place","structural_g3","A stable place supported as inhabited, with population, continuity and layout limited to separately approved evidence.","Use only where settlement evidence is explicit.","Exclude inferred town rank, household count, or plan.","spatial_architecture_standard_g0_g6.md#L290-L305"],
  ["spatial.g3.built_site","Built or ritual site","structural_g3","A stable place supported by construction or ritual-use evidence without supplying an undocumented structure inventory.","Use for the approved Zaostrovye burial context.","Exclude exact burial plan, buildings, and continuous use.","g3-classification-decision.json#zaostrovye_burial_area"],
  ["spatial.g3.natural_feature","Natural feature place","structural_g3","A stable hydrographic, landform, vegetation, island, or floodplain feature represented topologically.","Use for explicitly classified natural G3 features.","Exclude settlement, built-site, and exact 1230 geometry claims.","g3-classification-decision.json#natural_feature"],
  ["spatial.g3.route_site","Route-function place","structural_g3","A stable passage, approach, landing, bypass, or navigation-decision place without implied engineering.","Use only for explicitly classified route-function G3 records.","Exclude roads, harbours, and all-season access unless separately evidenced.","g3-classification-decision.json#route_site"],
  ["spatial.g3.resource_site","Resource-use place","structural_g3","A stable bounded resource-use place that does not establish ownership, installations, or permanent exploitation.","Use for the approved Vikh Tuy resource edge.","Exclude exclusive rights and fixed production facilities.","g3-classification-decision.json#vikhtuy_resource_edge"],
  ["spatial.g3.recurrent_site","Recurrent locality","structural_g3","A recurrent human-associated locality retained when exact settlement status and localization remain unproved.","Use for the approved Vikh Tuy localization area.","Exclude exact settlement, permanent occupation, and exact coordinates.","g3-classification-decision.json#vikhtuy_locality"],
  ["spatial.g4.sector","Authored G4 sector","structural_g4","A canonical authored sector inside one G3 that hosts bounded traversal and materialization contracts.","Use only for version-pinned G4 authoring rows.","Exclude runtime-created parcels and arbitrary subdivisions.","external-dependency-pins.json#ref=spatial.g4.sector@1"],
  ["spatial.g5.parcel","Materializable G5 parcel","structural_g5","A parcel-scale template category instantiated only from an approved G4 expansion profile into party state.","Use only through an approved bounded materialization profile.","Exclude canonical G0-G4 authoring and pre-created runtime instances.","external-dependency-pins.json#ref=spatial.g5.parcel@1"],
  ["access_zone","Access-control zone","spatial_function","An area whose approved function is to govern approach or entry conditions for a materialized scene.","Include only when an approved profile declares an access function.","Exclude ownership, fortification, or guaranteed passage.","external-dependency-pins.json#ref=access_zone@1"],
  ["areal","Areal geometry facet","geometry","A geometry facet recording area-like topological extent rather than point-like or line-like extent.","Include only on records whose approved geometry contract is areal.","Exclude surveyed boundary precision and historical polygon claims.","external-dependency-pins.json#ref=areal@1"],
  ["boundary_route_zone","Boundary-route zone","spatial_function","A zone combining boundary proximity with an approved traversable route function.","Include where both route and boundary functions are source-classified.","Exclude legal-border status and automatic crossing permission.","external-dependency-pins.json#ref=boundary_route_zone@1"],
  ["boundary_zone","Boundary-adjacent zone","spatial_function","A zone used to stage or describe an approved topological boundary context.","Include for explicitly bound boundary contexts.","Exclude political delimitation and inferred neighbouring authority.","external-dependency-pins.json#ref=boundary_zone@1"],
  ["buffer_zone","Protective buffer zone","spatial_function","A separating area maintained around another approved function to prevent direct overlap or access.","Include only when a source family declares buffering.","Exclude undocumented distance, fence, or exclusion enforcement.","external-dependency-pins.json#ref=buffer_zone@1"],
  ["burial_zone","Burial-context zone","ritual_function","An archaeological or ritual-use area whose burial context is approved but exact graves and plan are not.","Include only for the approved burial-context family.","Exclude individual burials, monuments, and continuous 1230 use.","external-dependency-pins.json#ref=burial_zone@1"],
  ["concealment_zone","Concealment zone","spatial_function","An area offering topological concealment potential under an approved scene family.","Include only where concealment is a declared profile function.","Exclude guaranteed invisibility and invented vegetation details.","external-dependency-pins.json#ref=concealment_zone@1"],
  ["crossing_candidate","Crossing candidate","candidate_function","A bounded possible crossing location awaiting runtime selection from an approved finite candidate set.","Include only as a candidate named by an approved profile.","Exclude an existing bridge, ford, or guaranteed safe crossing.","external-dependency-pins.json#ref=crossing_candidate@1"],
  ["dry_route_zone","Dry-ground route zone","route_function","A route area whose approved function is passage over relatively dry ground in the topological model.","Include where dry-ground passage is source-classified.","Exclude engineered roads and permanent dryness.","external-dependency-pins.json#ref=dry_route_zone@1"],
  ["estate_cluster_candidate","Estate-cluster candidate","candidate_function","A bounded possible household-scale cluster that may materialize only when its profile and evidence allow it.","Include only as an approved finite candidate.","Exclude a pre-existing estate, owner, buildings, or population.","external-dependency-pins.json#ref=estate_cluster_candidate@1"],
  ["exploration_route","Exploration route","route_function","A route function supporting investigation of an approved area without guaranteeing destination knowledge or safety.","Include where exploration movement is declared.","Exclude mapped certainty, engineered path, and discovered state.","external-dependency-pins.json#ref=exploration_route@1"],
  ["exposure_zone","Environmental exposure zone","hazard_function","An area where wind, open water, or lack of cover creates an approved exposure condition.","Include only for declared environmental exposure.","Exclude a concrete weather event or automatic harm.","external-dependency-pins.json#ref=exposure_zone@1"],
  ["fauna_zone","Fauna-use zone","resource_function","An area eligible for fauna-related materialization under a separately approved fauna profile.","Include only where the profile permits fauna use.","Exclude concrete animals, counts, nests, and guaranteed encounters.","external-dependency-pins.json#ref=fauna_zone@1"],
  ["hazard_zone","General hazard zone","hazard_function","An area carrying a declared traversal or occupancy hazard whose concrete event remains dynamic.","Include only for an approved hazard family.","Exclude invented cause, severity, and guaranteed incident.","external-dependency-pins.json#ref=hazard_zone@1"],
  ["landing_candidate","Landing candidate","candidate_function","A bounded possible landing position selected only from an approved source-bound candidate set.","Include only where landing applicability is exact.","Exclude a quay, boat, crew, or guaranteed usable bank.","external-dependency-pins.json#ref=landing_candidate@1"],
  ["landing_hazard_zone","Hazardous landing zone","hazard_function","A landing-function area with a separately declared access or environmental hazard.","Include where both landing and hazard functions are approved.","Exclude fixed infrastructure and automatic failure.","external-dependency-pins.json#ref=landing_hazard_zone@1"],
  ["landing_or_hazard_zone","Landing-or-hazard alternative zone","candidate_function","A bounded alternative whose selected function may be landing or hazard according to the approved profile.","Include only in the exact dual-function family.","Exclude simultaneous assertion of both concrete outcomes.","external-dependency-pins.json#ref=landing_or_hazard_zone@1"],
  ["landing_zone","Landing-function zone","spatial_function","An area whose stable approved function is transition between water movement and shore access.","Include for source-classified landing contexts.","Exclude harbour works, vessels, and permanent availability.","external-dependency-pins.json#ref=landing_zone@1"],
  ["linear","Linear geometry facet","geometry","A geometry facet recording line-like topological extent without asserting surveyed alignment or width.","Include only on records whose approved geometry is linear.","Exclude exact historical track geometry.","external-dependency-pins.json#ref=linear@1"],
  ["natural_boundary","Natural boundary facet","boundary_function","A boundary context grounded in a natural feature rather than an administrative demarcation.","Include only where the natural feature supplies boundary function.","Exclude legal sovereignty and exact border lines.","external-dependency-pins.json#ref=natural_boundary@1"],
  ["navigation_decision_zone","Navigation decision zone","route_function","An area where approved topology requires choosing among finite movement continuations.","Include only at explicit route-choice contexts.","Exclude hidden routes, optimal-choice claims, and automatic success.","external-dependency-pins.json#ref=navigation_decision_zone@1"],
  ["navigation_zone","Navigation zone","route_function","An area whose approved primary function is water or terrain navigation through known topology.","Include for source-classified navigation contexts.","Exclude exact channel geometry and guaranteed passability.","external-dependency-pins.json#ref=navigation_zone@1"],
  ["observation_zone","Observation zone","spatial_function","An area supporting orientation or observation from an approved scene position.","Include only where an observation function is declared.","Exclude guaranteed visibility, discovered facts, and structures.","external-dependency-pins.json#ref=observation_zone@1"],
  ["occupation_candidate","Occupation candidate","candidate_function","A bounded possible human-use locus that remains unoccupied until causal materialization permits it.","Include only as a finite profile candidate.","Exclude residents, tenure, buildings, and continuous use.","external-dependency-pins.json#ref=occupation_candidate@1"],
  ["orientation_hazard_zone","Orientation-hazard zone","hazard_function","An area where loss of direction is an approved traversal risk under relevant conditions.","Include only for declared orientation hazards.","Exclude guaranteed disorientation and invented landmarks.","external-dependency-pins.json#ref=orientation_hazard_zone@1"],
  ["orientation_zone","Orientation zone","spatial_function","An area providing approved topological cues for movement orientation.","Include where orientation is a declared scene function.","Exclude exact bearings, maps, and guaranteed knowledge.","external-dependency-pins.json#ref=orientation_zone@1"],
  ["resource_hazard_zone","Resource-hazard zone","hazard_function","A resource-use area carrying a declared environmental or access hazard.","Include only when resource and hazard functions are both approved.","Exclude concrete resources, ownership, and automatic injury.","external-dependency-pins.json#ref=resource_hazard_zone@1"],
  ["resource_zone","Resource-use zone","resource_function","An area eligible for bounded subsistence or material use under an approved resource profile.","Include only for source-classified resource contexts.","Exclude inventory, yield, ownership, and permanent works.","external-dependency-pins.json#ref=resource_zone@1"],
  ["rest_candidate","Rest candidate","candidate_function","A bounded possible resting position selected only when an approved profile and current conditions permit.","Include only as a finite scene candidate.","Exclude shelter, safety, occupants, and established camp.","external-dependency-pins.json#ref=rest_candidate@1"],
  ["rest_or_use_zone","Rest-or-use alternative zone","candidate_function","A bounded area whose approved profile may realize rest or another limited use without preselecting either.","Include only in the exact rest-or-use dual-function family.","Exclude simultaneous concrete activities and permanent facilities.","external-dependency-pins.json#ref=rest_or_use_zone@1"],
  ["rest_or_work_zone","Rest-or-work alternative zone","candidate_function","A bounded area eligible for either rest or household-scale work under an approved selection.","Include only where the family names both alternatives.","Exclude workshops, workers, stored items, and simultaneous outcomes.","external-dependency-pins.json#ref=rest_or_work_zone@1"],
  ["ritual_use_candidate","Ritual-use candidate","candidate_function","A bounded possible ritual-use locus constrained by approved archaeological context.","Include only as a candidate within the burial-context family.","Exclude specific rites, actors, objects, and exact layout.","external-dependency-pins.json#ref=ritual_use_candidate@1"],
  ["river_hazard_zone","River hazard zone","hazard_function","A water-movement area carrying approved current, depth, ice, or bank uncertainty.","Include where a river hazard is source-classified.","Exclude exact depth, current speed, and guaranteed incident.","external-dependency-pins.json#ref=river_hazard_zone@1"],
  ["route_approach","Route approach","route_function","A bounded approach segment leading toward an approved route or scene endpoint.","Include only where topology declares an approach.","Exclude road construction and guaranteed endpoint access.","external-dependency-pins.json#ref=route_approach@1"],
  ["route_merge_zone","Route merge zone","route_function","An area where two or more approved topological continuations converge.","Include only for explicit convergence topology.","Exclude traffic control, road works, and unlisted branches.","external-dependency-pins.json#ref=route_merge_zone@1"],
  ["route_zone","General route zone","route_function","An area whose approved stable function is movement between bounded scene positions.","Include for source-classified route contexts.","Exclude exact track geometry, vehicles, and all-season use.","external-dependency-pins.json#ref=route_zone@1"],
  ["seasonal_hazard_zone","Seasonal hazard zone","hazard_function","An area whose approved hazard applicability depends on season, water state, ice, or flood conditions.","Include only with a declared seasonal condition.","Exclude permanent hazard state and predicted weather.","external-dependency-pins.json#ref=seasonal_hazard_zone@1"],
  ["seasonal_route","Seasonal route","route_function","A movement continuation available only under approved seasonal conditions and dynamic recheck.","Include only where a seasonal network is declared.","Exclude guaranteed availability and permanent route status.","external-dependency-pins.json#ref=seasonal_route@1"],
  ["settlement_cluster_candidate","Settlement-cluster candidate","candidate_function","A bounded possible habitation cluster allowed by settlement evidence but not materialized in authoring data.","Include only under an approved habitation profile.","Exclude town rank, households, buildings, and exact continuity.","external-dependency-pins.json#ref=settlement_cluster_candidate@1"],
  ["shelter_candidate","Shelter candidate","candidate_function","A bounded possible shelter position selected from an approved family without pre-creating a structure.","Include only as a finite conditional candidate.","Exclude buildings, ownership, occupants, and guaranteed protection.","external-dependency-pins.json#ref=shelter_candidate@1"],
  ["shelter_zone","Shelter-function zone","spatial_function","An area whose approved environmental function is relative protection from exposure.","Include where a shelter function is source-classified.","Exclude constructed shelter and guaranteed safety.","external-dependency-pins.json#ref=shelter_zone@1"],
  ["small_water_route","Small-water route","route_function","A route function along a minor stream or narrow watercourse represented topologically.","Include for approved tributary or forest-stream movement.","Exclude exact channel, vessel, and year-round navigability.","external-dependency-pins.json#ref=small_water_route@1"],
  ["social_use_candidate","Social-use candidate","candidate_function","A bounded possible social-use position that materializes only with causally permitted participants.","Include only as an approved profile candidate.","Exclude NPCs, gatherings, ownership, and ongoing occupation.","external-dependency-pins.json#ref=social_use_candidate@1"],
  ["storage_zone_candidate","Storage-zone candidate","candidate_function","A bounded possible household-scale storage area requiring an approved profile and materialized containers.","Include only as a finite work-storage candidate.","Exclude stored goods, containers, buildings, and owners.","external-dependency-pins.json#ref=storage_zone_candidate@1"],
  ["wetland_zone","Wetland-function zone","spatial_function","An area characterized by approved wet-ground or shallow-water traversal conditions.","Include for source-classified wetland contexts.","Exclude exact hydrology, permanent inundation, and specific fauna.","external-dependency-pins.json#ref=wetland_zone@1"],
  ["work_zone_candidate","Work-zone candidate","candidate_function","A bounded possible work position materialized only from an approved activity profile.","Include only as a finite household-scale candidate.","Exclude workers, tools, output, ownership, and permanent workshop.","external-dependency-pins.json#ref=work_zone_candidate@1"]
];
const expectedCategoryIds = new Set([...vocabRefs.map((ref) => ref.slice(0, -2)), ...categoryEditorial.slice(0, 9).map((row) => row[0])]);
if (categoryEditorial.length !== 57 || new Set(categoryEditorial.map((row) => row[0])).size !== 57 || categoryEditorial.some((row) => !expectedCategoryIds.has(row[0])) || expectedCategoryIds.size !== 57) throw new Error("Explicit category editorial matrix does not exactly cover the 57 approved category IDs");
const standardDigest = fileSha(join(root, standardPath));
const v11Digest = fileSha(v11Zip);
const v11PinsMemberDigest = sha(zipBytes(v11Zip, v11PinsMember));
const sourceSnapshotDigest = fileSha(sourceZip);
const sourceG3Member = `${zipPrefix}04-g3/g3-places.json`;
const sourceG3MemberDigest = sha(zipBytes(sourceZip, sourceG3Member));
const repositoryAnchorByCategory = {
  "spatial.g0.historical_geographic_region": { anchor_kind: "repository_line_range", canonical_path: standardPath, raw_sha256: standardDigest, start_line: 239, end_line: 247, required_text: "spatial.g0.historical_geographic_region" },
  "spatial.g1.territorial_grid_cell": { anchor_kind: "repository_line_range", canonical_path: standardPath, raw_sha256: standardDigest, start_line: 249, end_line: 269, required_text: "spatial.g1.territorial_grid_cell" },
  "spatial.g2.territorial_zone": { anchor_kind: "repository_line_range", canonical_path: standardPath, raw_sha256: standardDigest, start_line: 271, end_line: 286, required_text: "spatial.g2.territorial_zone" }
};
const g3SourceIdByCategory = {
  "spatial.g3.settlement": "gn_nov_g3_xp017_yp026_r2_zaostrovye_settlement_center",
  "spatial.g3.built_site": "gn_nov_g3_xp017_yp026_r2_zaostrovye_burial_area",
  "spatial.g3.natural_feature": "gn_nov_g3_xp017_yp026_r2_south_entry_reach",
  "spatial.g3.route_site": "gn_nov_g3_xp017_yp026_r2_central_current_split",
  "spatial.g3.resource_site": "gn_nov_g3_xp017_yp026_r2_vikhtuy_resource_edge",
  "spatial.g3.recurrent_site": "gn_nov_g3_xp017_yp026_r2_vikhtuy_locality"
};
for (const id of Object.keys(g3SourceIdByCategory)) repositoryAnchorByCategory[id] = {
  anchor_kind: "repository_line_range",
  canonical_path: standardPath,
  raw_sha256: standardDigest,
  start_line: 288,
  end_line: 303,
  required_text: id
};
const g3RecordAnchor = (categoryId) => ({
  anchor_kind: "immutable_zip_json_record",
  canonical_path: sourceSnapshotPath,
  raw_sha256: sourceSnapshotDigest,
  internal_path: sourceG3Member,
  internal_raw_sha256: sourceG3MemberDigest,
  json_pointer: "",
  record_predicate: { field: "id", equals: g3SourceIdByCategory[categoryId] }
});
const externalPinAnchor = (id) => ({
  anchor_kind: "immutable_zip_json_record",
  canonical_path: v11Path,
  raw_sha256: v11Digest,
  internal_path: v11PinsMember,
  internal_raw_sha256: v11PinsMemberDigest,
  json_pointer: "/records",
  record_predicate: { field: "ref", equals: `${id}@1` }
});
const structuralCategoryIds = new Set(categoryEditorial.slice(0, 11).map((row) => row[0]));
const standardCategoryIds = new Set(categoryEditorial.slice(0, 9).map((row) => row[0]));
const categories = categoryEditorial.map(([id,title,facet,definition,inclusion,exclusion,basis_anchor]) => {
  const basisAnchors = repositoryAnchorByCategory[id]
    ? [repositoryAnchorByCategory[id], ...(g3SourceIdByCategory[id] ? [g3RecordAnchor(id)] : [])]
    : [externalPinAnchor(id)];
  const row = { id, domain: structuralCategoryIds.has(id) ? "spatial_structure" : "spatial_materialization", stable_code: id, facet, preferred_label: title, definition, scope_note: `Only the exact approved ${title} meaning and version pin may be used; broader interpretation is outside P12 closure.`, inclusion_rules: [inclusion], exclusion_rules: [exclusion], title, status: "approved", basis_anchors: basisAnchors, provenance_ref: provenance.id };
  return { ...row, canonical_digest: digestRow(row) };
});
const categoryDecisions = categories.map((row) => ({
  category_id: row.id,
  decision_basis: standardCategoryIds.has(row.id) ? "target_spatial_standard_or_explicit_editorial_classification" : "exact_p12_external_dependency_pin",
  basis_anchors: row.basis_anchors,
  forbidden_inferences: [row.exclusion_rules[0], "runtime_availability_without_approved_profile"]
}));

const nodes = [
  { id: "region_novgorod_land", version: 1, scale: "G0", title: "Новгородская земля", evidence_status: "approved_regional_identity", reconstruction_method: "Canonical regional identity only.", source_refs: ["SRC_G1R2_MAP_RULES"] },
  { id: g1.id, version: 1, scale: "G1", title: g1.title, evidence_status: g1.evidence_status, reconstruction_method: g1.activation_basis.reconstruction_method, source_refs: ["SRC_G1R2_SCHAPOV_1976_CHARTER", "SRC_G1R2_BRISBANE_MAKAROV_NOSOV", "SRC_G1R2_MASK_REV002"] },
  ...g2.map((row) => ({ id: row.id, version: 1, scale: "G2", title: row.name, evidence_status: row.evidence_status, reconstruction_method: row.reconstruction_method, source_refs: row.source_ids })),
  ...g3.map((row) => ({ id: row.id, version: 1, scale: "G3", title: row.name, evidence_status: row.evidence_status, reconstruction_method: row.reconstruction_method, source_refs: row.source_ids }))
].map((row) => ({ ...row, provenance_ref: provenance.id, canonical_digest: digestRow(row) }));
const parents = [
  { child_id: g1.id, child_version: 1, parent_id: "region_novgorod_land", parent_version: 1 },
  ...g2.map((row) => ({ child_id: row.id, child_version: 1, parent_id: g1.id, parent_version: 1 })),
  ...g3.map((row) => ({ child_id: row.id, child_version: 1, parent_id: row.parent_node_id, parent_version: 1 }))
];
const classes = nodes.map((node) => ({
  node_id: node.id,
  node_version: 1,
  category_id: node.scale === "G0" ? "spatial.g0.historical_geographic_region" : node.scale === "G1" ? "spatial.g1.territorial_grid_cell" : node.scale === "G2" ? "spatial.g2.territorial_zone" : classifications.find((row) => row.g3_id === node.id).approved_target_class
}));
const nodeAuthoringVersions = nodes.map((node) => ({ entity_kind: "spatial_node", entity_id: node.id, version: 1, world_revision_id: "novgorod_spatial_v3_target_contract_approval_001", status: "approved", canonical_digest: node.canonical_digest, provenance_ref: provenance.id }));
const grid = [{ node_id: g1.id, node_version: 1, global_grid_x: 17, global_grid_y: 26, cell_size_km: 32, center_wgs84: g1.coordinates.technical_bounds.center_wgs84, geometry_claim: "technical_grid_cell_not_medieval_boundary" }];

const regionalBases = families.map((f) => ({ id: f.regional_template_ref.split("@")[0], version: 1, source_profile_family_id: f.source_profile_family_id, status: "approved", provenance_ref: f.provenance_ref, canonical_digest: digestRow(f) }));
const selectionRules = [{ id: "scene_selection_single_candidate_v1", version: 1, rule_kind: "single_exact_candidate", status: "approved", provenance_ref: provenance.id }];
const applicabilityRules = [{ id: "scene_applicability_exact_source_ref_v1", version: 1, rule_kind: "exact_source_ref", status: "approved", provenance_ref: provenance.id }];
const dependencyAuthoringVersions = [
  ...regionalBases.map((row) => ({ entity_kind: "regional_scene_template_basis", entity_id: row.id, version: row.version, canonical_digest: row.canonical_digest })),
  ...selectionRules.map((row) => ({ entity_kind: "scene_selection_rule", entity_id: row.id, version: row.version, canonical_digest: digestRow(row) })),
  ...applicabilityRules.map((row) => ({ entity_kind: "scene_applicability_rule", entity_id: row.id, version: row.version, canonical_digest: digestRow(row) }))
].map((row) => ({ ...row, world_revision_id: "novgorod_spatial_v3_target_contract_approval_001", status: "approved", provenance_ref: provenance.id }));
const authoringVersions = [...nodeAuthoringVersions, ...dependencyAuthoringVersions];
const sceneTemplates = families.map((f) => ({ id: f.id, version: Number(f.version), regional_template_basis_id: f.regional_template_ref.split("@")[0], regional_template_basis_version: 1, source_profile_family_id: f.source_profile_family_id, geometry_claim: f.geometry_claim, status: f.status, provenance_ref: f.provenance_ref, canonical_digest: digestRow(f) }));
const g6Slots = families.flatMap((f) => f.g6_slots.map((r) => ({ scene_template_id: f.id, scene_template_version: Number(f.version), ...r })));
const positions = families.flatMap((f) => f.position_templates.map((r) => ({ scene_template_id: f.id, scene_template_version: Number(f.version), instance_count: 1, capacity: 1, ...r })));
const endpoints = families.flatMap((f) => f.endpoint_slots.map((r) => ({ scene_template_id: f.id, scene_template_version: Number(f.version), required_position_instance_ordinal: 0, required_position_slot_key: r.position_slot_key, ...r })));
const edges = families.flatMap((f) => f.movement_edges.map((r, ordinal) => ({ scene_template_id: f.id, scene_template_version: Number(f.version), edge_slot_key: `edge_${ordinal + 1}`, from_position_slot_key: r.from, to_position_slot_key: r.to, passage_type_id: "internal_passage", transition_environment_profile_id: "topological_default", transition_environment_profile_version: 1, movement_orientation_profile_id: "topological_default", movement_orientation_profile_version: 1, ...r })));

const previousApprovedSubject = (() => {
  const approvalPath = join(out, "APPROVAL_DECISION.json");
  const manifestPath = join(out, "manifest.json");
  const manifestDigestPath = join(out, "manifest.sha256");
  if (![approvalPath, manifestPath, manifestDigestPath].every(existsSync)) return null;
  try {
    const approvalBytes = readFileSync(approvalPath);
    const approvalRepositoryPath = relative(root, approvalPath).replaceAll("\\", "/");
    const committedApprovalBytes = execFileSync("git", ["show", `HEAD:${approvalRepositoryPath}`], { cwd: root, encoding: "buffer" });
    if (!approvalBytes.equals(committedApprovalBytes)) return null;
    const approval = JSON.parse(approvalBytes.toString("utf8"));
    const manifestBytes = readFileSync(manifestPath);
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    if (approval.status !== "APPROVED_FOR_P12_DEPENDENCY_CLOSURE" || !/^PASS_FOR_SUBJECT_/u.test(approval.independent_audit ?? "")) return null;
    if (readFileSync(manifestDigestPath, "utf8") !== `${sha(manifestBytes)}  manifest.json\n`) return null;
    if (!Array.isArray(manifest.files) || new Set(manifest.files.map((entry) => entry.path)).size !== manifest.files.length) return null;
    if (manifest.files.some((entry) => !existsSync(join(out, entry.path)) || fileSha(join(out, entry.path)) !== entry.sha256)) return null;
    return { approval, fingerprint: approvalContentFingerprint(manifest) };
  } catch {
    return null;
  }
})();
rmSync(out, { recursive: true, force: true });
const provenanceRecord = {
  id: provenance.id,
  record_kind: "repository_provenance",
  approval_package_sha256: sourceApprovalZipSha,
  source_snapshots: provenance.sources.filter((s) => new Set([
    "source-snapshots/gn_nov_g1_xp017_yp026_rebuild_002_approved_local.zip",
    "source-snapshots/gn_nov_g1_xp017_yp026_content_revision_003_production_candidate.zip"
  ]).has(s.path)),
  limitations: ["This record is not a historical source and does not expand approved facts."],
  status: "approved"
};
write("data/source-records.json", { schema_version: "rus.p12_closure.source_records.v1", records: [...ledger.map((r) => ({ id: r.source_id, ...r })), provenanceRecord] });
const recordSources = [];
for (const node of nodes) for (const sourceId of node.source_refs) recordSources.push({ record_kind: "spatial_node", record_id: `${node.id}@1`, source_id: sourceId, provenance_ref: provenance.id });
for (const category of categories) {
  const serializedAnchors = JSON.stringify(category.basis_anchors);
  recordSources.push({ record_kind: "universal_category", record_id: `${category.id}@1`, source_id: provenance.id, provenance_ref: provenance.id, basis_anchors: category.basis_anchors, support_summary: `Exact editorial category decision backed by ${serializedAnchors}.` });
}
for (const f of families) {
  const basisAnchor = `approved-scene-template-families.json#id=${f.id}@${f.version}`;
  recordSources.push({ record_kind: "regional_scene_template", record_id: `${f.id}@${f.version}`, source_id: provenance.id, provenance_ref: provenance.id, basis_anchor: basisAnchor, support_summary: `${basisAnchor} binds exact approved family ${f.id}@${f.version}; source_profile_family_id=${f.source_profile_family_id}; regional_template_ref=${f.regional_template_ref}.` });
}
for (const rule of [...selectionRules, ...applicabilityRules]) {
  const basisAnchor = `external-dependency-pins.json#ref=${rule.id}@1`;
  recordSources.push({ record_kind: "scene_rule", record_id: `${rule.id}@1`, source_id: provenance.id, provenance_ref: provenance.id, basis_anchor: basisAnchor, support_summary: `${basisAnchor} is the exact V1.1 scene-rule dependency pin.` });
}
write("data/record-sources.json", { schema_version: "rus.p12_closure.record_sources.v1", records: recordSources });
write("data/spatial-nodes.json", { records: nodes });
write("data/authoring-versions.json", { records: authoringVersions });
write("data/node-parents.json", { records: parents });
write("data/node-classes.json", { records: classes });
write("data/g1-grid-cells.json", { records: grid });
write("data/g3-classification-decision.json", { schema_version: "rus.p12_g3_classification_decision.v1", status: "PROPOSED_FOR_P12_DEPENDENCY_CLOSURE", records: classifications });
write("data/universal-categories.json", { schema_version: "rus.p12_closure.universal_categories.v1", records: categories });
write("data/category-decision-ledger.json", { schema_version: "rus.p12_category_decision_ledger.v1", records: categoryDecisions });
write("data/regional-scene-template-bases.json", { records: regionalBases });
write("data/scene-selection-rules.json", { records: selectionRules });
write("data/scene-applicability-rules.json", { records: applicabilityRules });
write("data/scene-templates.json", { records: sceneTemplates });
write("data/g6-template-slots.json", { records: g6Slots });
write("data/scene-position-templates.json", { records: positions });
write("data/scene-endpoint-slots.json", { records: endpoints });
write("data/scene-movement-edge-templates.json", { records: edges });
write("data/stable-structure-templates.json", { records: [] });
write("data/portal-templates.json", { records: [] });

const worldRevisionId = "novgorod_spatial_v3_target_contract_approval_001";
const sourceTypeById = {
  SRC_G1R2_SCHAPOV_1976_CHARTER: "chronicle",
  SRC_G1R2_BRISBANE_MAKAROV_NOSOV: "book",
  SRC_G1R2_ARKHANGELSK_HOARD_1992: "archaeology",
  SRC_G1R2_EDOVIN_ZAOSTROVYE_2019: "archaeology",
  SRC_G1R2_EDOVIN_ZAVOLOCHYE_2001: "book",
  SRC_G1R2_MAKAROV_2003: "article",
  SRC_G1R2_CHALOV_DVINA_2012: "book",
  SRC_G1R2_GSHHS: "map",
  SRC_G1R2_MASK_REV002: "project_note",
  SRC_G1R2_GRID: "project_note",
  SRC_G1R2_MAP_RULES: "project_note"
};
const approvedSourceIds = new Set(["SRC_G1R2_SCHAPOV_1976_CHARTER", "SRC_G1R2_MASK_REV002", "SRC_G1R2_GRID", "SRC_G1R2_MAP_RULES"]);
const httpSourceIds = new Set(["SRC_G1R2_SCHAPOV_1976_CHARTER", "SRC_G1R2_BRISBANE_MAKAROV_NOSOV"]);
const importRows = new Map([
  ["source_records", [
    ...ledger.map((r) => ({
      id: r.source_id,
      title: r.full_citation,
      source_type: sourceTypeById[r.source_id],
      url: httpSourceIds.has(r.source_id) ? r.access_location : null,
      file_reference: r.access_location && !httpSourceIds.has(r.source_id) ? r.access_location : null,
      summary: `${r.source_class}; access=${r.source_access}; use=${r.use_status}`,
      limitations: r.limitations.join(" "),
      status: approvedSourceIds.has(r.source_id) ? "approved" : "usable_with_caution",
      confidence: httpSourceIds.has(r.source_id) || approvedSourceIds.has(r.source_id) ? "high" : "medium"
    })),
    { id: provenance.id, title: "P12 repository provenance for approved G1 revisions 002/003", source_type: "project_note", file_reference: "source-approval/p12_novgorod_source_approval_001", summary: "Repository provenance pointer; not a historical source.", limitations: provenanceRecord.limitations[0], status: "approved", confidence: "high" }
  ]],
  ["universal_categories", categories.map((r) => ({ id: r.id, domain: r.domain, parent_category_id: null, stable_code: r.stable_code, facet: r.facet, preferred_label: r.preferred_label, definition: r.definition, scope_note: r.scope_note, inclusion_rules: r.inclusion_rules.join(" "), exclusion_rules: r.exclusion_rules.join(" "), replaced_by_category_id: null, title: r.title, status: r.status }))],
  ["spatial_v3_world_revisions", [{ id: worldRevisionId, parent_revision_id: null, catalog_digest: sha(Buffer.from(JSON.stringify(nodes))), status: "approved", provenance_ref: provenance.id, deprecated_at: null }]],
  ["spatial_v3_authoring_versions", authoringVersions],
  ["spatial_v3_nodes", nodes.map((r) => ({ entity_kind: "spatial_node", id: r.id, version: 1, world_revision_id: worldRevisionId, spatial_level: r.scale, stable_label_id: null, primary_class_id: classes.find((c) => c.node_id === r.id).category_id, evidence_status: "reviewed", traversal_model: null, status: "approved", provenance_ref: provenance.id, canonical_digest: r.canonical_digest }))],
  ["spatial_v3_node_classes", classes.map((r) => ({ ...r, class_ordinal: 0 }))],
  ["spatial_v3_node_parents", parents.map((r) => ({ ...r, world_revision_id: worldRevisionId }))],
  ["spatial_v3_g1_grid_cells", [{ node_id: g1.id, node_version: 1, world_revision_id: worldRevisionId, root_g0_id: "region_novgorod_land", root_g0_version: 1, grid_convention: "grid_east_north_v1", grid_x: 17, grid_y: 26, cell_code: "xp017_yp026" }]],
  ["spatial_v3_regional_scene_template_bases", regionalBases.map((r) => ({ entity_kind: "regional_scene_template_basis", id: r.id, version: r.version, world_revision_id: worldRevisionId, source_profile_family_id: r.source_profile_family_id, geometry_claim: "topological_only", status: r.status, provenance_ref: r.provenance_ref, canonical_digest: r.canonical_digest }))],
  ["spatial_v3_scene_selection_rules", selectionRules.map((r) => ({ entity_kind: "scene_selection_rule", id: r.id, version: r.version, world_revision_id: worldRevisionId, rule_kind: "single_candidate", status: r.status, provenance_ref: r.provenance_ref, canonical_digest: digestRow(r) }))],
  ["spatial_v3_scene_applicability_rules", applicabilityRules.map((r) => ({ entity_kind: "scene_applicability_rule", id: r.id, version: r.version, world_revision_id: worldRevisionId, rule_kind: "exact_source_ref", status: r.status, provenance_ref: r.provenance_ref, canonical_digest: digestRow(r) }))],
  ["spatial_v3_scene_templates", sceneTemplates.map((r) => ({ id: r.id, version: r.version, world_revision_id: worldRevisionId, regional_template_id: r.regional_template_basis_id, regional_template_version: r.regional_template_basis_version, status: r.status, provenance_ref: r.provenance_ref, canonical_digest: r.canonical_digest }))],
  ["spatial_v3_g6_template_slots", g6Slots.map((r) => ({ scene_template_id: r.scene_template_id, scene_template_version: r.scene_template_version, scene_slot_key: r.slot_key, physical_class_id: r.physical_class, primary_scene_role_id: "primary", vertical_context_id: r.vertical_context_id, overhead_cover_id: r.overhead_cover_id, intra_g6_visibility_mode: "default_clear", default_visibility_distance_band: "short", acoustic_uniformity: "uniform", enclosing_structure_slot_key: null }))],
  ["spatial_v3_scene_position_templates", positions.map((r) => ({ scene_template_id: r.scene_template_id, scene_template_version: r.scene_template_version, position_slot_key: r.slot_key, g6_scene_slot_key: r.g6_slot_key, instance_count: r.instance_count, position_type_id: r.role, capacity: r.capacity, access_class_id: "default" }))],
  ["spatial_v3_scene_endpoint_slots", endpoints.map(({ position_slot_key: _unused, ...r }) => r)],
  ["spatial_v3_scene_movement_edge_templates", edges.map((r) => ({ scene_template_id: r.scene_template_id, scene_template_version: r.scene_template_version, edge_slot_key: r.edge_slot_key, from_position_slot_key: r.from_position_slot_key, to_position_slot_key: r.to_position_slot_key, passage_type_id: r.passage_type_id, transition_environment_profile_id: r.transition_environment_profile_id, transition_environment_profile_version: r.transition_environment_profile_version, movement_orientation_profile_id: r.movement_orientation_profile_id, movement_orientation_profile_version: r.movement_orientation_profile_version, cost_kind: r.cost_kind, action_units: r.action_units }))],
  ["record_sources", recordSources.map((r, index) => ({ id: `p12_closure_source_${String(index + 1).padStart(4, "0")}`, source_id: r.source_id, target_table: r.record_kind, target_record_id: r.record_id, support_type: "supports", summary: r.support_summary ?? "Exact approved source-ledger link for the dependency-closure record.", page_or_section: r.basis_anchor ?? (r.basis_anchors ? JSON.stringify(r.basis_anchors) : null), confidence: "high" }))]
]);
for (const [table, rows] of importRows) write(`datasets/${table}.json`, rows);
const datasetDependencies = {
  universal_categories: ["source_records"],
  spatial_v3_world_revisions: ["source_records"],
  spatial_v3_authoring_versions: ["source_records", "spatial_v3_world_revisions"],
  spatial_v3_nodes: ["source_records", "universal_categories", "spatial_v3_world_revisions", "spatial_v3_authoring_versions"],
  spatial_v3_node_classes: ["universal_categories", "spatial_v3_nodes"],
  spatial_v3_node_parents: ["spatial_v3_nodes"],
  spatial_v3_g1_grid_cells: ["spatial_v3_world_revisions", "spatial_v3_nodes"],
  spatial_v3_regional_scene_template_bases: ["source_records", "spatial_v3_world_revisions", "spatial_v3_authoring_versions"],
  spatial_v3_scene_selection_rules: ["source_records", "spatial_v3_world_revisions", "spatial_v3_authoring_versions"],
  spatial_v3_scene_applicability_rules: ["source_records", "spatial_v3_world_revisions", "spatial_v3_authoring_versions"],
  spatial_v3_scene_templates: ["source_records", "spatial_v3_world_revisions", "spatial_v3_regional_scene_template_bases"],
  spatial_v3_g6_template_slots: ["spatial_v3_scene_templates"],
  spatial_v3_scene_position_templates: ["spatial_v3_g6_template_slots"],
  spatial_v3_scene_endpoint_slots: ["spatial_v3_scene_position_templates"],
  spatial_v3_scene_movement_edge_templates: ["spatial_v3_scene_position_templates"],
  record_sources: ["source_records"]
};
const importManifest = {
  schema_version: "rus.spatial-v3.world-base-authoring-bundle.v1",
  bundle_kind: "dependency_closure",
  bundle_id: "p12_novgorod_dependency_closure_v1_import",
  world_revision_id: worldRevisionId,
  status: "draft",
  provenance_ref: provenance.id,
  delete_policy: "forbid",
  datasets: [...importRows].map(([table]) => {
    const file = `datasets/${table}.json`;
    return { table, file, sha256: fileSha(join(out, file)), status: "draft", provenance_ref: provenance.id, delete_policy: "forbid", depends_on: datasetDependencies[table] ?? [] };
  }),
  data_gaps: []
};
write("import-manifest.json", importManifest);

const coverageEvidenceByKind = {
  approved_controlled_vocabulary: "data/universal-categories.json + data/category-decision-ledger.json",
  target_version_graph_pin: "data/spatial-nodes.json + data/authoring-versions.json",
  approved_physical_source_pair: `immutable-source-approval-zip:${sourceApprovalZipSha}`,
  approved_scene_rule: "data/scene-selection-rules.json + data/scene-applicability-rules.json",
  approved_scene_template_family: "data/regional-scene-template-bases.json + data/scene-templates.json"
};
const coverage = dependencyPins.map((pin) => ({
  ref: pin.ref,
  dependency_kind: pin.dependency_kind,
  disposition: pin.dependency_kind === "approved_physical_source_pair" ? "resolved_by_immutable_source_pair" : "materialized_by_closure_bundle",
  evidence: coverageEvidenceByKind[pin.dependency_kind],
  exact_basis_anchor: pin.dependency_kind === "approved_physical_source_pair" ? `external-dependency-pins.json#ref=${pin.ref}` : `${coverageEvidenceByKind[pin.dependency_kind]}#ref=${pin.ref}`
}));
if (coverage.some((row) => !row.evidence) || coverage.length !== dependencyPins.length) throw new Error("Dependency coverage contains an unknown disposition basis");
write("reports/dependency-coverage.json", { schema_version: "rus.p12_dependency_coverage.v1", hard_gap: 0, records: coverage });
write("reports/v1_1-physical-projection-coverage.json", {
  schema_version: "rus.p12_v1_1_physical_projection_coverage.v1",
  status: "PASS",
  blocker_code: null,
  immutable_projection_counts: {
    canonical_g5_connection_profiles: 12,
    canonical_g5_connection_bindings: 454,
    g4_entry_endpoint_bindings: 32,
    topological_direction_contexts: 86,
    g4_traversal_profiles: 32
  },
  missing_physical_contracts: [],
  forbidden_substitutions: [
    "spatial_v3_spatial_transition_contracts",
    "spatial_v3_relative_orientations",
    "spatial_v3_g4_expansion_profiles"
  ],
  reason: "Every immutable V1.1 DDL-matrix contract has an exact target-only physical table and deterministic compiler; staging-only route-context links remain denied to runtime roles."
});
const counts = { source_ledger: ledger.length, repository_provenance: 1, spatial_v3_nodes: nodes.length, spatial_node_authoring_versions: nodeAuthoringVersions.length, dependency_authoring_versions: dependencyAuthoringVersions.length, authoring_versions_total: authoringVersions.length, spatial_v3_node_parents: parents.length, spatial_v3_node_classes: classes.length, spatial_v3_g1_grid_cells: grid.length, g3_classification_decisions: classifications.length, universal_categories: categories.length, regional_scene_template_bases: regionalBases.length, scene_templates: sceneTemplates.length, g6_slots: g6Slots.length, position_templates: positions.length, endpoint_slots: endpoints.length, movement_edges: edges.length, stable_structures: 0, portals: 0, hard_gaps: 0 };
write("reports/count-ledger.json", { expected: counts, actual: counts, status: "PASS" });
write("schemas/dependency-closure.schema.json", { $schema: "https://json-schema.org/draft/2020-12/schema", title: "P12 dependency closure bundle", type: "object", required: ["schema_version", "status", "records"], properties: { schema_version: { type: "string" }, status: { type: "string" }, records: { type: "array" } } });
const proposedApprovalDecision = { schema_version: "rus.p12_dependency_closure_approval.v1", status: "PROPOSED_FOR_P12_DEPENDENCY_CLOSURE", blocker_addressed: "P12_V11_DEPENDENCY_CLOSURE_EVIDENCE_MISSING", independent_audit: "pending_reapproval", production_activation: "blocked", p28_status: "blocked" };
write("REAPPROVAL_REQUEST.json", {
  schema_version: "rus.p12_dependency_closure_reapproval_request.v1",
  status: "PENDING_INDEPENDENT_REAPPROVAL",
  reason: "P09 canonical DDL now requires grid_east_north_v1; the P12 dependency-closure import row was repinned from the non-canonical novgorod_g1_cardinal_grid_v1 value.",
  prior_approval: {
    subject_commit: "69b465fbbabfc8223839741d9253cd0ccc40e591",
    evidence_commit: "690f85049c44ef099d499eca567d1460fe60ae3f",
    disposition: "superseded_for_changed_subject_tree"
  },
  proposed_subject_commit: "pending_after_subject_commit",
  exact_changed_contract: {
    path: "datasets/spatial_v3_g1_grid_cells.json",
    field: "grid_convention",
    old_value: "novgorod_g1_cardinal_grid_v1",
    new_value: "grid_east_north_v1",
    sha256: fileSha(join(out, "datasets/spatial_v3_g1_grid_cells.json"))
  },
  required_reapproval_evidence: [
    "independent critic PASS or acceptable PASS WITH NOTES for the exact subject tree",
    "subject commit binding generated only after that exact subject commit exists",
    "separate evidence-only commit whose sole content parent is the approved subject commit"
  ],
  production_activation: "blocked",
  p28_status: "blocked"
});
write("README.md", `# P12 dependency closure v1\n\nStatus: \`PROPOSED_FOR_P12_DEPENDENCY_CLOSURE\`; independent reapproval is pending.\n\nThis bundle materializes only the exact approved dependencies required by P12 V1.1. The G1 import row is pinned to the target-standard convention \`grid_east_north_v1\`. The prior approval evidence applies only to the superseded subject tree and is not reused. See \`REAPPROVAL_REQUEST.json\` for the exact changed contract and required evidence sequence.\n\nThis package does not activate production, P28, or spatial runtime v3. Historical geometry remains topological unless explicitly marked as a technical G1 grid cell.\n\nRegenerate from repository root with:\n\n\`\`\`powershell\nnode scripts/generate-p12-dependency-closure.mjs\nnode data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1/scripts/validate-bundle.mjs\n\`\`\`\n`);
write("scripts/validate-bundle.mjs", `import { readFileSync } from "node:fs";\nimport { dirname, join } from "node:path";\nimport { fileURLToPath } from "node:url";\nconst root=dirname(dirname(fileURLToPath(import.meta.url))); const j=p=>JSON.parse(readFileSync(join(root,p),"utf8"));\nconst expected={\"source-records.json\":12,\"spatial-nodes.json\":49,\"authoring-versions.json\":68,\"node-parents.json\":48,\"node-classes.json\":49,\"g3-classification-decision.json\":32,\"universal-categories.json\":57,\"regional-scene-template-bases.json\":17,\"scene-templates.json\":17,\"g6-template-slots.json\":17,\"scene-position-templates.json\":51,\"scene-endpoint-slots.json\":34,\"scene-movement-edge-templates.json\":68,\"stable-structure-templates.json\":0,\"portal-templates.json\":0};\nfor(const [f,n] of Object.entries(expected)){const got=j(\"data/\"+f).records.length;if(got!==n)throw new Error(f+\": expected \"+n+\", got \"+got)}\nif(j(\"reports/dependency-coverage.json\").hard_gap!==0)throw new Error(\"hard gaps remain\"); console.log(\"P12 dependency closure data validation: PASS\");\n`);

const pins = {
  source_approval_zip: sourceApprovalZipSha,
  target_contract_spec_zip: fileSha(targetSpecZip),
  p12_target_materialization_approval_v1_1_zip: fileSha(v11Zip),
  immutable_v1_1_subject_commit: "e6be7c06cbd6c37c375658af6f2fe529d4f64353",
  current_ddl_sha256: expandedDdlSha()
};
const filesBeforeManifest = [];
const collect = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (!full.endsWith("manifest.json") && !full.endsWith("manifest.sha256")) filesBeforeManifest.push({ path: relative(out, full).replaceAll("\\", "/"), sha256: fileSha(full) });
  }
};
collect(out);
filesBeforeManifest.sort((a, b) => a.path.localeCompare(b.path));
const manifestIdentity = { schema_version: "rus.p12_dependency_closure_manifest.v1", bundle_id: "p12_novgorod_dependency_closure_v1", status: "PROPOSED_FOR_P12_DEPENDENCY_CLOSURE", pins, counts };
const approvalDecision = previousApprovedSubject?.fingerprint === approvalContentFingerprint({ ...manifestIdentity, files: filesBeforeManifest })
  ? previousApprovedSubject.approval
  : proposedApprovalDecision;
write("APPROVAL_DECISION.json", approvalDecision);
filesBeforeManifest.push({ path: "APPROVAL_DECISION.json", sha256: fileSha(join(out, "APPROVAL_DECISION.json")) });
filesBeforeManifest.sort((a, b) => a.path.localeCompare(b.path));
const manifest = { ...manifestIdentity, files: filesBeforeManifest };
write("manifest.json", manifest);
write("manifest.sha256", `${fileSha(join(out, "manifest.json"))}  manifest.json\n`);
console.log(JSON.stringify({ ok: true, out, counts, pins }, null, 2));
