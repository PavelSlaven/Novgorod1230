from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import os
import shlex
import subprocess

repo = Path(__file__).resolve().parents[4]
task = repo / "artifacts/2026-10-19/task02"
original_source = repo / "artifacts/2026-10-19/nativebuild/cataclysm-source"
original_build = repo / "artifacts/2026-10-19/nativebuild/build-release"
source = task / "startup-native-source"
build = task / "startup-native-build"
evidence = Path(__file__).parent
tmp = task / "tmp"
tmp.mkdir(parents=True, exist_ok=True)
env = os.environ | {"TMPDIR": str(tmp), "TMP": str(tmp), "TEMP": str(tmp)}
paths = ["src/game.cpp", "src/game_io.cpp", "src/init.cpp", "tests/test_main.cpp", "tests/novgorod_persistence_test.cpp"]
commands = []
objects = {}

for path in paths:
    target = ("src/CMakeFiles/cataclysm-common.dir/" if path.startswith("src/") else "tests/CMakeFiles/cata_test.dir/") + Path(path).name + ".o"
    output = subprocess.check_output(["ninja", "-C", str(original_build), "-t", "commands", target], text=True)
    command = next(line for line in output.splitlines() if " -c " + str(original_source / path) in line)
    args = shlex.split(command)
    new_object = build / target
    new_object.parent.mkdir(parents=True, exist_ok=True)
    args = [str(source / path) if arg == str(original_source / path) else str(new_object) if arg == target else str(new_object) + ".d" if arg == target + ".d" else arg for arg in args]
    if path.startswith("tests/"):
        args[1:1] = ["-I" + str(original_source / "tests")]
    commands.append(args)
    objects[target] = str(new_object)


def compile_one(args):
    name = Path(args[-1]).name
    output = Path(args[args.index("-o") + 1])
    if output.exists() and output.stat().st_mtime_ns > Path(args[-1]).stat().st_mtime_ns:
        return name + " (unchanged diagnostic object)"
    with (evidence / (name + ".build.log")).open("w") as log:
        subprocess.run(args, cwd=repo, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)
    return name


with ThreadPoolExecutor(max_workers=2) as pool:
    for name in pool.map(compile_one, commands):
        print("Compiled", name, flush=True)

lines = subprocess.check_output(["ninja", "-C", str(original_build), "-t", "commands", "tests/cata_test"], text=True).splitlines()
link = shlex.split(lines[-1].removeprefix(": && ").removesuffix(" && :"))
link = [objects.get(arg, str(original_build / arg) if not arg.startswith(("-", "/")) and arg.endswith((".o", ".a", ".so")) else arg) for arg in link]
link[link.index("-o") + 1] = str(build / "cata_test")
commands.append(link)
(evidence / "build-commands.json").write_text(json.dumps(commands, indent=2) + "\n")
binary = build / "cata_test"
if not binary.exists() or any(binary.stat().st_mtime_ns < Path(path).stat().st_mtime_ns for path in objects.values()):
    with (evidence / "link.build.log").open("w") as log:
        subprocess.run(link, cwd=repo, env=env, stdout=log, stderr=subprocess.STDOUT, check=True)

runtime = task / "startup-runtime-linked"
runtime.mkdir(exist_ok=True)
for path in ["data", "gfx"]:
    if not (runtime / path).exists():
        (runtime / path).symlink_to(original_source / path, target_is_directory=True)

identity = {
    "head": subprocess.check_output(["git.exe", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
    "compiler": subprocess.check_output(["clang++-19", "--version"], text=True).splitlines()[0],
    "baseline_build": str(original_build),
    "binary_sha256": hashlib.file_digest(binary.open("rb"), "sha256").hexdigest(),
    "runtime": str(runtime),
    "source_baseline_sha256": {path: hashlib.file_digest((original_source / path).open("rb"), "sha256").hexdigest() for path in paths},
    "source_diagnostic_sha256": {path: hashlib.file_digest((source / path).open("rb"), "sha256").hexdigest() for path in paths},
}
(evidence / "build-identity.json").write_text(json.dumps(identity, indent=2) + "\n")
print("Linked", identity["binary_sha256"], flush=True)
