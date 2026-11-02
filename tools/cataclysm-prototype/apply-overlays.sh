#!/usr/bin/env bash
set -euo pipefail
source_dir=''
while (($#)); do
    case "$1" in
        --source) source_dir=${2:?missing source}; shift 2 ;;
        *) printf 'Неизвестный аргумент: %s\n' "$1" >&2; exit 2 ;;
    esac
done
[[ -n $source_dir && -d $source_dir/src ]] || { echo 'Нужен --source с чистым исходником CDDA.' >&2; exit 2; }
here=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

while read -r name || [[ -n $name ]]; do
    name=${name%$'\r'}
    patch="$here/$name.patch"
    git -C "$source_dir" apply --check "$patch" || { printf 'Патч не накладывается: %s\n' "$patch" >&2; exit 1; }
    git -C "$source_dir" apply "$patch"
done < "$here/native-overlays.txt"
cp -- "$here/novgorod_semantic.cpp" "$here/novgorod_semantic.h" "$source_dir/src/"
cp -- "$here/native-capture/novgorod_capture.cpp" "$here/native-capture/novgorod_capture.h" "$source_dir/src/"
