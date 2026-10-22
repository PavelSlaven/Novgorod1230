#!/usr/bin/env bash
set -Eeuo pipefail

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(git -C "$script_dir" rev-parse --show-toplevel)
work_root=${CI783_WORK_ROOT:-$(mktemp -d)}
log_dir=${CI783_LOG_DIR:-$work_root/logs}
native=$work_root/upstream
jobs=${CI783_JOBS:-4}
upstream_sha=0d8843f1c500052c3e026e3da6f8edaf5e00b626

if [[ ! $jobs =~ ^[1-9][0-9]*$ ]] || (( jobs > 24 )); then
  printf 'CI783_JOBS должен быть числом от 1 до 24\n' >&2
  exit 2
fi
mkdir -p "$work_root" "$log_dir"
if [[ -e $native ]]; then
  printf 'Каталог upstream уже существует: %s\n' "$native" >&2
  exit 2
fi
test "$(g++-13 -dumpversion | cut -d. -f1)" = 13
test "$(gcc-13 -dumpversion | cut -d. -f1)" = 13

{
  printf 'novgorod_sha=%s\n' "$(git -C "$repo_root" rev-parse HEAD)"
  printf 'upstream_sha=%s\n' "$upstream_sha"
  printf 'compiler=%s\n' "$(g++-13 -dumpfullversion)"
  printf 'build_jobs=%s\n' "$jobs"
} > "$log_dir/identity.txt"

git clone --depth=1 --no-checkout https://github.com/CleverRaven/Cataclysm-DDA.git "$native" > "$log_dir/checkout.log" 2>&1
git -C "$native" fetch --depth=1 origin "$upstream_sha" >> "$log_dir/checkout.log" 2>&1
git -C "$native" checkout --detach "$upstream_sha" >> "$log_dir/checkout.log" 2>&1
test "$(git -C "$native" rev-parse HEAD)" = "$upstream_sha"
du -sb "$native/.git" "$native" > "$log_dir/checkout-size.txt"

bash "$repo_root/tools/cataclysm-prototype/apply-overlays.sh" --source "$native" > "$log_dir/overlays.log" 2>&1

for stem in novgorod_slice_test novgorod_persistence_test novgorod_item_uid_test novgorod_rng_state_test novgorod_preload_probe novgorod_semantic_test novgorod_autosave_test; do
  cp "$repo_root/tools/cataclysm-prototype/$stem.cpp" "$native/tests/$stem.cpp"
  cmp "$repo_root/tools/cataclysm-prototype/$stem.cpp" "$native/tests/$stem.cpp"
done
mkdir -p "$native/data/mods/novgorod_dev_world"
cp -R "$repo_root/tools/cataclysm-prototype/dev-world/." "$native/data/mods/novgorod_dev_world/"
printf 'Скопированы семь родных C++ файлов и dev-world\n' > "$log_dir/staging.log"

if [[ ${CI783_USE_CCACHE:-0} == 1 ]]; then
  command -v ccache >/dev/null
  export CCACHE_DIR=${CI783_CCACHE_DIR:-$HOME/.cache/ccache}
  export CCACHE_MAXSIZE=2G
  export CCACHE_COMPRESS=true
  mkdir -p "$CCACHE_DIR" "$work_root/compiler-wrappers"
  ln -s "$(command -v ccache)" "$work_root/compiler-wrappers/gcc-13"
  ln -s "$(command -v ccache)" "$work_root/compiler-wrappers/g++-13"
  export PATH="$work_root/compiler-wrappers:$PATH"
  ccache -z > "$log_dir/ccache-reset.log"
fi

/usr/bin/time -f 'wall_seconds=%e' -o "$log_dir/build.time" \
  nice -n 10 make -C "$native" -j"$jobs" \
  CC=gcc-13 CXX=g++-13 RELEASE=1 TILES=0 SOUND=0 LOCALIZE=0 BACKTRACE=0 \
  LINTJSON=0 ASTYLE=0 WARNINGS="-Wall -Wextra -Wno-logical-op" tests \
  > "$log_dir/build.log" 2>&1

du -sb "$native" > "$log_dir/native-size.txt"
if [[ ${CI783_USE_CCACHE:-0} == 1 ]]; then
  ccache -s > "$log_dir/ccache-stats.txt"
  du -sb "$CCACHE_DIR" > "$log_dir/ccache-size.txt"
fi

run_tag() {
  local label=$1
  local spec=$2
  local user_dir=$work_root/user-$label
  local status=0
  mkdir "$user_dir"
  (
    cd "$native"
    /usr/bin/time -f 'wall_seconds=%e' -o "$log_dir/$label.time" \
      ./tests/cata_test \
      --rng-seed 17 --mods=novgorod_dev_world --user-dir="$user_dir" \
      --reporter console "$spec"
  ) > "$log_dir/$label.log" 2>&1 || status=$?
  printf '%s\n' "$status" > "$log_dir/$label.exit"
  return "$status"
}

run_tag slice '[novgorod_slice]'
run_tag item_uid '[novgorod_item_uid]'
run_tag rng_state '[novgorod_rng_state]'
run_tag delivery '[novgorod_delivery]'
run_tag autosave_option '[novgorod_autosave][option]'
run_tag autosave_slow '[novgorod_autosave][slow]'

mkdir "$work_root/user-live-list"
list_status=0
(
  cd "$native"
  ./tests/cata_test --rng-seed 17 --mods=novgorod_dev_world \
    --user-dir="$work_root/user-live-list" --list-test-names-only '[novgorod_live]'
) > "$log_dir/live-tests.txt" 2>&1 || list_status=$?
if [[ $list_status != 0 && $list_status != 1 ]]; then
  exit "$list_status"
fi

live_status=0
run_tag live '[novgorod_live]' || live_status=$?

python3 "$repo_root/tools/cataclysm-prototype/native_live_baseline.py" "$log_dir/live.log" "$log_dir/live-tests.txt" "$live_status" "$log_dir/live-summary.md"
