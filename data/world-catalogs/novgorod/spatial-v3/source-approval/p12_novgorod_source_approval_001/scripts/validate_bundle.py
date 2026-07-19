#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, pathlib, re, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]

def load(rel): return json.loads((ROOT/rel).read_text(encoding='utf-8'))
def fail(errors, msg): errors.append(msg)
def unique(records, key, errors, label):
    vals=[r[key] for r in records]
    if len(vals)!=len(set(vals)): fail(errors, f'{label}: duplicate {key}')

def main():
    errors=[]; notes=[]
    cat=load('data/catalog.json')
    g4=load('data/g4-host-sectors.json')['records']
    g5=load('data/canonical-g5-inventory.json')['records']
    rb=load('data/legacy-edge-mapping-bindings.json')['records']
    pe=load('data/physical-exit-source-pairs.json')['records']
    pf=load('data/approved-scene-profile-families.json')['records']
    tf=load('data/approved-scene-template-families.json')['records']
    sp=load('data/scene-materialization-profiles.json')['records']
    sc=load('data/scene-materialization-candidates.json')['records']
    sa=load('data/scene-profile-assignments.json')['records']
    expected={'target_g4_host_sectors':32,'canonical_g5':195,'legacy_edge_mapping_bindings':600,'physical_exit_source_pairs':358,'derived_directional_traversals':716,'scene_profile_families':17,'scene_template_families':17,'scene_materialization_profiles':195,'scene_materialization_candidates':195,'scene_assignments':195}
    for k,v in expected.items():
        if cat['counts'].get(k)!=v: fail(errors,f'catalog count {k}: {cat["counts"].get(k)} != {v}')
    actual={'target_g4_host_sectors':len(g4),'canonical_g5':len(g5),'legacy_edge_mapping_bindings':len(rb),'physical_exit_source_pairs':len(pe),'derived_directional_traversals':sum(x['direction_count'] for x in pe),'scene_profile_families':len(pf),'scene_template_families':len(tf),'scene_materialization_profiles':len(sp),'scene_materialization_candidates':len(sc),'scene_assignments':len(sa)}
    for k,v in expected.items():
        if actual[k]!=v: fail(errors,f'actual count {k}: {actual[k]} != {v}')
    unique(g4,'id',errors,'g4'); unique(g5,'id',errors,'g5'); unique(rb,'binding_id',errors,'edge binding'); unique(pe,'physical_exit_pair_id',errors,'exit pair'); unique(sp,'id',errors,'scene profile')
    g4_ids={x['id'] for x in g4}; g5_ids={x['id'] for x in g5}; sp_ids={x['id'] for x in sp}; tf_refs={x['id']+'@'+x['version'] for x in tf}
    for x in g5:
        if x['class_id']!='spatial.g5.parcel': fail(errors,f'{x["id"]}: non-parcel without compound proof')
        if x['parent_g4_id'] not in g4_ids: fail(errors,f'{x["id"]}: missing parent G4')
        if x['status']!='approved': fail(errors,f'{x["id"]}: not approved')
    if sum(1 for x in rb if x['physical'])!=358: fail(errors,'edge bindings physical count != 358')
    if sum(1 for x in rb if not x['physical'])!=242: fail(errors,'edge bindings hierarchy count != 242')
    direction_ids=[]
    rb_by_legacy={x['legacy_edge_id']:x for x in rb}
    for x in pe:
        if x['direction_count']!=2 or len(x['directions'])!=2: fail(errors,f'{x["physical_exit_pair_id"]}: must expand to exactly two directions')
        if x['legacy_edge_id'] not in rb_by_legacy or not rb_by_legacy[x['legacy_edge_id']]['physical']: fail(errors,f'{x["physical_exit_pair_id"]}: missing physical edge mapping')
        d0,d1=x['directions']
        if d0['from']!=x['source_from'] or d0['to']!=x['source_to']: fail(errors,f'{x["physical_exit_pair_id"]}: forward direction mismatch')
        if d1['from']!=x['source_to'] or d1['to']!=x['source_from']: fail(errors,f'{x["physical_exit_pair_id"]}: reverse direction mismatch')
        direction_ids.extend([d0['direction_id'],d1['direction_id']])
    if len(direction_ids)!=len(set(direction_ids)): fail(errors,'duplicate directional traversal identity')
    mapping_counts={k:sum(1 for x in rb if x['target_mapping_kind']==k) for k in {x['target_mapping_kind'] for x in rb}}
    expected_mapping={'intra_g4_site_connection_source':227,'canonical_g5_parent_dependency':195,'retained_hierarchy_dependency':47,'cross_g4_world_route_source':43,'corridor_to_host_route_context_source':32,'host_entry_site_connection_source':32,'world_route_segment_context_source':24}
    if mapping_counts!=expected_mapping: fail(errors,f'target mapping counts mismatch: {mapping_counts}')
    candidates_by_profile={}
    for x in sc:
        if x['profile_id'] in candidates_by_profile: fail(errors,f'{x["profile_id"]}: multiple candidates; package requires one deterministic candidate')
        candidates_by_profile[x['profile_id']]=x
        if x['scene_template_ref'] not in tf_refs: fail(errors,f'{x["profile_id"]}: unresolved scene template')
    for x in sp:
        source_id=x['source_ref'].split('@',1)[0]
        if source_id not in g5_ids: fail(errors,f'{x["id"]}: unresolved canonical G5 source')
        if x['id'] not in candidates_by_profile: fail(errors,f'{x["id"]}: empty candidate set')
        if x['status']!='approved': fail(errors,f'{x["id"]}: not approved')
    assigned={x['canonical_g5_id'] for x in sa}
    if assigned!=g5_ids: fail(errors,f'scene assignment coverage mismatch missing={len(g5_ids-assigned)} extra={len(assigned-g5_ids)}')
    if len(assigned)!=len(sa): fail(errors,'multiple scene assignments for one canonical G5')
    boundary=[x for x in sa if x['external_route_availability']=='blocked_pending_external_boundary']
    if len(boundary)!=4: fail(errors,f'expected 4 boundary-route blocked scenes, got {len(boundary)}')
    if any(not x['scene_materialization_allowed'] for x in boundary): fail(errors,'boundary route block incorrectly disables scene materialization')
    if cat['production_activation_allowed'] is not False: fail(errors,'package must not activate production')
    # Templates must not masquerade as actual evidence.
    for rel in ['evidence/P27_SIGNED_AUDIT_EVIDENCE.template.json','evidence/FRESH_CHECKOUT_EVIDENCE.template.json']:
        x=load(rel)
        if x.get('status')!='template_not_evidence': fail(errors,f'{rel}: template can be mistaken for evidence')
    # No placeholder strings in activation data.
    for rel in pathlib.Path(ROOT/'data').glob('*.json'):
        text=rel.read_text(encoding='utf-8')
        if 'REPLACE_WITH_' in text: fail(errors,f'{rel.name}: placeholder in data')
    report={'schema_version':'rus.p12_bundle_validation.v1','result':'PASS' if not errors else 'FAIL','errors':errors,'notes':notes,'actual_counts':actual}
    out=ROOT/'reports/validation-report.json'; out.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return 0 if not errors else 1
if __name__=='__main__': raise SystemExit(main())
