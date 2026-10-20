#!/usr/bin/env bash
set -euo pipefail
launcher_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runtime_root="$HOME/cataclysm-recovery/task03-dev"
native_only=false
binary_name=cataclysm-tiles
reset=false
while (($#)); do
    case "$1" in
        --runtime-root) runtime_root=${2:?missing runtime root}; shift 2 ;;
        --native-only) native_only=true; shift ;;
        --text) binary_name=cataclysm; shift ;;
        --reset) reset=true; shift ;;
        *) printf 'Неизвестный аргумент: %s\n' "$1" >&2; exit 2 ;;
    esac
done
runtime_root=$(realpath -e -- "$runtime_root")
runtime="$runtime_root/runtime"
userdir="$runtime_root/userdir"
run_dir="$runtime_root/run"
fixture="$runtime_root/fixture/save"
binary="$runtime/$binary_name"
[[ $(findmnt -n -o FSTYPE -T "$runtime_root") == ext4 ]] || { echo 'Runtime должен находиться на ext4 WSL.' >&2; exit 1; }
if [[ $binary_name == cataclysm-tiles && ! -x "$binary" ]]; then
    printf 'Нет графического бинаря %s. Запустите текстовую игру (run-p3-dev.ps1 -Text или run-p3-dev.sh --text) или подготовьте runtime: python3 -I %s/prepare_p3_runtime.py --runtime-root %s --source <исходник CDDA> --tiles-binary <cataclysm-tiles>\n' "$binary" "$launcher_dir" "$runtime_root" >&2
    exit 1
fi
[[ -x "$binary" && -d "$runtime/data" && -d "$runtime/gfx" && -d "$runtime/data/gfx" && -d "$fixture" ]] || { echo 'Runtime не подготовлен: нужны binary, data/gfx и fixture/save.' >&2; exit 1; }
for location in "$runtime" "$binary" "$runtime/data" "$runtime/data/gfx" "$fixture"; do
    [[ $(realpath -e -- "$location") == "$runtime_root/"* ]] || { echo 'Runtime ссылается за пределы своего каталога.' >&2; exit 1; }
done
[[ -z $(find "$runtime/data" "$runtime/gfx" "$fixture" -type l -print -quit) ]] || { echo 'Ссылки внутри runtime/fixture не поддерживаются.' >&2; exit 1; }
mkdir -p -- "$run_dir"
[[ ! -L "$run_dir" && $(realpath -e -- "$run_dir") == "$runtime_root/run" ]] || { echo 'Недопустимый run directory.' >&2; exit 1; }
[[ ! -L "$run_dir/session.lock" && ( ! -e "$run_dir/session.lock" || ( -f "$run_dir/session.lock" && -O "$run_dir/session.lock" ) ) ]] || { echo 'Недопустимый session lock.' >&2; exit 1; }
exec 9>>"$run_dir/session.lock"
flock -n 9 || { echo 'Этот dev-мир уже запущен.' >&2; exit 1; }
[[ ! -L "$userdir" ]] || { echo 'Userdir не должен быть ссылкой.' >&2; exit 1; }
if $reset && [[ -e "$userdir" ]]; then
    backup="$runtime_root/userdir-before-reset-$(date -u +%Y%m%dT%H%M%S)-$$"
    mv -- "$userdir" "$backup"
    printf 'Прежний мир сохранён: %s\n' "$backup"
fi
if [[ ! -e "$userdir" ]]; then
    mkdir -- "$userdir"
    cp -a -- "$fixture" "$userdir/save"
    [[ ! -d "$runtime_root/fixture/config" ]] || cp -a -- "$runtime_root/fixture/config" "$userdir/config"
