# Authored Landscape Contract

## Scope

`scene_asset_id` is an optional top-level player-safe presentation selector.
It selects a static authored Lower Dvina landscape only. It is not location
truth, a visibility fact, a write request, or a reverse input into server or
world state.

## Closed web allowlist

Game-web accepts exactly these values:

- `lower-dvina-old-drying-shed-interior`
- `lower-dvina-old-drying-shed-exterior`
- `lower-dvina-wreck-shore`
- `lower-dvina-zhdanko-storehouse-interior`
- `lower-dvina-fishing-camp-firepit`
- `lower-dvina-zhdanko-river-descent`
- `lower-dvina-fishing-camp`
- `lower-dvina-zhdanko-storehouse-exterior`

The public web validator rejects an unknown `scene_asset_id`. A missing selector
continues through generic-environment selection and then the existing
procedural landscape. The renderer itself also fails closed to procedural when
called directly with an unknown selector. Client must not derive an authored ID
from prose, labels, location refs, node IDs, weather, or another visible field.

## Generic catalogue

Generic asset selection accepts exactly these normalized environment-profile
mappings:

- `env.local_variable` / `open_meadow` → `open_meadow`
- `env.main_river_channel` / `main_river` → `main_river`
- `env.side_channel` → `side_channel`
- `env.land_path` → `field_road`
- `env.forest_track` → `forest_road`
- `env.wetland` → `wetland`
- `env.offroad` → `offroad`
- `env.shore_transition` → `shore_transition`

For every generic scene, available asset states are the six day parts
`dawn`, `morning`, `day`, `evening`, `dusk`, `night` crossed with six weather
values `clear`, `cloudy`, `overcast`, `rain`, `snow`, `fog`, named
`dayPart-weather.webp`. Missing day or weather defaults to `day` or `clear`
only for asset selection. An unknown environment profile has no generic asset
and uses procedural landscape.

## Rendering

For an allowed selector, static asset path is determined solely by its mapped
folder and current player-safe day/weather state. Interior assets use only
`natural` or `dark`; exterior assets use the existing day-weather state. Asset
load/draw failure falls back to procedural landscape. Weather foreground draws
only after selected landscape; it is omitted for interior authored art.

`scene_asset_id` does not change terrain mechanics, topology, routes,
visibility, narration, or persistence. Authored art is approximate presentation,
never evidence from which any world fact may be recovered.

## Async safety

Each root hydration receives a monotonically increasing generation token. An
async landscape result may draw only while its token remains current. Render
layer order is landscape, conversation portrait, then foreground weather.
Only server-served static `/assets/` paths are requested.
