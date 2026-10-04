import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = '/srv/novgorod-work/worktrees/integ-98';
const pinnedHead = 'cc80771c56a2c4a93bccd154360243f96371c990';
const fields = ['property_refs','function_refs','environment_refs','semantic_context_refs','scene_template_ref','position_ref','g6_slot_ref','movement_topology_refs','visibility_topology_refs'];
const reasonCodes = ['missing','ambiguous','version_or_scope_mismatch','unapproved','missing_topology'];
const pinPaths = {
  target:'data/world-catalogs/novgorod/live-world-runtime-v17/target-runtime-profiles-approved.json',
  targetStart:'data/world-catalogs/novgorod/live-world-runtime-v17/target-start-candidate.json',
  targetManifest:'data/world-catalogs/novgorod/live-world-runtime-v17/target-runtime-profiles-manifest.json',
  spatialManifest:'data/world-catalogs/novgorod/spatial-v3/manifest.json',
  sceneTemplates:'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_scene_templates.json',
  g6:'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_g6_template_slots.json',
  positions:'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_scene_position_templates.json',
  movement:'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_scene_movement_edge_templates.json',
  selection:'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_scene_selection_rules.json',
  sceneProfiles:'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_scene_materialization_profiles.json',
  applicability:'data/world-catalogs/novgorod/spatial-v3/datasets/spatial_v3_scene_applicability_rules.json',
  generationV2:'data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_g5_generation_templates.json',
  smpV2:'data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_scene_materialization_profiles.json',
  sceneCandidatesV2:'data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_scene_materialization_candidates.json',
  g6V2:'data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_g6_template_slots.json',
  positionV2:'data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_scene_position_templates.json',
  movementV2:'data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-import/spatial_v3_scene_movement_edge_templates.json',
  openCapCandidate:'data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-candidate.json',
  openCapApproval:'data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-data-approval.json',
  spatialApprovalIndex:'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/index.json',
  sceneClosure:'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1/data/scene-templates.json',
  naturalCandidate:'data/world-catalogs/novgorod/m2c-natural/candidate.json',
  naturalPresentation:'data/world-catalogs/novgorod/m2c-natural-presentation/nature-successor-candidate-v2.json',
  expansionApproval:'data/world-catalogs/novgorod/m2c-expansion-repin-data-approval.json',
  expansionManifest:'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json',
  expansionG4Profiles:'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_g4_expansion_profiles.json',
  expansionTemplateLimits:'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_expansion_profile_template_limits.json',
  expansionGenerationV1:'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_g5_generation_templates.json',
  expansionSceneProfilesV1:'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_scene_materialization_profiles.json',
  expansionSceneCandidatesV1:'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_scene_materialization_candidates.json',
  expansionApplicabilityV1:'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_scene_applicability_rules.json',
  expansionSceneTemplatesV1:'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_scene_templates.json',
  expansionG6V1:'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_g6_template_slots.json',
  expansionPositionsV1:'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_scene_position_templates.json',
  expansionEndpointsV1:'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_scene_endpoint_slots.json',
  expansionMovementV1:'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_scene_movement_edge_templates.json'
};
const fileByKey = Object.fromEntries(Object.entries(pinPaths).map(([k,v]) => [k, path.join(repo,v)]));
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, stable(value[k])]));
  return value;
};
const same = (a,b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
class ValidationError extends Error { constructor(code, message) { super(message); this.code = code; } }
const reject = (code, message) => { throw new ValidationError(code,message); };
function exactKeys(value, keys, code, context) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !same(Object.keys(value).sort(), [...keys].sort())) reject(code, `${context} has missing or unknown keys`);
}
function decodeToken(token) {
  if (/~(?![01])/.test(token)) reject('SOURCE_POINTER_INVALID', 'RFC6901 token has malformed escape');
  return token.replace(/~1/g,'/').replace(/~0/g,'~');
}
export function resolvePointer(document, pointer) {
  if (pointer === '') return document;
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) reject('SOURCE_POINTER_INVALID', `invalid RFC6901 pointer ${String(pointer)}`);
  let value = document;
  for (const raw of pointer.slice(1).split('/')) {
    const token = decodeToken(raw);
    if (Array.isArray(value)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token)) reject('SOURCE_POINTER_INVALID', `invalid array index ${token}`);
      const index = Number(token);
      if (!Number.isSafeInteger(index) || index >= value.length) reject('SOURCE_POINTER_UNRESOLVED', `array index out of range ${token}`);
      value = value[index];
    } else if (value && typeof value === 'object' && Object.hasOwn(value,token)) value = value[token];
    else reject('SOURCE_POINTER_UNRESOLVED', `missing pointer token ${token}`);
  }
  return value;
}
function countExactValues(document, wanted) {
  let count=0;
  const visit=(value)=>{ if (same(value,wanted)) count += 1; if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value==='object') Object.values(value).forEach(visit); };
  visit(document); return count;
}
export function resolveUniqueRecord(document, wanted, label='source record') {
  const count=countExactValues(document,wanted);
  if (count===0) reject('SOURCE_RECORD_MISSING', `${label} has no exact source match`);
  if (count!==1) reject('SOURCE_RECORD_AMBIGUOUS', `${label} has ${count} exact source matches`);
  return true;
}
function locator(documentSet, pins, wrapper, label) {
  if (!wrapper || typeof wrapper!=='object') reject('SOURCE_LOCATOR_INVALID', `${label} is not an object`);
  const pin=pins[wrapper.source_key];
  if (!pin || wrapper.source_path!==pin.path || !fileByKey[wrapper.source_key]) reject('SOURCE_PATH_MISMATCH', `${label} source key/path does not match required pin`);
  const resolved=resolvePointer(documentSet[wrapper.source_key],wrapper.source_json_pointer);
  if (!same(resolved,wrapper.record)) reject('SOURCE_RECORD_MISMATCH', `${label} pointer value differs from copied record`);
  resolveUniqueRecord(documentSet[wrapper.source_key],wrapper.record,label);
  return resolved;
}
function eachLocator(value, documentSet, pins, pointer='') {
  if (Array.isArray(value)) { value.forEach((v,i)=>eachLocator(v,documentSet,pins,`${pointer}/${i}`)); return; }
  if (!value || typeof value!=='object') return;
  if (Object.hasOwn(value,'source_key') && Object.hasOwn(value,'source_json_pointer') && Object.hasOwn(value,'record')) locator(documentSet,pins,value,`locator ${pointer}`);
  for (const [key,child] of Object.entries(value)) eachLocator(child,documentSet,pins,`${pointer}/${key}`);
}
function projectedSelector(row,index) {
  return {row_index:index,selector_kind:row.canonical_g5_ref?'canonical_g5':'generated_template',g4_ref:row.g4_ref,...(row.generation_template_ref?{generation_template_ref:row.generation_template_ref}:{}),...(row.canonical_g5_ref?{canonical_g5_ref:row.canonical_g5_ref,scene_template_ref:row.scene_template_ref}:{}),classification:row.classification,natural_profile_ref:row.natural_profile_ref??null};
}
function validate(inputDir) {
  const candidate=readJson(path.join(inputDir,'s1-v17-candidate.json'));
  const sourceMap=readJson(path.join(inputDir,'s1-source-map.json'));
  const gapDoc=readJson(path.join(inputDir,'s1-typed-gaps.json'));
  exactKeys(candidate,['schema','task_id','issue','status','approved','import_authorized','activation_authorized','world_revision_id','profile','applicability_selector_count','selector_summary','exact_existing_refs','limits'],'CANDIDATE_UNKNOWN_KEY','candidate');
  exactKeys(sourceMap,['schema','task_id','issue','source_checkout','source_pins','scope','selectors','canonical_scene_evidence','generated_selector_scene_topology_audit','approved_expansion_v1_chain','status_limits'],'SOURCE_MAP_UNKNOWN_KEY','source map');
  exactKeys(gapDoc,['schema','task_id','issue','profile','gap_count','field_gap_categories','target_selector_count','gaps','scope_assessment'],'GAP_DOCUMENT_UNKNOWN_KEY','gap document');
  exactKeys(candidate.exact_existing_refs,['canonical_selector','canonical_start_position'],'CANDIDATE_UNKNOWN_KEY','candidate exact refs');
  exactKeys(candidate.exact_existing_refs.canonical_selector,['g4_ref','canonical_g5_ref','scene_template_ref','scene_template_dataset_record'],'CANDIDATE_UNKNOWN_KEY','candidate canonical selector');
  exactKeys(candidate.exact_existing_refs.canonical_start_position,['source_path','source_status','start_candidate_status','approved','import_authorized','activation_authorized','placement','authored_template_positions','authored_g6_slots','authored_movement_templates','visibility_templates'],'CANDIDATE_UNKNOWN_KEY','candidate start position');
  if(candidate.schema!=='fleet.b4_s1_data.candidate.v1'||candidate.task_id!=='b4-s1-data'||candidate.issue!==163||candidate.status!=='candidate_only_gap'||candidate.approved!==false||candidate.import_authorized!==false||candidate.activation_authorized!==false||candidate.profile!==null) reject('CANDIDATE_STATUS_INVALID','candidate approval/profile boundary changed');
  if(sourceMap.schema!=='fleet.b4_s1_data.source_applicability_map.v1'||sourceMap.task_id!=='b4-s1-data'||sourceMap.issue!==163) reject('SOURCE_MAP_SHAPE_INVALID','source map identity mismatch');
  if(sourceMap.source_checkout.path!==repo||sourceMap.source_checkout.head!==pinnedHead||sourceMap.source_checkout.task_expected_head!=='7a33888c3208e049100436e2c4652556f92439bd') reject('SOURCE_COMMIT_MISMATCH','pinned source checkout metadata changed');
  const expectedPinKeys=Object.keys(pinPaths).sort();
  if(!same(Object.keys(sourceMap.source_pins).sort(),expectedPinKeys)) reject('SOURCE_PIN_SET_MISMATCH','source pin key set differs from the required pinned source set');
  for(const [key,relative] of Object.entries(pinPaths)){
    const pin=sourceMap.source_pins[key];
    if(pin.path!==relative||pin.checkout_head!==pinnedHead||sha256(fileByKey[key])!==pin.sha256) reject('SOURCE_PIN_MISMATCH',`pin bytes/path/head mismatch for ${key}`);
  }
  const docs=Object.fromEntries(Object.entries(fileByKey).map(([k,f])=>[k,readJson(f)]));
  const target=docs.target;
  if(target.target.world_revision_id!==candidate.world_revision_id||target.target.world_revision_id!==sourceMap.scope.world_revision_id||target.applicability.length!==33||sourceMap.selectors.length!==33) reject('TARGET_SCOPE_MISMATCH','target revision/selector count mismatch');
  if(!same(sourceMap.scope,{world_revision_id:target.target.world_revision_id,selector_count:33,generated_selectors:32,canonical_g5_selectors:1,unique_generated_template_refs:25,canonical_policy_scope:'south_approach only'})) reject('TARGET_SCOPE_MISMATCH','selector family scope changed');
  const expectedSelectors=target.applicability.map(projectedSelector);
  if(sourceMap.selectors.length!==expectedSelectors.length) reject('TARGET_SELECTOR_MISMATCH','selector count mismatch');
  exactKeys(sourceMap.source_checkout,['path','head','task_expected_head','working_tree_status'],'SOURCE_COMMIT_MISMATCH','source checkout');
  for(let i=0;i<expectedSelectors.length;i++){
    const row=sourceMap.selectors[i];
    exactKeys(row,['row_index','selector_kind','g4_ref','classification','natural_profile_ref','applicability_evidence',...(expectedSelectors[i].generation_template_ref?['generation_template_ref']:[]),...(expectedSelectors[i].canonical_g5_ref?['canonical_g5_ref','scene_template_ref']:[])],'TARGET_SELECTOR_MISMATCH',`selector ${i}`);
    if(!same({row_index:row.row_index,selector_kind:row.selector_kind,g4_ref:row.g4_ref,...(row.generation_template_ref?{generation_template_ref:row.generation_template_ref}:{}),...(row.canonical_g5_ref?{canonical_g5_ref:row.canonical_g5_ref,scene_template_ref:row.scene_template_ref}:{}),classification:row.classification,natural_profile_ref:row.natural_profile_ref},expectedSelectors[i])) reject('TARGET_SELECTOR_MISMATCH',`selector ${i} differs from pinned applicability row`);
    const ev=row.applicability_evidence;exactKeys(ev,['status','source'],'TARGET_SELECTOR_MISMATCH',`selector ${i} applicability evidence`);exactKeys(ev.source,['key','json_pointer'],'TARGET_SELECTOR_MISMATCH',`selector ${i} applicability pointer`);
    if(ev.source.key!=='target'||ev.source.json_pointer!==`/applicability/${i}`||!same(resolvePointer(docs.target,ev.source.json_pointer),target.applicability[i])) reject('TARGET_SELECTOR_MISMATCH',`selector ${i} source pointer does not resolve to exact target row`);
  }
  eachLocator(sourceMap,docs,sourceMap.source_pins);
  eachLocator(gapDoc,docs,sourceMap.source_pins);
  exactKeys(sourceMap.status_limits,['target_profile_approved','import_authorized','activation_authorized','target_start_approved','target_spatial_package_materialization_authorized','production_readback','database_party_instances','foreign_scope_promoted','free_prose_topology','target_spatial_package_intake_status','target_spatial_package_approval_status','natural_candidate_approved','natural_presentation_candidate_approved'],'SOURCE_MAP_UNKNOWN_KEY','status limits');
  const expectedLimits={target_profile_approved:true,import_authorized:false,activation_authorized:false,target_start_approved:false,target_spatial_package_materialization_authorized:false,production_readback:'not checked',database_party_instances:'not checked',foreign_scope_promoted:false,free_prose_topology:false,target_spatial_package_intake_status:docs.spatialApprovalIndex.intake_status,target_spatial_package_approval_status:docs.spatialApprovalIndex.approval_status,natural_candidate_approved:docs.naturalCandidate.approved,natural_presentation_candidate_approved:docs.naturalPresentation.approved};
  if(!same(sourceMap.status_limits,expectedLimits))reject('SOURCE_STATUS_MISMATCH','source-map status limits differ from pinned sources');
  const canon=sourceMap.canonical_scene_evidence;exactKeys(canon,['status','scene_template','g6_slots','positions','movement_templates','visibility_links','target_start','approved_closure_template'],'CANONICAL_EVIDENCE_SHAPE_INVALID','canonical evidence');
  const targetCanonical=target.applicability.find(x=>x.canonical_g5_ref);if(!targetCanonical)reject('CANONICAL_SCENE_REF_MISMATCH','target canonical selector missing');
  const sceneRef=targetCanonical.scene_template_ref;
  const sceneRows=docs.sceneTemplates.filter(x=>x.id===sceneRef.id&&x.version===sceneRef.version);
  if(sceneRows.length!==1)reject('CANONICAL_SCENE_REF_MISMATCH','target scene ref is missing or ambiguous in pinned scene templates');
  const scene=sceneRows[0];
  const sceneEvidence=canon.scene_template;exactKeys(sceneEvidence,['source_key','json_pointer','ref','record_status','world_revision_id','source_path','source_json_pointer','record'],'CANONICAL_SCENE_REF_MISMATCH','canonical scene evidence');
  if(!same(sceneEvidence.ref,sceneRef))reject('CANONICAL_SCENE_REF_MISMATCH','canonical scene ref differs from target selector');
  if(sceneEvidence.record?.version!==scene.version)reject('CANONICAL_SCENE_VERSION_MISMATCH','canonical scene source version differs');
  if(sceneEvidence.record_status!==scene.status||scene.status!=='approved'||sceneEvidence.world_revision_id!==scene.world_revision_id||scene.world_revision_id!==target.target.world_revision_id)reject('CANONICAL_SCENE_REF_MISMATCH','canonical scene source status/revision mismatch');
  if(sceneEvidence.source_key!=='sceneTemplates'||sceneEvidence.source_path!==pinPaths.sceneTemplates||sceneEvidence.source_json_pointer!==sceneEvidence.json_pointer||!same(resolvePointer(docs.sceneTemplates,sceneEvidence.source_json_pointer),scene))reject('CANONICAL_SCENE_REF_MISMATCH','canonical scene pointer does not resolve to pinned record');
  resolveUniqueRecord(docs.sceneTemplates,scene,'canonical scene template');
  const closure=canon.approved_closure_template;locator(docs,sourceMap.source_pins,closure,'approved closure scene template');
  if(closure.source_key!=='sceneClosure'||closure.record.id!==scene.id||closure.record.version!==scene.version||closure.record.status!=='approved'||closure.record.geometry_claim!=='topological_only')reject('CANONICAL_SCENE_REF_MISMATCH','approved closure scene record does not match exact target scene');
  const g6Rows=docs.g6.filter(x=>x.scene_template_id===scene.id&&x.scene_template_version===scene.version);
  const positionRows=docs.positions.filter(x=>x.scene_template_id===scene.id&&x.scene_template_version===scene.version);
  const movementRows=docs.movement.filter(x=>x.scene_template_id===scene.id&&x.scene_template_version===scene.version);
  const validateWrapperArray=(actual,expected,code,label)=>{
    if(!Array.isArray(actual)||actual.length!==expected.length)reject(code,`${label} count differs from pinned source`);
    for(let i=0;i<expected.length;i++){
      const w=actual[i];locator(docs,sourceMap.source_pins,w,`${label}[${i}]`);
      if(!same(w.record,expected[i]))reject(code,`${label}[${i}] differs from pinned source record`);
    }
  };
  validateWrapperArray(canon.g6_slots,g6Rows,'CANONICAL_G6_RECORD_MISMATCH','canonical G6');
  validateWrapperArray(canon.positions,positionRows,'CANONICAL_POSITION_RECORD_MISMATCH','canonical position');
  validateWrapperArray(canon.movement_templates,movementRows,'CANONICAL_MOVEMENT_RECORD_MISMATCH','canonical movement');
  exactKeys(canon.visibility_links,['source_key','manifest_entry','rows','finding'],'CANONICAL_VISIBILITY_NOT_AUTHORED','visibility evidence');
  if(canon.visibility_links.source_key!=='spatialManifest'||canon.visibility_links.manifest_entry!==null||!Array.isArray(canon.visibility_links.rows)||canon.visibility_links.rows.length!==0)reject('CANONICAL_VISIBILITY_NOT_AUTHORED','visibility evidence must stay empty absent pinned authored rows');
  exactKeys(canon.target_start,['source_key','source_path','json_pointer','source_json_pointer','record','status','approved','import_authorized','activation_authorized','placement'],'CANONICAL_START_POINTER_INVALID','canonical start evidence');
  if(canon.target_start.source_key!=='targetStart'||canon.target_start.source_path!==pinPaths.targetStart||canon.target_start.json_pointer!=='/initial_placement'||canon.target_start.source_json_pointer!=='/initial_placement')reject('CANONICAL_START_POINTER_INVALID','canonical start pointer must be /initial_placement');
  const placement=resolvePointer(docs.targetStart,canon.target_start.source_json_pointer);
  if(!same(placement,canon.target_start.record)||!same(placement,canon.target_start.placement)||!same(placement,docs.targetStart.initial_placement))reject('CANONICAL_START_RECORD_MISMATCH','start placement pointer/copy mismatch');
  if(canon.target_start.status!==docs.targetStart.status||canon.target_start.approved!==docs.targetStart.approved||canon.target_start.import_authorized!==docs.targetStart.import_authorized||canon.target_start.activation_authorized!==docs.targetStart.activation_authorized)reject('CANONICAL_START_STATUS_MISMATCH','start approval status mismatch');
  const candidateRef=candidate.exact_existing_refs?.canonical_selector;
  if(!candidateRef||!same(candidateRef.g4_ref,targetCanonical.g4_ref)||!same(candidateRef.canonical_g5_ref,targetCanonical.canonical_g5_ref)||!same(candidateRef.scene_template_ref,sceneRef))reject('CANONICAL_SCENE_REF_MISMATCH','candidate canonical selector refs do not equal approved target row');
  const candidateScene=candidateRef.scene_template_dataset_record;
  exactKeys(candidateScene,['id','version','status','world_revision_id'],'CANONICAL_SCENE_VERSION_MISMATCH','candidate scene record projection');
  if(!candidateScene||candidateScene.id!==scene.id||candidateScene.version!==scene.version||candidateScene.status!==scene.status||candidateScene.world_revision_id!==scene.world_revision_id)reject('CANONICAL_SCENE_VERSION_MISMATCH','candidate canonical scene record projection differs from source');
  const startCandidate=candidate.exact_existing_refs.canonical_start_position;
  if(startCandidate.source_path!==pinPaths.targetStart)reject('CANONICAL_START_SOURCE_PATH_MISMATCH','candidate start source path differs from required target-start pin');
  if(startCandidate.source_status!==docs.targetStart.status||startCandidate.start_candidate_status!==docs.targetStart.status)reject('CANONICAL_START_STATUS_MISMATCH','candidate start status metadata differs from pinned target-start status');
  if(!startCandidate||startCandidate.approved!==false||!same(startCandidate.placement,placement))reject('CANONICAL_START_RECORD_MISMATCH','candidate placement differs from pinned initial placement');
  if(!same(startCandidate.authored_template_positions,positionRows))reject('CANONICAL_POSITION_RECORD_MISMATCH','candidate position records differ from pinned source');
  if(!same(startCandidate.authored_g6_slots,g6Rows))reject('CANONICAL_G6_RECORD_MISMATCH','candidate G6 records differ from pinned source');
  if(!same(startCandidate.authored_movement_templates,movementRows))reject('CANONICAL_MOVEMENT_RECORD_MISMATCH','candidate movement records differ from pinned source');
  if(!Array.isArray(startCandidate.visibility_templates)||startCandidate.visibility_templates.length!==0)reject('CANONICAL_VISIBILITY_NOT_AUTHORED','candidate contains visibility rows without pinned source');
  const requiredCandidateKeys=['schema','task_id','issue','status','approved','import_authorized','activation_authorized','world_revision_id','profile','applicability_selector_count','selector_summary','exact_existing_refs','limits'];
  if(candidate.applicability_selector_count!==33||candidate.selector_summary?.generated!==32||candidate.selector_summary?.canonical_g5!==1||candidate.selector_summary?.unique_generated_templates!==25)reject('CANDIDATE_SCOPE_MISMATCH','candidate selector summary differs from exact source family');
  if(candidate.exact_existing_refs?.canonical_start_position?.import_authorized!==false||candidate.exact_existing_refs?.canonical_start_position?.activation_authorized!==false)reject('CANDIDATE_STATUS_INVALID','start placement cannot become approved/imported/active');
  const exactLimits=['Canonical start position/template refs are evidence of authored initial placement only, not an S1 interior or shelter envelope.','Generated selectors have no exact scene_template_ref or position_ref in this target profile.','No authored target visibility-link dataset/ref was found in the pinned spatial-v3 manifest datasets.','No approved target S1 property, function, environment, or semantic-context refs are admitted.','Authored templates are not persisted party instances; DB/runtime readback was not performed.'];
  if(!same(candidate.limits,exactLimits))reject('CANDIDATE_PAYLOAD_MISMATCH','candidate limitations differ from the declared five');
  const audit=sourceMap.generated_selector_scene_topology_audit;exactKeys(audit,['data_approval','candidate_status','target_materialization_package_status','rows'],'GENERATED_AUDIT_SHAPE_INVALID','generated audit');
  if(!same(audit.data_approval,docs.openCapApproval))reject('GENERATED_APPROVAL_MISMATCH','open-capacity approval copy differs from pinned bytes');
  const openCandidate=docs.openCapCandidate;
  if(!same(audit.candidate_status,{status:openCandidate.status,approved:openCandidate.approved,import_authorized:openCandidate.import_authorized,activation_authorized:openCandidate.activation_authorized}))reject('GENERATED_APPROVAL_MISMATCH','open-capacity status copy differs from pinned bytes');
  if(!same(audit.target_materialization_package_status,docs.spatialApprovalIndex)||docs.spatialApprovalIndex.materialization_authorized!==false||docs.spatialApprovalIndex.intake_status!=='blocked_fail_closed')reject('GENERATED_APPROVAL_MISMATCH','target materialization status differs from pinned source');
  const generated=expectedSelectors.filter(x=>x.selector_kind==='generated_template');
  if(audit.rows.length!==generated.length)reject('GENERATED_TOPOLOGY_MISMATCH','generated diagnostic row count mismatch');
  for(let i=0;i<generated.length;i++){
    const t=generated[i],r=audit.rows[i];exactKeys(r,['row_index','g4_ref','generation_template_ref','observed_source_ref','version_match','source_path','source_json_pointer','scene_materialization_profile_ref','observed_scene_template_ref','scene_applicability_rule_ref','scene_ref_status','topology_v2','natural_evidence','generation_template_source','scene_materialization_profile_source','scene_materialization_candidate_source'],'GENERATED_TOPOLOGY_MISMATCH',`generated row ${i}`);
    if(r.row_index!==t.row_index||!same(r.g4_ref,t.g4_ref)||!same(r.generation_template_ref,t.generation_template_ref))reject('GENERATED_TOPOLOGY_MISMATCH',`generated row ${i} selector mismatch`);
    const genMatches=docs.generationV2.filter(x=>x.id===t.generation_template_ref.id);if(genMatches.length!==1)reject(genMatches.length?'SOURCE_RECORD_AMBIGUOUS':'SOURCE_RECORD_MISSING',`generated source id ${t.generation_template_ref.id} not unique`);
    const gen=genMatches[0];if(gen.version!==2||t.generation_template_ref.version===gen.version||r.version_match!==false)reject('GENERATED_VERSION_MISMATCH',`generated diagnostic version status wrong at row ${i}`);
    locator(docs,sourceMap.source_pins,r.generation_template_source,`generation ${i}`);
    if(!same(r.generation_template_source.record,gen)||!same(r.observed_source_ref,{id:gen.id,version:gen.version})||r.source_path!==pinPaths.generationV2||r.source_json_pointer!==r.generation_template_source.source_json_pointer)reject('GENERATED_TOPOLOGY_MISMATCH',`generation source copy mismatch at row ${i}`);
    const smpMatches=docs.smpV2.filter(x=>x.id===gen.scene_materialization_profile_id&&x.version===gen.scene_materialization_profile_version);if(smpMatches.length!==1)reject(smpMatches.length?'SOURCE_RECORD_AMBIGUOUS':'SOURCE_RECORD_MISSING',`scene profile source at row ${i} missing/ambiguous`);
    const smp=smpMatches[0];locator(docs,sourceMap.source_pins,r.scene_materialization_profile_source,`scene profile ${i}`);
    if(!same(r.scene_materialization_profile_source.record,smp)||!same(r.scene_materialization_profile_ref,{id:smp.id,version:smp.version}))reject('GENERATED_TOPOLOGY_MISMATCH',`scene profile copy mismatch at row ${i}`);
    const candidateRows=docs.sceneCandidatesV2.filter(x=>x.profile_id===smp.id&&x.profile_version===smp.version);if(candidateRows.length!==1)reject(candidateRows.length?'SOURCE_RECORD_AMBIGUOUS':'SOURCE_RECORD_MISSING',`scene candidate at row ${i} missing/ambiguous`);
    const candidateRow=candidateRows[0];locator(docs,sourceMap.source_pins,r.scene_materialization_candidate_source,`scene candidate ${i}`);
    if(!same(r.scene_materialization_candidate_source.record,candidateRow)||!same(r.observed_scene_template_ref,{id:candidateRow.scene_template_id,version:candidateRow.scene_template_version})||!same(r.scene_applicability_rule_ref,{id:candidateRow.applicability_rule_id,version:candidateRow.applicability_rule_version})||r.scene_ref_status!=='diagnostic_only_version_mismatch_or_unapproved')reject('GENERATED_TOPOLOGY_MISMATCH',`scene candidate ref mismatch at row ${i}`);
    const expectedNaturalEvidence={target_natural_profile_ref:t.natural_profile_ref,natural_artifact_status:docs.naturalCandidate.status,natural_approved:docs.naturalCandidate.approved===true,natural_presentation_status:docs.naturalPresentation.status,natural_presentation_approved:docs.naturalPresentation.approved===true};
    if(!same(r.natural_evidence,expectedNaturalEvidence))reject('GENERATED_TOPOLOGY_MISMATCH',`natural diagnostic evidence mismatch at row ${i}`);
    const sid=candidateRow.scene_template_id,sv=candidateRow.scene_template_version;
    exactKeys(r.topology_v2,['g6_slots','positions','movement','visibility'],'GENERATED_TOPOLOGY_MISMATCH',`topology ${i}`);
    for(const [key,sourceKey] of [['g6_slots','g6V2'],['positions','positionV2'],['movement','movementV2']]){
      const expected=docs[sourceKey].filter(x=>x.scene_template_id===sid&&x.scene_template_version===sv);const wrappers=r.topology_v2[key];if(!Array.isArray(wrappers)||wrappers.length!==expected.length)reject('GENERATED_TOPOLOGY_MISMATCH',`${key} count mismatch at row ${i}`);
      wrappers.forEach((w,j)=>{locator(docs,sourceMap.source_pins,w,`${key} ${i}/${j}`);if(w.source_key!==sourceKey||!same(w.record,expected[j]))reject('GENERATED_TOPOLOGY_MISMATCH',`${key} record mismatch at row ${i}/${j}`);});
    }
    if(!same(r.topology_v2.visibility,[]))reject('GENERATED_VISIBILITY_NOT_AUTHORED',`visibility rows are not pinned for generated row ${i}`);
  }
  const chain=sourceMap.approved_expansion_v1_chain;
  exactKeys(chain,['approval','manifest','bundle_id','world_revision_id','status','selector_count','unique_generation_template_count','unique_scene_template_count','rows'],'EXPANSION_V1_CHAIN_SHAPE_INVALID','approved expansion-v1 chain');
  locator(docs,sourceMap.source_pins,chain.approval,'approved expansion data approval');
  locator(docs,sourceMap.source_pins,chain.manifest,'approved expansion manifest');
  const approval=docs.expansionApproval,manifest=docs.expansionManifest;
  if(chain.approval.source_key!=='expansionApproval'||chain.manifest.source_key!=='expansionManifest'||approval.decision!=='APPROVE_DATA_ONLY'||manifest.status!=='approved'||chain.status!=='approved_authoring_chain_not_s1_admission'||chain.bundle_id!==manifest.bundle_id||chain.world_revision_id!==manifest.world_revision_id||chain.world_revision_id!==target.target.world_revision_id||approval.expansion_manifest_sha256!==sha256(fileByKey.expansionManifest))reject('EXPANSION_V1_APPROVAL_MISMATCH','approved expansion bundle/approval does not match pinned target revision or bytes');
  const manifestDatasets=new Map(manifest.datasets.map(x=>[x.file,x]));
  for(const key of Object.keys(pinPaths).filter(k=>k.startsWith('expansion')&&!['expansionApproval','expansionManifest'].includes(k))){
    const rel=pinPaths[key].slice(pinPaths.expansionManifest.length - 'import-manifest.json'.length).replace(/^.*?datasets\//,'datasets/');
    const entry=manifestDatasets.get(rel);
    if(!entry||entry.status!=='approved'||entry.sha256!==sha256(fileByKey[key]))reject('EXPANSION_V1_MANIFEST_MISMATCH',`approved manifest does not pin ${key}`);
  }
  if(!Array.isArray(chain.rows)||chain.rows.length!==32||chain.selector_count!==32||chain.unique_generation_template_count!==25||chain.unique_scene_template_count!==9)reject('EXPANSION_V1_CHAIN_SHAPE_INVALID','approved expansion-v1 chain summary/counts changed');
  const fieldEvidenceKey={property_refs:'generation_template',function_refs:'generation_template',environment_refs:'generation_template',semantic_context_refs:'generation_template',scene_template_ref:'scene_template',position_ref:'positions',g6_slot_ref:'g6_slots',movement_topology_refs:'movement_edges',visibility_topology_refs:'visibility_finding'};
  const fieldReason={property_refs:'unapproved',function_refs:'unapproved',environment_refs:'unapproved',semantic_context_refs:'unapproved',scene_template_ref:'unapproved',position_ref:'ambiguous',g6_slot_ref:'missing_topology',movement_topology_refs:'unapproved',visibility_topology_refs:'missing_topology'};
  const fieldScope={
    property_refs:['G4 profile and generation family are exact; no approved S1 property payload is selected or bound.','exact_g4_generation_chain_no_s1_property_payload','Approved target S1 property ref with exact id/version and selector binding.'],
    function_refs:['G4 profile and generation family are exact; no approved S1 function payload is selected or bound.','exact_g4_generation_chain_no_s1_function_payload','Approved target S1 function ref with exact id/version and selector binding.'],
    environment_refs:['G4 profile and generation family are exact; no approved S1 environment payload is selected or bound.','exact_g4_generation_chain_no_s1_environment_payload','Approved target S1 environment ref with exact id/version and selector binding.'],
    semantic_context_refs:['G4 profile and generation family are exact; no approved S1 semantic-context payload is selected or bound.','exact_g4_generation_chain_no_s1_semantic_payload','Approved target S1 semantic-context ref with exact id/version and selector binding.'],
    scene_template_ref:['Exact approved @1 scene template exists through the G4/G5/profile/candidate/applicability chain; no target S1 binding admits it.','approved_scene_exact_no_s1_binding','Approved S1 binding from this target selector to the exact scene template.'],
    position_ref:['Exact authored @1 positions exist, but this selector has multiple position choices and no S1 binding to a single slot/ordinal.','multiple_authored_positions_no_selector_binding','Approved exact S1 position slot and ordinal binding for this selector.'],
    g6_slot_ref:['Exact authored @1 G6 is open or water with no enclosing structure; no structural slot or complete physical payload supports S1.','non_enclosing_g6_no_structural_slot_or_physical_closure','Approved structural G6 slot and complete physical payload bound to S1.'],
    movement_topology_refs:['Exact authored @1 movement edges include reciprocal pairs, but no S1 binding or complete structural closure admits them.','reciprocal_authored_movement_no_s1_binding_or_closure','Approved S1 movement binding with complete structural closure and runtime readback.'],
    visibility_topology_refs:['The approved expansion manifest contains no visibility-link dataset; reciprocal visibility topology is absent.','visibility_dataset_absent_from_approved_bundle','Approved reciprocal visibility-link records bound to the exact scene/positions.']
  };
  const wrapperRecords=(actual,expected,key,code,label)=>{
    if(!Array.isArray(actual)||actual.length!==expected.length)reject(code,`${label} count differs from exact @1 source`);
    for(let j=0;j<expected.length;j++){locator(docs,sourceMap.source_pins,actual[j],`${label}[${j}]`);if(actual[j].source_key!==key||!same(actual[j].record,expected[j]))reject(code,`${label}[${j}] differs from exact @1 source`);}
  };
  const generatedExpected=expectedSelectors.filter(x=>x.selector_kind==='generated_template');
  for(let i=0;i<generatedExpected.length;i++){
    const selector=generatedExpected[i],r=chain.rows[i];
    exactKeys(r,['row_index','target_selector','chain_status','g4_profile','profile_template_limit','generation_template','scene_materialization_profile','scene_candidate','applicability_rule','scene_template','g6_slots','positions','endpoint_slots','movement_edges','visibility_finding'],'EXPANSION_V1_CHAIN_SHAPE_INVALID',`expansion-v1 row ${i}`);
    if(r.row_index!==selector.row_index||r.chain_status!=='approved_authoring_chain_exact_refs_only'||!same(r.target_selector,{row_index:selector.row_index,g4_ref:selector.g4_ref,generation_template_ref:selector.generation_template_ref}))reject('EXPANSION_V1_SELECTOR_MISMATCH',`expansion-v1 row ${i} selector does not match target`);
    const get=(key,w,label)=>{locator(docs,sourceMap.source_pins,w,label);return w.record;};
    const g4Profiles=docs.expansionG4Profiles.filter(x=>x.g4_id===selector.g4_ref.id&&x.g4_version===selector.g4_ref.version);
    if(g4Profiles.length!==1)reject('EXPANSION_V1_CHAIN_MISMATCH',`G4 profile missing/ambiguous at row ${i}`);
    const profile=get('expansionG4Profiles',r.g4_profile,`G4 profile ${i}`);
    if(!same(profile,g4Profiles[0]))reject('EXPANSION_V1_CHAIN_MISMATCH',`G4 profile mismatch at row ${i}`);
    const limits=docs.expansionTemplateLimits.filter(x=>x.profile_id===profile.id&&x.profile_version===profile.version&&x.template_id===selector.generation_template_ref.id&&x.template_version===selector.generation_template_ref.version);
    if(limits.length!==1||!same(get('expansionTemplateLimits',r.profile_template_limit,`profile template limit ${i}`),limits[0]))reject('EXPANSION_V1_CHAIN_MISMATCH',`G4 template applicability mismatch at row ${i}`);
    const generations=docs.expansionGenerationV1.filter(x=>x.id===selector.generation_template_ref.id&&x.version===selector.generation_template_ref.version);
    if(generations.length!==1||!same(get('expansionGenerationV1',r.generation_template,`generation template ${i}`),generations[0]))reject('EXPANSION_V1_CHAIN_MISMATCH',`exact generation template mismatch at row ${i}`);
    const generation=generations[0];
    const profiles=docs.expansionSceneProfilesV1.filter(x=>x.id===generation.scene_materialization_profile_id&&x.version===generation.scene_materialization_profile_version&&x.source_kind==='g5_generation_template'&&x.source_entity_id===generation.id&&x.source_entity_version===generation.version);
    if(profiles.length!==1||!same(get('expansionSceneProfilesV1',r.scene_materialization_profile,`scene materialization profile ${i}`),profiles[0]))reject('EXPANSION_V1_CHAIN_MISMATCH',`exact scene profile mismatch at row ${i}`);
    const smp=profiles[0];const candidates=docs.expansionSceneCandidatesV1.filter(x=>x.profile_id===smp.id&&x.profile_version===smp.version);
    if(candidates.length!==1||!same(get('expansionSceneCandidatesV1',r.scene_candidate,`scene candidate ${i}`),candidates[0]))reject('EXPANSION_V1_CHAIN_MISMATCH',`exact scene candidate mismatch at row ${i}`);
    const candidateRow=candidates[0];const rules=docs.expansionApplicabilityV1.filter(x=>x.id===candidateRow.applicability_rule_id&&x.version===candidateRow.applicability_rule_version&&x.rule_kind==='exact_source_ref'&&x.status==='approved');
    if(rules.length!==1||!same(get('expansionApplicabilityV1',r.applicability_rule,`applicability rule ${i}`),rules[0]))reject('EXPANSION_V1_CHAIN_MISMATCH',`exact-source applicability mismatch at row ${i}`);
    const scenes=docs.expansionSceneTemplatesV1.filter(x=>x.id===candidateRow.scene_template_id&&x.version===candidateRow.scene_template_version&&x.status==='approved');
    if(scenes.length!==1||!same(get('expansionSceneTemplatesV1',r.scene_template,`scene template ${i}`),scenes[0]))reject('EXPANSION_V1_CHAIN_MISMATCH',`exact scene template mismatch at row ${i}`);
    const scene=scenes[0];
    const expectedByKey={g6_slots:docs.expansionG6V1.filter(x=>x.scene_template_id===scene.id&&x.scene_template_version===scene.version),positions:docs.expansionPositionsV1.filter(x=>x.scene_template_id===scene.id&&x.scene_template_version===scene.version),endpoint_slots:docs.expansionEndpointsV1.filter(x=>x.scene_template_id===scene.id&&x.scene_template_version===scene.version),movement_edges:docs.expansionMovementV1.filter(x=>x.scene_template_id===scene.id&&x.scene_template_version===scene.version)};
    wrapperRecords(r.g6_slots,expectedByKey.g6_slots,'expansionG6V1','EXPANSION_V1_TOPOLOGY_MISMATCH',`G6 slots ${i}`);
    wrapperRecords(r.positions,expectedByKey.positions,'expansionPositionsV1','EXPANSION_V1_TOPOLOGY_MISMATCH',`positions ${i}`);
    wrapperRecords(r.endpoint_slots,expectedByKey.endpoint_slots,'expansionEndpointsV1','EXPANSION_V1_TOPOLOGY_MISMATCH',`endpoint slots ${i}`);
    wrapperRecords(r.movement_edges,expectedByKey.movement_edges,'expansionMovementV1','EXPANSION_V1_TOPOLOGY_MISMATCH',`movement edges ${i}`);
    if(r.g6_slots.length!==1||r.positions.length<1||r.endpoint_slots.length<1||r.movement_edges.length<1)reject('EXPANSION_V1_TOPOLOGY_MISMATCH',`incomplete authored topology refs at row ${i}`);
    const pairs=new Set(r.movement_edges.map(x=>`${x.record.from_position_slot_key}\u0000${x.record.to_position_slot_key}`));
    if(r.movement_edges.some(x=>!pairs.has(`${x.record.to_position_slot_key}\u0000${x.record.from_position_slot_key}`)))reject('EXPANSION_V1_TOPOLOGY_MISMATCH',`movement topology has no reciprocal edge at row ${i}`);
    const visibilityDatasets=manifest.datasets.filter(x=>/visibility/i.test(`${x.table} ${x.file}`));
    if(!same(r.visibility_finding,{manifest_has_visibility_dataset:false,finding:'no_visibility_dataset_in_approved_bundle_manifest'})||visibilityDatasets.length!==0)reject('EXPANSION_V1_VISIBILITY_MISMATCH',`visibility absence finding differs at row ${i}`);
  }
  if(new Set(chain.rows.map(x=>x.generation_template.record.id)).size!==25||new Set(chain.rows.map(x=>x.scene_template.record.id)).size!==9)reject('EXPANSION_V1_CHAIN_SHAPE_INVALID','unique generation or scene-template count changed');
  const actualGapFields=gapDoc.field_gap_categories;
  if(!same(actualGapFields,fields)||gapDoc.profile!==null||gapDoc.target_selector_count!==33||gapDoc.gap_count!==297||gapDoc.gaps.length!==297)reject('GAP_SHAPE_INVALID','gap matrix must be exact 33 × 9 with profile null');
  const expectedGapKeys=['gap_id','target_selector','field_path','field','reason_code','status','inspected_source_keys','required_evidence','note','observed_candidate_only_refs','partial_evidence','field_scope','observed_source_status','unmet_requirement'];
  const seen=new Set();
  for(const g of gapDoc.gaps){
    if(!fields.includes(g.field))reject('GAP_FIELD_UNKNOWN',`unknown gap field ${g.field}`);
    for(const k of Object.keys(g))if(!expectedGapKeys.includes(k))reject('GAP_UNKNOWN_KEY',`unknown gap key ${k}`);
    const index=g.target_selector?.row_index;if(!Number.isInteger(index)||index<0||index>=33)reject('GAP_SELECTOR_MISMATCH','gap row index outside exact target family');
    const expectedSelector=expectedSelectors[index];const gapSelector={row_index:expectedSelector.row_index,selector_kind:expectedSelector.selector_kind,g4_ref:expectedSelector.g4_ref,...(expectedSelector.generation_template_ref?{generation_template_ref:expectedSelector.generation_template_ref}:{}),...(expectedSelector.canonical_g5_ref?{canonical_g5_ref:expectedSelector.canonical_g5_ref,scene_template_ref:expectedSelector.scene_template_ref}:{})};
    if(!same(g.target_selector,gapSelector))reject('GAP_SELECTOR_MISMATCH',`gap selector ${index} differs from pinned exact selector`);
    const key=`${index}:${g.field}`;if(seen.has(key))reject('GAP_DUPLICATE','duplicate selector/field gap');seen.add(key);
    if(g.gap_id!==`S1G-${String(index+1).padStart(2,'0')}-${g.field}`||g.field_path!==`profile.${g.field}`||g.status!=='unresolved_typed_gap')reject('GAP_SHAPE_INVALID',`gap identity/path/status mismatch for ${key}`);
    if(!reasonCodes.includes(g.reason_code))reject('GAP_REASON_UNKNOWN',`unknown typed reason ${g.reason_code}`);
    const diag=audit.rows.find(r=>r.row_index===index);
    if(index<32){
      const observed={generation_template_ref:diag.observed_source_ref,scene_materialization_profile_ref:diag.scene_materialization_profile_ref,scene_template_ref:diag.observed_scene_template_ref};
      if(!same(g.observed_candidate_only_refs,observed))reject('GAP_DIAGNOSTIC_REF_MISMATCH',`candidate-only diagnostic refs changed for ${key}`);
    }else if(g.observed_candidate_only_refs!==undefined)reject('GAP_DIAGNOSTIC_REF_MISMATCH',`canonical selector cannot carry generated candidate refs for ${key}`);
    const expectedReason=index<32?fieldReason[g.field]:(g.field==='property_refs'||g.field==='function_refs'||g.field==='environment_refs'||g.field==='semantic_context_refs')?'unapproved':g.field==='visibility_topology_refs'?'missing_topology':g.field==='movement_topology_refs'?'missing_topology':(g.field==='g6_slot_ref'?'unapproved':((g.field==='scene_template_ref'||g.field==='position_ref')?'unapproved':null));
    if(g.reason_code!==expectedReason)reject('GAP_REASON_MISMATCH',`reason ${g.reason_code} is inconsistent with ${key}`);
    const expectedNote=(g.field==='property_refs'||g.field==='function_refs'||g.field==='environment_refs'||g.field==='semantic_context_refs')?'Approved target selectors expose classification/natural profile IDs, but candidate content is pending approval; ID or classification is not admitted property/function/environment/semantic payload.':null;
    if((expectedNote===null&&g.note!==undefined)||(expectedNote!==null&&g.note!==expectedNote))reject('GAP_EVIDENCE_MISMATCH',`gap note is not field-authorized for ${key}`);
    if(!Array.isArray(g.inspected_source_keys)||!g.inspected_source_keys.length||g.inspected_source_keys.some(k=>!Object.hasOwn(sourceMap.source_pins,k))||new Set(g.inspected_source_keys).size!==g.inspected_source_keys.length)reject('GAP_SOURCE_KEYS_INVALID',`gap inspected source set invalid for ${key}`);
    if(typeof g.required_evidence!=='string'||!g.required_evidence.trim())reject('GAP_EVIDENCE_MISSING',`gap required evidence missing for ${key}`);
    if(index<32){
      const expectedScopeRow=fieldScope[g.field];
      const expectedEvidence={source_map_pointer:`/approved_expansion_v1_chain/rows/${index}`,field_evidence_key:fieldEvidenceKey[g.field],field_scope:expectedScopeRow[0],observed_source_status:expectedScopeRow[1],unmet_requirement:expectedScopeRow[2]};
      if(!same(g.partial_evidence,expectedEvidence)||g.field_scope!==expectedScopeRow[0]||g.observed_source_status!==expectedScopeRow[1]||g.unmet_requirement!==expectedScopeRow[2]||g.required_evidence!==expectedScopeRow[2])reject('EXPANSION_V1_GAP_EVIDENCE_MISMATCH',`generated field gap lacks exact @1 partial evidence/scope for ${key}`);
      const chainRow=chain.rows[index];
      if(!chainRow||resolvePointer(sourceMap,g.partial_evidence.source_map_pointer)!==chainRow||!g.inspected_source_keys.includes('expansionManifest')||!g.inspected_source_keys.includes('expansionGenerationV1'))reject('EXPANSION_V1_GAP_EVIDENCE_MISMATCH',`generated field gap pointer or inspected sources mismatch for ${key}`);
      const fieldKey=g.partial_evidence.field_evidence_key;
      if(fieldKey==='scene_template'&&!chainRow.scene_template?.record)reject('EXPANSION_V1_GAP_EVIDENCE_MISMATCH',`scene evidence missing for ${key}`);
      if(fieldKey==='positions'&&chainRow.positions.length<2)reject('EXPANSION_V1_GAP_EVIDENCE_MISMATCH',`position ambiguity is not supported by multiple exact rows for ${key}`);
      if(fieldKey==='g6_slots'&&(chainRow.g6_slots.length!==1||!['spatial.g6.open','spatial.g6.water'].includes(chainRow.g6_slots[0].record.physical_class_id)||chainRow.g6_slots[0].record.enclosing_structure_slot_key!==null))reject('EXPANSION_V1_GAP_EVIDENCE_MISMATCH',`non-enclosing G6 evidence does not support typed gap for ${key}`);
      if(fieldKey==='movement_edges'&&!chainRow.movement_edges.length)reject('EXPANSION_V1_GAP_EVIDENCE_MISMATCH',`movement evidence missing for ${key}`);
      if(fieldKey==='visibility_finding'&&chainRow.visibility_finding.manifest_has_visibility_dataset!==false)reject('EXPANSION_V1_GAP_EVIDENCE_MISMATCH',`visibility gap evidence mismatch for ${key}`);
    }else if(index===32&&(g.field==='scene_template_ref'||g.field==='g6_slot_ref')){
      if(typeof g.field_scope!=='string'||typeof g.observed_source_status!=='string'||typeof g.unmet_requirement!=='string'||!g.partial_evidence)reject('CANONICAL_GAP_SCOPE_MISSING',`canonical partial evidence/scope missing for ${key}`);
      if(g.field==='scene_template_ref'&&(!g.field_scope.toLowerCase().includes('exact approved canonical scene-template ref exists')||!g.observed_source_status.includes('scene_template_approved')))reject('CANONICAL_GAP_SCOPE_MISMATCH','canonical scene gap must distinguish existing approved scene from missing S1 binding');
      if(g.field==='g6_slot_ref'&&(!g.field_scope.toLowerCase().includes('authored canonical main g6 exists and is open')||!g.observed_source_status.includes('authored_main_open_slot')))reject('CANONICAL_GAP_SCOPE_MISMATCH','canonical G6 gap must distinguish existing main slot from missing S1 structural slot');
      const selectorRec=target.applicability[32],startRec=docs.targetStart.initial_placement,mainRec=g6Rows.find(x=>x.scene_slot_key==='main');
      const loc=(key,pointer,record)=>({source_key:key,source_path:pinPaths[key],source_json_pointer:pointer,record});
      const expectedPartial=g.field==='scene_template_ref'?{selector_source:loc('target','/applicability/32',selectorRec),scene_template_source:loc('sceneTemplates',`/${docs.sceneTemplates.indexOf(scene)}`,scene),initial_placement_source:loc('targetStart','/initial_placement',startRec),initial_placement_status:{status:docs.targetStart.status,approved:docs.targetStart.approved,import_authorized:docs.targetStart.import_authorized,activation_authorized:docs.targetStart.activation_authorized}}:{selector_source:loc('target','/applicability/32',selectorRec),scene_template_source:loc('sceneTemplates',`/${docs.sceneTemplates.indexOf(scene)}`,scene),main_g6_source:loc('g6',`/${docs.g6.indexOf(mainRec)}`,mainRec),initial_placement_source:loc('targetStart','/initial_placement',startRec),initial_placement_status:{status:docs.targetStart.status,approved:docs.targetStart.approved,import_authorized:docs.targetStart.import_authorized,activation_authorized:docs.targetStart.activation_authorized}};
      if(!same(g.partial_evidence,expectedPartial)||g.unmet_requirement!==g.required_evidence)reject('CANONICAL_GAP_EVIDENCE_MISMATCH',`canonical partial evidence differs from pinned source for ${key}`);
    }else if(g.partial_evidence||g.field_scope||g.observed_source_status||g.unmet_requirement)reject('GAP_UNKNOWN_EVIDENCE','partial evidence scope is only valid for the two canonical scene/G6 gaps');
  }
  if(seen.size!==297)reject('GAP_SHAPE_INVALID','gap field coverage is incomplete');
  const scope=gapDoc.scope_assessment;
  exactKeys(scope,['approved_expansion_v1_chain_covers_generated_selectors','generated_selector_count','unique_generation_template_count','unique_scene_template_count','target_s1_binding_present','approved_property_function_environment_semantic_payload_found','interior_or_enclosing_g6_found','reciprocal_visibility_link_templates_found','approved_expansion_data_only_not_s1_admission','target_spatial_package_intake_status','target_spatial_materialization_authorized','import_authorized','activation_authorized'],'GAP_SCOPE_MISMATCH','gap scope assessment');
  const expectedScope={approved_expansion_v1_chain_covers_generated_selectors:true,generated_selector_count:32,unique_generation_template_count:25,unique_scene_template_count:9,target_s1_binding_present:false,approved_property_function_environment_semantic_payload_found:false,interior_or_enclosing_g6_found:false,reciprocal_visibility_link_templates_found:false,approved_expansion_data_only_not_s1_admission:true,target_spatial_package_intake_status:docs.spatialApprovalIndex.intake_status,target_spatial_materialization_authorized:false,import_authorized:false,activation_authorized:false};
  if(!same(scope,expectedScope))reject('GAP_SCOPE_MISMATCH','gap scope assessment changed');
  if(candidate.exact_existing_refs.property_refs!==undefined||candidate.exact_existing_refs.environment_refs!==undefined)reject('CANDIDATE_UNKNOWN_KEY','unapproved payload refs cannot appear in candidate envelope');
  return {selectors:33,gaps:297,generatedRows:audit.rows.length,recordLocators:countExactValues(sourceMap,sourceMap.canonical_scene_evidence.scene_template.record)+0,pins:expectedPinKeys.length,approvedV1Rows:chain.rows.length,uniqueV1Scenes:chain.unique_scene_template_count};
}
function parseInputDir(argv) {
  const index=argv.indexOf('--input-dir');
  if(index<0)return here;
  if(!argv[index+1])reject('CLI_ARGUMENT_INVALID','--input-dir requires a path');
  const dir=path.resolve(argv[index+1]);
  const fixtureRoot=path.join(here,'bench','s1-validator','fixtures');
  if(dir!==here&&!dir.startsWith(fixtureRoot+path.sep))reject('CLI_ARGUMENT_INVALID','input directory must be the task output or validator fixture root');
  return dir;
}
async function main(){
 try{const result=validate(parseInputDir(process.argv.slice(2)));console.log(`PASS selectors=${result.selectors} typed_gaps=${result.gaps} generated_diagnostics=${result.generatedRows} approved_v1_rows=${result.approvedV1Rows} v1_scenes=${result.uniqueV1Scenes} source_pins=${result.pins}`);}
 catch(error){const code=error instanceof ValidationError?error.code:'VALIDATOR_INTERNAL_ERROR';console.error(`S1_VALIDATION_ERROR[${code}]: ${error.message}`);process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