fi
[[ -d "$userdir/save" ]] || { echo 'Userdir повреждён: save отсутствует. Автосброс запрещён.' >&2; exit 1; }
[[ -z $(find "$userdir" -type l -print -quit) ]] || { echo 'Ссылки внутри userdir не поддерживаются.' >&2; exit 1; }
mapfile -d '' worlds < <(find "$userdir/save" -mindepth 1 -maxdepth 1 -type d -print0)
[[ ${#worlds[@]} == 1 ]] || { echo 'Нужен ровно один dev-мир; сохранения не изменены.' >&2; exit 1; }
world=$(basename -- "${worlds[0]}")
python3 - "$userdir" <<'PY'
import json
from pathlib import Path
import sys

config = Path(sys.argv[1]) / "config"
try:
    options = {entry["name"]: str(entry["value"]).lower()
               for entry in json.loads((config / "options.json").read_text())}
except (OSError, ValueError, KeyError, TypeError):
    raise SystemExit("Отсутствует корректный dev-профиль native options.")
required = {"AUTOSAVE": "true", "AUTOSAVE_TURNS": "3600", "AUTOSAVE_MINUTES": "5"}
if any(options.get(key) != value for key, value in required.items()):
    raise SystemExit("Требуется native AUTOSAVE=true, AUTOSAVE_TURNS=3600, AUTOSAVE_MINUTES=5.")
keybindings = config / "keybindings.json"
if not keybindings.exists():
    keybindings.write_text(json.dumps([{"id": "NOVGOROD_SEMANTIC", "version": 2,
        "category": "DEFAULTMODE", "bindings": [{"input_method": "keyboard_any", "key": ["F12"]}]}]) + "\n")
PY
socket="$run_dir/p3.sock"
coordinator_pid=''
game_pid=''
cleanup() {
    if [[ -n "$game_pid" ]]; then
        kill "$game_pid" 2>/dev/null || true
        wait "$game_pid" 2>/dev/null || true
    fi
    if [[ -n "$coordinator_pid" ]]; then
        kill "$coordinator_pid" 2>/dev/null || true
        wait "$coordinator_pid" 2>/dev/null || true
        [[ ! -S "$socket" || ! -O "$socket" ]] || rm -- "$socket"
    fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if ! $native_only; then
    node="$HOME/.local/share/novgorod/node-v22.23.3-linux-x64/bin/node"
    [[ -x "$node" ]] || { echo 'Не установлен согласованный WSL Node v22.23.3.' >&2; exit 1; }
    [[ -n ${RUS_LLM_SETTINGS_PATH:-} && -r "$RUS_LLM_SETTINGS_PATH" ]] || { echo 'Задайте доступный RUS_LLM_SETTINGS_PATH.' >&2; exit 1; }
    role_timeout_ms=$(cd -- "$launcher_dir" && "$node" --input-type=module -e '
import { loadP3QwenSettingsOwner, validateP3RoleConfigs } from "./p3-boundary.js";
const owner = await loadP3QwenSettingsOwner();
const timeouts = validateP3RoleConfigs(process.env, owner).map(role => role.timeout_ms);
if (timeouts.some(value => !Number.isSafeInteger(value) || value < 1)) throw new Error("P3_ROLE_TIMEOUT_INVALID");
process.stdout.write(String(Math.max(...timeouts)));
')
    if [[ -e "$socket" || -L "$socket" ]]; then
        [[ -S "$socket" && -O "$socket" && ! -L "$socket" ]] || { echo 'Неизвестный файл на месте socket; оставлен без изменений.' >&2; exit 1; }
        python3 - "$socket" <<'PY'
import socket
import sys

with socket.socket(socket.AF_UNIX) as client:
    client.settimeout(0.2)
    try:
        client.connect(sys.argv[1])
    except ConnectionRefusedError:
        pass
    else:
        raise SystemExit("Socket занят живым процессом; запуск остановлен.")
PY
        rm -- "$socket"
    fi
    "$node" "$launcher_dir/p3-live-coordinator.mjs" --socket "$socket" >"$run_dir/coordinator.log" 2>&1 9>&- &
    coordinator_pid=$!
    python3 - "$socket" "$coordinator_pid" <<'PY'
import os
import socket
import sys
import time

path, pid = sys.argv[1], int(sys.argv[2])
while True:
    try:
        os.kill(pid, 0)
        with socket.socket(socket.AF_UNIX) as client:
            client.settimeout(0.2)
            client.connect(path)
        break
    except ProcessLookupError:
        raise SystemExit("Coordinator завершился до readiness; запуск остановлен.")
    except (ConnectionRefusedError, FileNotFoundError, TimeoutError):
        time.sleep(0.05)
PY
    export NOVGOROD_P3_SOCKET="$socket"
    export NOVGOROD_P3_TIMEOUT_MS="$role_timeout_ms"
fi
printf '%s\n' 'Dev-проба, не P3 GO; T09 не закрыт. Проза: черновик, не сохранено.'
cd -- "$runtime"
"$binary" --datadir "$runtime/data/" --userdir "$userdir/" --world "$world" <&0 &
game_pid=$!
wait "$game_pid"
game_pid=''
