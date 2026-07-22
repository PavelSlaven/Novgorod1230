#!/usr/bin/env python3
from __future__ import annotations
import pathlib, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
commands=[['python',str(ROOT/'scripts/validate_bundle.py')],['python',str(ROOT/'scripts/validate_source_reproduction.py')],['python',str(ROOT/'scripts/verify_manifest.py')]]
for c in commands:
 r=subprocess.run(c)
 if r.returncode: raise SystemExit(r.returncode)
print('ALL PACKAGE CHECKS PASS')
