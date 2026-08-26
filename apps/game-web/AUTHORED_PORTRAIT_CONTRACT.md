# Authored Portrait Contract

## Scope

`panels.people.data.active_interlocutor.portrait_asset_id` is an optional
player-safe presentation selector. Its DTO contract is any non-empty string;
unknown non-empty values remain accepted so historical and future server
responses stay displayable. It does not grant identity, visibility, equipment,
knowledge, or any factual claim.

## Browser selection

Only these browser-owned IDs select authored static art:

- `lower-dvina-mikula`
- `lower-dvina-onisim`
- `lower-dvina-eremey`
- `lower-dvina-ratsha`
- `lower-dvina-zhdanko`
- `lower-dvina-fisher-1`
- `lower-dvina-fisher-2`

For a known ID, browser maps it to its fixed `/assets/portrait/lower-dvina/`
folder and loads `outfit.png` plus `heads/<emotion>.png`. Emotion is read only
from an already valid optional `portrait_spec_v1`; absent or unknown emotion
uses `neutral`.

## Fallback and compositing

Selection order is: known authored portrait; valid procedural
`portrait_spec_v1`; SVG fallback. Failure to load either authored layer takes
the complete procedural/SVG fallback, never a partial portrait. Outfit draws
first, then head; player-safe landscape lighting may tint both after drawing.
No pixel, asset ID, visual style, or fallback outcome may be interpreted as
world truth or sent back to server.

## Async safety

Portrait loading shares root hydration's generation token. A stale request
does not clear or draw a later screen. Portrait layer runs after landscape and
before foreground weather; assets are static server-served `/assets/` files
only.
