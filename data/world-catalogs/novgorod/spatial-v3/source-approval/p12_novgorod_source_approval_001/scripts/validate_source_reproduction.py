#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, pathlib, tempfile, zipfile, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(p): return json.loads(pathlib.Path(p).read_text(encoding='utf-8'))
def sha(p):
 h=hashlib.sha256();
 with pathlib.Path(p).open('rb') as f:
  for c in iter(lambda:f.read(1024*1024),b''): h.update(c)
 return h.hexdigest()
def main():
 errors=[]
 prov=load(ROOT/'data/provenance.json')
 bypath={x['path']:x for x in prov['sources']}
 for rel,source in bypath.items():
  p=ROOT/rel
  if not p.exists(): errors.append(f'missing source {rel}')
  elif sha(p)!=source['sha256']: errors.append(f'source digest mismatch {rel}')
 with tempfile.TemporaryDirectory() as td:
  td=pathlib.Path(td)
  r2=ROOT/'source-snapshots/gn_nov_g1_xp017_yp026_rebuild_002_approved_local.zip'
  r3=ROOT/'source-snapshots/gn_nov_g1_xp017_yp026_content_revision_003_production_candidate.zip'
  with zipfile.ZipFile(r2) as z: z.extractall(td/'r2')
  with zipfile.ZipFile(r3) as z: z.extractall(td/'r3')
  base=td/'r2/gn_nov_g1_xp017_yp026_rebuild_002'
  prod=td/'r3/content_revision_003_production_candidate'
  src_g4=load(base/'05-g4/g4-locations.json'); src_edges=load(base/'07-graph/graph-edges.json')
  src_pf=load(prod/'01-profiles/g5-materialization-profiles.json'); src_pa=load(prod/'01-profiles/g5-profile-assignments.json')
  out_g5=load(ROOT/'data/canonical-g5-inventory.json')['records']; out_rb=load(ROOT/'data/legacy-edge-mapping-bindings.json')['records']; out_pe=load(ROOT/'data/physical-exit-source-pairs.json')['records']; out_pf=load(ROOT/'data/approved-scene-profile-families.json')['records']; out_sa=load(ROOT/'data/scene-profile-assignments.json')['records']
  if {x['legacy_record_ref']['id'] for x in out_g5}!={x['id'] for x in src_g4}: errors.append('canonical G5 source coverage mismatch')
  src_g4_by={x['id']:x for x in src_g4}
  for x in out_g5:
   y=src_g4_by[x['legacy_record_ref']['id']]
   for outk,srck in [('title','name'),('spatial_function_id','location_type'),('function','function'),('evidence_status','evidence_status'),('reconstruction_method','reconstruction_method'),('source_ids','source_ids'),('claim_ids','claim_ids')]:
    if x[outk]!=y[srck]: errors.append(f'canonical G5 field drift {x["id"]}:{outk}')
  if {x['legacy_edge_id'] for x in out_rb}!={x['id'] for x in src_edges}: errors.append('edge mapping source coverage mismatch')
  if {x['legacy_edge_id'] for x in out_pe}!={x['id'] for x in src_edges if x['physical']}: errors.append('physical pair source coverage mismatch')
  if {x['profile_id'] for x in out_pf}!={x['profile_id'] for x in src_pf}: errors.append('profile family source coverage mismatch')
  if {x['legacy_g4_id'] for x in out_sa}!={x['g4_id'] for x in src_pa}: errors.append('profile assignment source coverage mismatch')
  if len(src_g4)!=195 or len(src_edges)!=600 or sum(bool(x['physical']) for x in src_edges)!=358 or len(src_pf)!=17 or len(src_pa)!=195: errors.append('source counts differ from approved pins')
 report={'schema_version':'rus.p12_source_reproduction_report.v1','result':'PASS' if not errors else 'FAIL','errors':errors,'source_counts':{'g4':195,'edges':600,'physical_edges':358,'profile_families':17,'profile_assignments':195}}
 (ROOT/'reports/source-reproduction-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False,indent=2)); return 0 if not errors else 1
if __name__=='__main__': raise SystemExit(main())
