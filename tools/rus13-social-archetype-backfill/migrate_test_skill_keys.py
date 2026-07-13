#!/usr/bin/env python3
"""One-shot migrate legacy skill keys in test fixtures."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPL = {
    "melee": "melee_combat",
    "ranged": "ranged_combat",
    "riding": "travel_transport",
    "communication": "communication_trade",
    "custom_and_law": "custom_law_literacy",
}

for path in (ROOT / "test").rglob("*.js"):
    text = path.read_text(encoding="utf-8")
    orig = text
    for old, new in REPL.items():
        text = text.replace(f"'{old}'", f"'{new}'")
        text = text.replace(f'"{old}"', f'"{new}"')
    if text != orig:
        path.write_text(text, encoding="utf-8")
        print(f"updated {path.relative_to(ROOT)}")
