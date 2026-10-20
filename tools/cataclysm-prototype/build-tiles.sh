#!/usr/bin/env bash
set -euo pipefail
source_dir=''
build_dir=''
prefix="$HOME/.local/share/novgorod/sdl3-3.4.10"
sdl_src=''
while (($#)); do
    case "$1" in
        --source) source_dir=${2:?missing source}; shift 2 ;;
        --build-dir) build_dir=${2:?missing build dir}; shift 2 ;;
        --prefix) prefix=${2:?missing prefix}; shift 2 ;;
        --sdl-src) sdl_src=${2:?missing sdl source dir}; shift 2 ;;
        *) printf 'Неизвестный аргумент: %s\n' "$1" >&2; exit 2 ;;
    esac
done
[[ -n $source_dir && -d $source_dir ]] || { echo 'Нужен --source с исходником CDDA.' >&2; exit 2; }
build_dir=${build_dir:-$source_dir/build-tiles}
sdl_src=${sdl_src:-$source_dir/../sdl-src}

# Tags and flags follow CDDA's .github/actions/setup-sdl3-stack; SDL3_mixer is skipped because SOUND is off.
pins=(
    "SDL release-3.4.10 8e37db5e797b6167f3a00d697d816a684bd259c7"
    "SDL_image release-3.4.4 bec9134a26c7d0f31b36d6083c25296e04cabff5"
    "SDL_ttf release-3.2.2 a1ce3670aec736ecbf0936c43f2f0cc53aa61e5b"
)
mkdir -p -- "$sdl_src"
for pin in "${pins[@]}"; do
    read -r name tag commit <<<"$pin"
    dir="$sdl_src/$name"
    [[ -e $dir ]] || git clone --depth 1 --branch "$tag" "https://github.com/libsdl-org/$name.git" "$dir"
    head=$(git -C "$dir" rev-parse HEAD)
    [[ $head == "$commit" ]] || { printf '%s: HEAD %s, ожидался закреплённый %s (%s). Сборка остановлена.\n' "$name" "$head" "$commit" "$tag" >&2; exit 1; }
done

export PKG_CONFIG_PATH="$prefix/lib/pkgconfig:$prefix/lib/x86_64-linux-gnu/pkgconfig"
export CMAKE_PREFIX_PATH="$prefix"
jobs=$(nproc)
build_sdl() {
    local name=$1; shift
    cmake -S "$sdl_src/$name" -B "$sdl_src/$name-build" -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX="$prefix" -DBUILD_SHARED_LIBS=ON "$@"
    cmake --build "$sdl_src/$name-build" -j"$jobs"
    cmake --install "$sdl_src/$name-build"
}
build_sdl SDL -DSDL_DEPS_SHARED=ON -DSDL_AUDIO=ON -DSDL_ALSA=ON -DSDL_ALSA_SHARED=ON -DSDL_DBUS=ON \
    -DSDL_GPU=ON -DSDL_IBUS=ON -DSDL_KMSDRM=ON -DSDL_KMSDRM_SHARED=ON -DSDL_LIBUDEV=ON -DSDL_OPENGL=ON \
    -DSDL_OPENGLES=ON -DSDL_PIPEWIRE=ON -DSDL_PIPEWIRE_SHARED=ON -DSDL_PULSEAUDIO=ON \
    -DSDL_PULSEAUDIO_SHARED=ON -DSDL_RENDER=ON -DSDL_RENDER_GPU=ON -DSDL_RENDER_VULKAN=ON -DSDL_VIDEO=ON \
    -DSDL_VULKAN=ON -DSDL_WAYLAND=ON -DSDL_WAYLAND_SHARED=ON -DSDL_WAYLAND_LIBDECOR=ON \
    -DSDL_WAYLAND_LIBDECOR_SHARED=ON -DSDL_X11=ON -DSDL_X11_SHARED=ON
build_sdl SDL_image -DSDLIMAGE_VENDORED=OFF -DSDLIMAGE_DEPS_SHARED=OFF -DSDLIMAGE_STRICT=ON \
    -DSDLIMAGE_PNG=ON -DSDLIMAGE_PNG_LIBPNG=ON -DSDLIMAGE_JPG=ON -DSDLIMAGE_AVIF=OFF -DSDLIMAGE_JXL=OFF \
    -DSDLIMAGE_TIF=OFF -DSDLIMAGE_WEBP=OFF
build_sdl SDL_ttf -DSDLTTF_VENDORED=OFF -DSDLTTF_STRICT=ON -DSDLTTF_PLUTOSVG=OFF

# With the default USE_PREFIX_DATA_DIR=ON the game looks for translations under /usr/local/share/locale
# instead of lang/mo next to the runtime, so Russian silently falls back to English.
cmake -S "$source_dir" -B "$build_dir" -G Ninja -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_C_COMPILER=clang-19 -DCMAKE_CXX_COMPILER=clang++-19 -DTILES=ON -DSOUND=OFF \
    -DUSE_PREFIX_DATA_DIR=OFF -DTESTS=OFF -DBUILD_TESTING=OFF -DCATA_CCACHE=OFF
cmake --build "$build_dir" --target cataclysm-tiles -j"$jobs"
