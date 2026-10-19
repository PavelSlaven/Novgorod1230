from pathlib import Path
import json
import os
import platform
import re
import subprocess
import time

task = Path("/home/slaven/cataclysm-recovery/task03-ext4-20261019-m3")
evidence = task / "raw"
evidence.mkdir(exist_ok=True)
runtime = task / "runtime"
binary = task / "cata_test"
userdir = task / "userdir"
env = {key: value for key, value in os.environ.items() if not key.startswith("NOVGOROD_")}
env |= {"TMPDIR": str(task / "tmp"), "TMP": str(task / "tmp"), "TEMP": str(task / "tmp")}
results = []

for name, mode in [("cold-read", "read"), ("warm-read-1", "read"), ("warm-read-2", "read"), ("warm-read-3", "read")]:
    args = [str(binary), "--rng-seed", "17", "--user-dir=" + str(userdir), "Novgorod native save and resume probe"]
    run_env = env | {"NOVGOROD_P4_MODE": mode, "NOVGOROD_P4_WORLD": "startup_diagnostic"}
    started = time.perf_counter_ns()
    process = subprocess.run(args, cwd=runtime, env=run_env, capture_output=True, timeout=180)
    wall_ms = (time.perf_counter_ns() - started) / 1e6
    stdout = process.stdout.decode(errors="replace")
    stderr = process.stderr.decode(errors="replace")
    (evidence / (name + ".stdout.raw.log")).write_text(stdout)
    (evidence / (name + ".stderr.raw.log")).write_text(stderr)
    timers = []
    for line in stderr.splitlines():
        match = re.search(r"((?:diagnostic\.|finalize\.|Dark Days Ahead|TESTING DATA).*?):\s+(\d+)us \(avg: (\d+)us\) \(count: (\d+)\)", line)
        if match:
            timers.append({"name": match[1].rstrip(":"), "ms": int(match[2]) / 1000, "count": int(match[4])})
    observation = next((json.loads(line) for line in stdout.splitlines() if line.startswith('{"p4":true')), None)
    row = {"name": name, "mode": mode, "argv": args, "cwd": str(runtime), "exit_code": process.returncode, "wall_ms": wall_ms, "timers": timers, "native_metrics": None if observation is None else {key: observation[key] for key in ["mode", "world", "save_ms", "load_ms", "core_data_ms", "bootstrap_ms"]}}
    results.append(row)
    (evidence / "measurements.json").write_text(json.dumps({"platform": platform.platform(), "runs": results}, indent=2) + "\n")
    assert process.returncode == 0, (name, process.returncode)
    assert observation is not None, name
    assert timers, name
    print(name, f"wall={wall_ms:.3f}ms", f"timers={len(timers)}", flush=True)

assert len(results) == 4
required = {"diagnostic.init_global_game_state", "diagnostic.setup", "diagnostic.core_data", "diagnostic.load_world_modfiles", "diagnostic.finalize_loaded_data", "diagnostic.native_world_load", "diagnostic.readback_test_body", "diagnostic.static_data", "diagnostic.metadata", "diagnostic.paths_options_init"}
for row in results:
    assert required <= {timer["name"] for timer in row["timers"]}, (row["name"], required - {timer["name"] for timer in row["timers"]})
    assert all(timer["count"] > 0 for timer in row["timers"])
    phases = {timer["name"]: timer["ms"] for timer in row["timers"]}
    assert phases["diagnostic.setup"] >= phases["diagnostic.load_world_modfiles"]
    assert phases["diagnostic.load_world_modfiles"] >= phases["diagnostic.load_packs"] + phases["diagnostic.finalize_loaded_data"]
    assert phases["diagnostic.init_global_game_state"] >= phases["diagnostic.setup"] + phases["diagnostic.native_world_load"]
    assert row["wall_ms"] >= phases["diagnostic.init_global_game_state"] + phases["diagnostic.readback_test_body"]
print("One process-cold read and three process-warm reads; all required native timer phases captured.")
