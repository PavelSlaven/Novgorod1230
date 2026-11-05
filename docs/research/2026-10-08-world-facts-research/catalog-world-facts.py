#!/usr/bin/env python3
"""List research directory names without opening report files."""

from os import walk
from pathlib import Path


ROOT = Path("/srv/novgorod-work/fleet/tasks")
SKIP = {".cache", ".git", ".hg", ".mypy_cache", ".pytest_cache", ".pycache", ".svn", "__pycache__", "node_modules", "sessions"}
matches = {}

for current, directories, _files in walk(ROOT, followlinks=False):
    current_path = Path(current)
    directories[:] = [
        name
        for name in directories
        if name not in SKIP
        and not name.startswith(".")
        and not (current_path / name).is_symlink()
    ]
    for name in directories:
        candidate = current_path / name
        relative = candidate.relative_to(ROOT).as_posix()
        if name.endswith("-research"):
            matches.setdefault(relative, set()).add("*-research")
        if name == "out":
            for child in candidate.iterdir():
                if child.is_dir() and not child.is_symlink() and child.name.startswith("research"):
                    child_relative = child.relative_to(ROOT).as_posix()
                    matches.setdefault(child_relative, set()).add("out/research*")

for path in sorted(matches, key=str.casefold):
    print(f"{','.join(sorted(matches[path]))}\t{path}")
