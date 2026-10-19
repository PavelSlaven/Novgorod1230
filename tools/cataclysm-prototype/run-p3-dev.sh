#!/usr/bin/env bash
set -euo pipefail
launcher_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
runtime_root="$HOME/cataclysm-recovery/task03-dev"
native_only=false
reset=false
while (($#)); do
    case "$1" in
        --runtime-root) runtime_root=${2:?missing runtime root}; shift 2 ;;
        --native-only) native_only=true; shift ;;
        --reset) reset=true; shift ;;
        *) printf 'Неизвестный аргумент: %s\n' "$1" >&2; exit 2 ;;
    esac
done
runtime_root=$(realpath -e -- "$runtime_root")
runtime="$runtime_root/runtime"
userdir="$runtime_root/userdir"
run_dir="$runtime_root/run"
fixture="$runtime_root/fixture/save"
[[ $(findmnt -n -o FSTYPE -T "$runtime_root") == ext4 ]] || { echo 'Runtime должен находиться на ext4 WSL.' >&2; exit 1; }
[[ -x "$runtime/cataclysm" && -d "$runtime/data" && -d "$runtime/gfx" && -d "$runtime/data/gfx" && -d "$fixture" ]] || { echo 'Runtime не подготовлен: нужны binary, data/gfx и fixture/save.' >&2; exit 1; }
for location in "$runtime" "$runtime/cataclysm" "$runtime/data" "$runtime/data/gfx" "$fixture"; do
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
fi
[[ -d "$userdir/save" ]] || { echo 'Userdir повреждён: save отсутствует. Автосброс запрещён.' >&2; exit 1; }
[[ -z $(find "$userdir" -type l -print -quit) ]] || { echo 'Ссылки внутри userdir не поддерживаются.' >&2; exit 1; }
mapfile -d '' worlds < <(find "$userdir/save" -mindepth 1 -maxdepth 1 -type d -print0)
[[ ${#worlds[@]} == 1 ]] || { echo 'Нужен ровно один dev-мир; сохранения не изменены.' >&2; exit 1; }
world=$(basename -- "${worlds[0]}")
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
deadline = time.monotonic() + 20
while time.monotonic() < deadline:
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
else:
    raise SystemExit("Coordinator не готов за 20 секунд; запуск остановлен.")
PY
    export NOVGOROD_P3_SOCKET="$socket"
    export NOVGOROD_P3_TIMEOUT_MS=120000
fi
printf '%s\n' 'Dev-проба, не P3 GO; T09 не закрыт. Проза: черновик, не сохранено.'
cd -- "$runtime"
"$runtime/cataclysm" --datadir "$runtime/data/" --userdir "$userdir/" --world "$world" <&0 &
game_pid=$!
wait "$game_pid"
game_pid=''
