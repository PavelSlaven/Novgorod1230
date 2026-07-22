#!/usr/bin/env python3
from __future__ import annotations
import json, pathlib, re, sys

def load(p): return json.loads(pathlib.Path(p).read_text(encoding='utf-8'))
def main(argv):
    if len(argv)!=3:
        print('usage: verify_evidence.py P27.json FRESH_CHECKOUT.json',file=sys.stderr); return 2
    p27,fresh=map(load,argv[1:])
    errors=[]
    if p27.get('status')!='signed_evidence': errors.append('P27 evidence is not signed_evidence')
    if not re.fullmatch(r'[0-9a-f]{40}',str(p27.get('commit_sha',''))): errors.append('P27 commit SHA invalid')
    if p27.get('verdict') not in {'PASS','PASS WITH NOTES'}: errors.append('P27 verdict invalid')
    sig=p27.get('signature',{})
    if sig.get('algorithm') not in {'ed25519','minisign','gpg'} or len(str(sig.get('value','')))<32: errors.append('P27 signature missing/invalid')
    if fresh.get('status')!='completed_evidence': errors.append('fresh-checkout evidence is not completed_evidence')
    if not re.fullmatch(r'[0-9a-f]{40}',str(fresh.get('commit_sha',''))): errors.append('fresh checkout commit SHA invalid')
    co=fresh.get('checkout',{})
    if not all(co.get(k) is True for k in ('fresh_clone','clean_before','clean_after')): errors.append('fresh checkout cleanliness proof incomplete')
    if not fresh.get('commands'): errors.append('fresh checkout command evidence empty')
    if p27.get('commit_sha')!=fresh.get('commit_sha'): errors.append('evidence commit SHA mismatch')
    print(json.dumps({'result':'PASS' if not errors else 'FAIL','errors':errors},ensure_ascii=False,indent=2))
    return 0 if not errors else 1
if __name__=='__main__': raise SystemExit(main(sys.argv))
