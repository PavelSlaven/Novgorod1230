#!/usr/bin/env python3
from __future__ import annotations
import hashlib,json,pathlib,sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for c in iter(lambda:f.read(1024*1024),b''): h.update(c)
 return h.hexdigest()
def main():
 m=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8')); errors=[]
 for x in m['files']:
  p=ROOT/x['path']
  if not p.is_file(): errors.append(f'missing {x["path"]}'); continue
  if p.stat().st_size!=x['size']: errors.append(f'size mismatch {x["path"]}')
  if sha(p)!=x['sha256']: errors.append(f'digest mismatch {x["path"]}')
 actual={p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and p.name!='manifest.json'}
 listed={x['path'] for x in m['files']}
 if actual!=listed: errors.append(f'manifest coverage mismatch missing={sorted(actual-listed)} stale={sorted(listed-actual)}')
 print(json.dumps({'result':'PASS' if not errors else 'FAIL','errors':errors,'file_count':len(listed)},ensure_ascii=False,indent=2)); return 0 if not errors else 1
if __name__=='__main__': raise SystemExit(main())
