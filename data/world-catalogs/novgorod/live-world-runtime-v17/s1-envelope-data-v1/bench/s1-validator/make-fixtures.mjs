import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)), out=path.resolve(here,'../..'), fixtureRoot=path.join(here,'fixtures');
fs.mkdirSync(fixtureRoot,{recursive:true});
const files=['s1-v17-candidate.json','s1-source-map.json','s1-typed-gaps.json'];
const source=Object.fromEntries(files.map(f=>[f,JSON.parse(fs.readFileSync(path.join(out,f),'utf8'))]));
const cases=[
 ['R2-01-foreign-selector','TARGET_SELECTOR_MISMATCH',d=>d.map.selectors[0].generation_template_ref.id='foreign_g5_selector'],
 ['R2-02-invented-scene','CANONICAL_SCENE_REF_MISMATCH',d=>{d.candidate.exact_existing_refs.canonical_selector.scene_template_ref.id='stfv3__invented';d.candidate.exact_existing_refs.canonical_selector.scene_template_dataset_record.id='stfv3__invented';}],
 ['R2-03-wrong-scene-version','CANONICAL_SCENE_VERSION_MISMATCH',d=>d.candidate.exact_existing_refs.canonical_selector.scene_template_dataset_record.version=99],
 ['R2-04-invented-position','CANONICAL_POSITION_RECORD_MISMATCH',d=>d.candidate.exact_existing_refs.canonical_start_position.authored_template_positions[0].position_slot_key='invented'],
 ['R2-05-wrong-movement-number','CANONICAL_MOVEMENT_RECORD_MISMATCH',d=>d.candidate.exact_existing_refs.canonical_start_position.authored_movement_templates[0].action_units=999],
 ['R2-06-invented-g6-enclosure','CANONICAL_G6_RECORD_MISMATCH',d=>d.candidate.exact_existing_refs.canonical_start_position.authored_g6_slots[0].enclosing_structure_slot_key='invented_enclosure'],
 ['R2-07-fabricated-visibility','CANONICAL_VISIBILITY_NOT_AUTHORED',d=>d.candidate.exact_existing_refs.canonical_start_position.visibility_templates.push({link_slot_key:'fabricated',from_position_slot_key:'arrival',to_position_slot_key:'focus'})],
 ['R2-08-extra-property-payload','CANDIDATE_UNKNOWN_KEY',d=>d.candidate.exact_existing_refs.property_refs=[{id:'invented_property',version:1}]],
 ['R2-09-invented-gap-selector','GAP_SELECTOR_MISMATCH',d=>d.gaps.gaps[0].target_selector.g4_ref.id='invented_g4'],
 ['R2-10-unknown-gap-reason','GAP_REASON_UNKNOWN',d=>d.gaps.gaps[0].reason_code='invented_reason'],
 ['R2-11-missing-required-pin','SOURCE_PIN_SET_MISMATCH',d=>delete d.map.source_pins.positions],
 ['R2-12-approved-candidate','CANDIDATE_STATUS_INVALID',d=>d.candidate.approved=true],
 ['R1-13-negative-array-index','SOURCE_POINTER_INVALID',d=>d.map.generated_selector_scene_topology_audit.rows[0].topology_v2.g6_slots[0].source_json_pointer='/-1'],
 ['R1-14-pointer-out-of-range','SOURCE_POINTER_UNRESOLVED',d=>d.map.generated_selector_scene_topology_audit.rows[0].topology_v2.positions[0].source_json_pointer='/99999'],
 ['R1-15-wrong-source-path','SOURCE_PATH_MISMATCH',d=>d.map.generated_selector_scene_topology_audit.rows[0].topology_v2.movement[0].source_path='data/elsewhere.json'],
 ['R1-16-wrong-record-version-pointer','SOURCE_RECORD_MISMATCH',d=>d.map.generated_selector_scene_topology_audit.rows[0].topology_v2.g6_slots[0].source_json_pointer='/0'],
 ['R5-17-start-source-status','CANONICAL_START_STATUS_MISMATCH',d=>d.candidate.exact_existing_refs.canonical_start_position.source_status='approved'],
 ['R5-18-start-candidate-status','CANONICAL_START_STATUS_MISMATCH',d=>d.candidate.exact_existing_refs.canonical_start_position.start_candidate_status='approved'],
 ['R5-19-start-source-path','CANONICAL_START_SOURCE_PATH_MISMATCH',d=>d.candidate.exact_existing_refs.canonical_start_position.source_path='data/world-catalogs/novgorod/lower-dvina/not-a-target-source.json'],
];
for(const [id,expected_code,mutate] of cases){
 const dir=path.join(fixtureRoot,id);fs.mkdirSync(dir,{recursive:true});
 const d={candidate:structuredClone(source[files[0]]),map:structuredClone(source[files[1]]),gaps:structuredClone(source[files[2]])};mutate(d);
 const values={[files[0]]:d.candidate,[files[1]]:d.map,[files[2]]:d.gaps};
 for(const f of files){const dest=path.join(dir,f);if(fs.existsSync(dest)){const stamp=new Date().toISOString().replace(/[-:.]/g,'').replace('T','T').replace('Z','Z');fs.copyFileSync(dest,`${dest}.${stamp}.bak`)}fs.writeFileSync(dest,JSON.stringify(values[f],null,2)+'\n')}
 const manifest={id,expected_code,mutation:id};const mf=path.join(dir,'expected.json');if(fs.existsSync(mf)){const stamp=new Date().toISOString().replace(/[-:.]/g,'');fs.copyFileSync(mf,`${mf}.${stamp}.bak`)}fs.writeFileSync(mf,JSON.stringify(manifest,null,2)+'\n');
}
const list=cases.map(([id,code])=>`${id}|${code}`).join('\n')+'\n';const listFile=path.join(here,'expected-list.txt');if(fs.existsSync(listFile)){const stamp=new Date().toISOString().replace(/[-:.]/g,'');fs.copyFileSync(listFile,`${listFile}.${stamp}.bak`)}fs.writeFileSync(listFile,list);
console.log(`Prepared ${cases.length} isolated invalid candidate fixtures; no fixture is target evidence.`);
