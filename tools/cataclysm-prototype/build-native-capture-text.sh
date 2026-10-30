#!/usr/bin/env bash
set -euo pipefail
script_dir=$(cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(git -C "$script_dir" rev-parse --show-toplevel)
source_dir=''
build_dir=''
jobs=''
while (($#)); do
    case "$1" in
        --source) [[ $# -ge 2 ]] || { echo '--source требует путь.' >&2; exit 2; }; source_dir=$2; shift 2 ;;
        --build-dir) [[ $# -ge 2 ]] || { echo '--build-dir требует путь.' >&2; exit 2; }; build_dir=$2; shift 2 ;;
        --jobs) [[ $# -ge 2 ]] || { echo '--jobs требует числа.' >&2; exit 2; }; jobs=$2; shift 2 ;;
        *) printf 'Неизвестный аргумент: %s\n' "$1" >&2; exit 2 ;;
    esac
done
[[ -n $source_dir && -d $source_dir/src ]] || { echo 'Нужен --source с чистым исходником CDDA.' >&2; exit 2; }
[[ -n $build_dir ]] || { echo 'Нужен --build-dir.' >&2; exit 2; }
[[ $jobs =~ ^[1-9][0-9]*$ ]] && (( jobs <= 24 )) || { echo '--jobs должен быть числом от 1 до 24.' >&2; exit 2; }
git -C "$source_dir" rev-parse --is-inside-work-tree >/dev/null
upstream_sha=0d8843f1c500052c3e026e3da6f8edaf5e00b626
[[ $(git -C "$source_dir" rev-parse HEAD) == "$upstream_sha" ]] || { echo "Ожидался CDDA $upstream_sha." >&2; exit 1; }
[[ -z $(git -C "$source_dir" status --porcelain --untracked-files=all) ]] || { echo 'Исходник CDDA должен быть чистым до overlays.' >&2; exit 1; }
test "$(gcc-13 -dumpversion | cut -d. -f1)" = 13
test "$(g++-13 -dumpversion | cut -d. -f1)" = 13
command -v make >/dev/null
source_dir=$(realpath -e -- "$source_dir")
build_dir=$(realpath -m -- "$build_dir")
[[ ! -e $build_dir/CMakeCache.txt ]] || { echo 'Каталог сборки должен быть деревом GNU Make.' >&2; exit 1; }
bash "$repo_root/tools/cataclysm-prototype/apply-overlays.sh" --source "$source_dir"
make_vars=(CC=gcc-13 CXX=g++-13 RELEASE=1 TILES=0 SOUND=0 LOCALIZE=1 BACKTRACE=0
    LINTJSON=0 ASTYLE=0 'WARNINGS=-Wall -Wextra -Wno-logical-op'
    "BUILD_PREFIX=$build_dir/")
env -u PREFIX -u LANGUAGES make -C "$source_dir" "${make_vars[@]}" version prefix
env -u PREFIX -u LANGUAGES make -C "$source_dir" --jobs="$jobs" "${make_vars[@]}" \
    "$build_dir/cataclysm"
