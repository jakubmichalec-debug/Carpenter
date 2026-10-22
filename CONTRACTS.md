# Contracts

Every module in the site builds against these shapes. Change them only by editing this file first.

## Units and coordinates
- All lengths in the design model are **centimetres** (integers, snapped to 1 cm).
- 3D scene uses **metres** (`cm / 100`). Origin: floor level, left end of the back wall, at the wall surface. +X runs right along the wall, +Y up, +Z out of the wall into the room.
- Money is **EUR**, stored as numbers, rounded to cents only for display.

## Design model (`site/js/configurator/model.js`, pure, no DOM)
```js
design = {
  v: 1,
  room: {
    width: 420,          // back wall length, 200..900
    height: 260,         // ceiling height, 220..400
    depth: 380,          // floor depth shown in 3D, 250..800
    floor: 'oak-floor',  // id in FLOORS
    wall: 'chalk',       // id in WALL_COLORS
    openings: [          // on the back wall
      { id: 'o1', type: 'window', x: 260, y: 90, w: 120, h: 130 }   // x,y = bottom-left corner
    ]
  },
  modules: [
    {
      id: 'm1',
      type: 'wardrobe',  // key of MODULE_TYPES
      x: 0,              // cm from left end of wall to module's left side
      width: 200, height: 240, depth: 60,
      elevation: 0,      // cm off the floor (wall cabinets use >0)
      sections: 2,       // vertical bays, 1..8
      doors: 'hinged',   // 'hinged' | 'sliding' | 'open' | 'glass' | 'none'
      drawers: 2,        // drawer count (spread across bays per type rules), 0..12
      interior: 'shelves', // 'shelves' | 'rail' | 'mixed' | 'shoe'
      handle: 'bar',     // 'bar' | 'knob' | 'push' | 'groove'
      plinth: true,
      led: false,
      body: 'birch-ply', // id in MATERIALS
      front: 'oak',      // id in MATERIALS
      worktop: null      // id in MATERIALS, only kitchen-base / island / desk / table / bench
    }
  ]
}
```

Exports:
- `MODULE_TYPES`: `{ [type]: { label, icon, defaults: {...module fields}, limits: { width:[min,max], height:[min,max], depth:[min,max], elevation:[min,max] }, allowed: { doors:[...], interior:[...], worktop:boolean }, freestanding: boolean } }`. The types are `wardrobe`, `kitchen-base`, `kitchen-wall`, `tall-cabinet`, `island`, `shelving`, `desk`, `table`, `bench`, `window-seat`. Freestanding types (`island`, `table`) are placed in the room at `z` instead of against the wall. They add a field `z` (cm from the wall to the module's back edge).
- `MATERIALS`: `{ [id]: { label, kind: 'wood'|'ply'|'lacquer'|'stone', color: '#hex', roughness, metalness, pricePerM2, grain: boolean } }`. At least: oak, walnut, ash, birch-ply, lacquer-white, lacquer-sage, lacquer-charcoal, lacquer-clay, terrazzo (worktop), steel-black (handles only, so leave it out of the pickers).
- `FLOORS` and `WALL_COLORS`: small `{id: {label, color}}` maps.
- `createDesign()` returns a fresh default design: a 420 cm room, one window, a wardrobe on the left and a desk.
- `createModule(type, overrides?)` returns a module with a new unique `id`, the type's defaults and the overrides, clamped.
- `clampModule(module, room)` returns a copy with every field within its limits and allowed values, snapped to integer cm, and kept inside the wall (`0 <= x`, `x + width <= room.width`, `elevation + height <= room.height`).
- `addModule(design, type, overrides?)` returns a new design. It places the module in the first free gap on the wall that is wide enough, or at `x = 0` if there is none. It never mutates its input.
- `updateModule(design, id, patch)`, `removeModule(design, id)`, `moveModule(design, id, x)`. `moveModule` snaps to neighbours' edges within 5 cm.
- `updateRoom(design, patch)` clamps the room, then re-clamps every module.
- `findCollisions(design)` returns `[[idA, idB], ...]` for wall modules whose x-ranges overlap and whose vertical ranges overlap.
- `validate(design)` returns `{ ok, errors: [{ moduleId?, code, message }] }`. Codes: `overlap`, `blocks-opening` (a module covers a window or door), `too-tall`.
- `cloneDesign(d)`.

## Pricing (`site/js/configurator/pricing.js`, pure)
- `PRICES`: one table with `labourPerHour: 58`, `installPerModule: 120`, `hingePair: 18`, `drawerRunner: 46`, `slidingTrack: 140` (per metre), `handle: { bar: 14, knob: 9, push: 22, groove: 0 }`, `ledPerMetre: 38`, `glassPerM2: 95`, `hanging rail` (`rail: 24`), `plinthPerMetre: 22`, `designFee: 250`, `vat: 0.21`, and per-type labour hours (`labourHours: {wardrobe: 10, ...}`).
- `panelsFor(module)` returns the cut list for one module: `[{ part: 'side'|'top'|'bottom'|'back'|'shelf'|'divider'|'door'|'drawer-front'|'worktop'|'plinth'|'leg', w, h, t, qty, material }]` in cm. Body panels use `module.body`, fronts use `module.front`, the worktop uses `module.worktop`.
- `quoteDesign(design, { vat = true } = {})` returns
  ```js
  { modules: [{ id, type, label, boardM2, materials: number, hardware: number, labour: number, install: number, total }],
    lines: [{ label, amount }],           // aggregated: Materials, Hardware, Workshop labour, Installation, Design fee
    subtotal, vat, total,
    cutList: [{ material, part, w, h, t, qty }],   // merged across modules, sorted by material
    boardM2ByMaterial: { [materialId]: m2 },
    leadTimeWeeks }                        // 4 + ceil(total labour hours / 40)
  ```

## Share (`site/js/configurator/share.js`, pure)
- `encodeDesign(design)` returns a URL-safe string (compact JSON → base64url). `decodeDesign(str)` returns a design that has been passed through the model's clamps, or `null` on any error.
- `saveLocal(design)` and `loadLocal()` wrap localStorage under the key `gj.design.v1` in try/catch.

## 3D (`site/js/configurator/geometry.js` + `scene.js`, browser)
- `buildModule(module, THREE, materialLib)` returns a `THREE.Group` named `module.id`, with `userData.moduleId`. Doors are child groups with `userData.door = { hinge: 'left'|'right'|'slide', open: 0..1 }` so they can be animated. Every panel mesh has `userData.part` and `userData.explode` (a Vector3 offset direction for the exploded view).
- `createMaterialLib(THREE)` builds and caches `MeshStandardMaterial`s per `MATERIALS` id. Wood grain is a procedural `CanvasTexture`, so no image downloads are needed.
- `scene.js` exports `createConfiguratorScene(canvas, { quality })` returning `{ setDesign(design), select(id), onSelect(cb), setView('front'|'top'|'free'), setExplode(0..1), setDoors(0..1), setLighting('day'|'night'), screenshot(): dataURL, dispose() }`.

## Events between pages
- The configurator's "Request a quote" link goes to `contact.html#design=<encoded>`. Contact decodes it and prefills a summary.
- The Projects page's presets link to `configurator.html#design=<encoded>`.

## Design tokens (`site/css/base.css`)
Use the CSS custom properties only, never raw hex values, in page CSS.

## Planner v2 (`site/js/planner/`)
Design: `docs/PLANNER.md`. All four logic modules are pure (no DOM, no Three.js) and run in Node 22 and the browser. Lengths are cm. Plan coordinates: x right, z down, so a clockwise outline has a positive shoelace area. Money is EUR, computed in integer cents.

### Project shape (`model.js`)
```js
project = {
  v: 2,
  room: {
    walls: [{ id: 'w1', x: 0, z: 0 }, ...],  // 3..24 corners, clockwise. Corner i starts wall i, which ends at corner i+1 (wraps). Ids are 'w' + (index + 1)
    height: 260,                              // 220..400; for an attic this is the ridge
    slope: null,                              // or { wallId, lowHeight, depth }: ceiling is lowHeight at that wall, rises linearly to `height` over `depth` cm
    openings: [{ id: 'o1', wallId: 'w1', type: 'door'|'window'|'radiator'|'socket', offset, bottom, width, height,
                 swing?: 'in-left'|'in-right'|'out-left'|'out-right' /* door; left = hinge nearer the wall's start, seen from the room */,
                 depth?: 10 /* radiator */, flagged?: true /* a template change could not keep it where it was */ }],
    floor: 'oak-floor', wall: 'chalk', skirting: 7,
    template: { id: 'rect'|'l-shape'|'alcoves'|'attic'|'hallway'|'bay', params: {...} } | null
  },
  pieces: [{ id: 'p1', type, style, width, height, depth,
             carcass: { material }, fronts: { kind: 'hinged'|'sliding'|'open'|'glass'|'none', material, handle, grainVertical },
             plinth: 10 /* cm, 0 = none */, worktop: null | materialId, radiatorCutout: false,
             bays: [{ width, door: 'left'|'right'|'double'|'none', items: [{ kind, y, ...params }] }] }],
  placements: [{ pieceId, mode: 'wall', wallId, offset, elevation } | { pieceId, mode: 'free', x, z, rotation, elevation }]
}
```
* Bay widths are clear widths: `sum(bay.width) = width - 2*LAYOUT_T - (bays-1)*LAYOUT_T` with `LAYOUT_T = 2` (18 mm board, 2 cm layout module). Inner height = height - plinth - slab - 2*LAYOUT_T (`pieceGeometry`).
* Item `y` is cm from the bay floor to the item's reference line (shelf: its underside; drawers: bottom of the stack; rail: the rail tube). It is snapped to the 32 mm system: multiples of 3.2 cm, rounded to 0.1.
* Wall placement: the piece's back sits on the wall; `offset` runs along the wall from its start corner; the piece faces the wall's inward normal. Free placement: `x, z` is the footprint centre, `rotation` in degrees; rotation 0 faces +z (the same as a piece on a top wall), local width axis is `(cos r, sin r)`.
* Room templates (all corners clockwise from the top-left): `rect {width, depth}` 4 walls; `l-shape {lengthA, widthA, lengthB, widthB}` 6 walls (top bar lengthA x widthA, left arm widthB x lengthB, notch bottom right); `alcoves {width, depth, breastWidth, breastDepth, breastOffset}` 8 walls, chimney breast stepping into the room from the top side, `breastOffset` from the left; `attic {width, depth, kneeHeight, slopeAngle, slopeWall}` 4 walls and `slope` set, `slopeWall` is 1..4; `hallway {length, width}` 4 walls with end doors; `bay {width, depth, bayWidth, bayDepth}` 8 walls, a 3-sided 45 degree bay on the top side (the room body starts at z = bayDepth).

### Exports of `model.js`
* Constants: `LAYOUT_T`, `GRID` (3.2), `FRONT_KINDS`, `DOOR_SIDES`, `OPENING_TYPES`, `LIMITS`, `TYPES`, `STYLES`, `ITEMS`, `PRESETS`, `TEMPLATES`, `TEMPLATE_PARAMS`, and `MATERIALS`, `FLOORS`, `WALL_COLORS`, `HANDLES` re-exported from the configurator model.
* `TYPES[type] = { label, icon, freestanding, defaultStyle, defaults: { width, height, depth, elevation, plinth, worktop, fronts, bays }, limits: { width, height, depth, elevation, bays }, allowedFronts, allowPlinth, allowWorktop, palette: [item kinds] }`. Types: `wardrobe, kitchen-base, kitchen-wall, tall-cabinet, wall-unit, desk, table, window-seat, under-stairs, island`.
* `STYLES[id] = { label, fronts: { kind, material, handle, grainVertical }, carcass, plinth, worktop }`.
* `ITEMS[kind] = { label, params: { name: { type: 'int'|'enum'|'bool', min, max, values, default } }, body(item) -> [lo, hi], zone(item) -> [lo, hi] | null, needsDoor(item), minBay: { width, height }, minDepth, hardware(item, ctx) -> [{ key, qty }], boards(item, ctx) -> [{ part, w, h, t, qty, use: 'body'|'front' }], minutes }`. `body` is the physical extent and `zone` the space the item claims, both in cm relative to `y`. Two zones may not overlap; a zone may not reach below the bay floor (hanging space); a body may not leave the bay.
* `TEMPLATE_PARAMS[id][name] = { label, min, max, default }`; `clampTemplateParams(id, params)`; `roomFromTemplate(id, params, base?)` returns a room (`base` may carry `height, floor, wall, skirting, openings`); it throws on an unknown id.
* Room helpers: `wallsOf(room) -> [{ id, index, start, end, length, angle, dir, normal }]` (normal points into the room), `perimeter(room)`, `area(room)`, `wallById(room, id)`, `ceilingHeightAt(room, x, z)`, `footprintOf(project, placement) -> { corners, cx, cz, rotation, wall? } | null`.
* Also exported: `MIN_BAY` (20), `SWINGS`, `clampPiece(raw)`, `clampRoom(raw)`, `clampTemplateParams`, `maxBaysFor(type, width)`, `signedArea(room)`, `itemBody(item)`, `itemZone(item)`, `visibleFrontHeight(items)` (drawer fronts a door is cut around).
* Piece helpers: `pieceGeometry(piece, bays?) -> { slab, plinth, Hc, innerH, innerW, outerBayW }`, `normalizeItem(item, { bayWidth, innerH })`, `describeItem(item)`, `presetsFor(type)`, `snapY`, `snapUp`, `snapDown`, `pieceLabel(project, pieceId)`.
* Pure edits (each returns a new project, never mutates, and never throws on unknown ids; it returns the project unchanged): `createProject()`, `createPiece(type, style, overrides)`, `updateRoom(p, patch)`, `setTemplate(p, id, params)`, `addOpening(p, opening)`, `updateOpening(p, id, patch)`, `removeOpening(p, id)`, `addPiece(p, type, style, overrides)`, `updatePiece(p, id, patch)`, `removePiece(p, id)` (also removes its placement), `setBays(p, id, countOrWidths)`, `addItem(p, pieceId, bay, item)`, `moveItem(p, pieceId, bay, index, { y?, bay? })`, `updateItem(p, pieceId, bay, index, patch)`, `removeItem(p, pieceId, bay, index)`, `applyPreset(p, pieceId, bay, presetId)`, `placePiece(p, pieceId, spec)`, `movePlacement(p, pieceId, patch)`, `unplace(p, pieceId)`.
* `setTemplate` keeps each opening on the wall with the same index and the same offset if it still fits; otherwise it keeps the opening and sets `flagged: true` (validation then reports `opening-off-wall`). Nothing is deleted silently.
* Snapping: item `y` to the 32 mm system; wall placement to the wall's ends and to neighbouring pieces on the same wall (vertical ranges overlapping) within 5 cm; free rotation to a multiple of 90 within 5 degrees.
* `clampProject(raw)` returns a valid project from any object (ranges, ids, snapping; relations such as "opening fits on its wall" are left to validation). `migrate(v1Design)` converts a v1 design (`site/js/configurator/model.js`) to a v2 project. `cloneProject(p)`.

### `validate.js`
`validateProject(project) -> { ok, errors, blocking, warnings }`. `errors: [{ code, message, ref, blocking }]`; `ok` is true when no error has `blocking: true`; `blocking` / `warnings` are the filtered lists. `ref` is `{ type: 'room' } | { type: 'opening', id } | { type: 'piece', id } | { type: 'bay', pieceId, bay } | { type: 'item', pieceId, bay, index } | { type: 'placement', pieceId }`. It never throws.

| code | blocking | meaning |
|---|---|---|
| `room-too-few-walls`, `room-wall-degenerate`, `room-not-clockwise`, `room-self-intersects` | yes | outline problems |
| `opening-off-wall`, `opening-overlap`, `opening-too-tall`, `opening-above-ceiling` | yes | opening does not fit (`opening-above-ceiling`: taller than the sloping ceiling along its width) |
| `piece-type-unknown`, `piece-size`, `bays-count`, `bays-width` | yes | piece shape |
| `item-unknown`, `item-outside-bay`, `item-clearance`, `item-needs-door` | yes | interior |
| `item-not-allowed`, `item-off-grid` | no | interior advice |
| `placement-unknown-piece`, `placement-wall-missing`, `placement-off-wall`, `wall-too-short`, `placement-outside-room`, `placement-overlap`, `placement-covers-opening`, `placement-door-swing`, `placement-under-slope`, `placement-too-tall` | yes | placement |
| `walkway`, `piece-unplaced` | no | advice (a free piece leaves less than 60 cm to walk past; a piece is not placed yet). Sockets under a piece are a non-blocking `placement-covers-opening` |

### `pricing.js`
`PRICES_V2` (new item prices, hardware table, labour) on top of the configurator `PRICES`. `cutListFor(piece) -> [{ part, w, h, t, qty, material, ref }]`.
`quoteProject(project, { vat = true } = {})` returns
```js
{ pieces: [{ id, label, lines: [{ ref, label, path, group, qty, unit, amount, cents }], items: [{ ref, label, path, amount, cents }], total, cents }],
  lines: [{ label, amount, cents }],   // Materials, Hardware, Workshop labour, Fitting, Design fee
  subtotal, vat, total, cents: { subtotal, vat, total },
  cutList, boardM2ByMaterial, leadTimeWeeks,   // 4 + ceil(workshop hours / 40)
  unplaced: [pieceId] }
```
`group` is one of Materials, Hardware, Workshop labour, Fitting. A line `ref` is `{ pieceId, part?, bay?, item? }`. `path` reads "Wardrobe 1 > Bay 2 > 3 drawers". Every amount is `cents / 100`, and all sums are taken on the integer cents, so `sum(piece lines) = piece total`, `sum(lines) = subtotal` and `subtotal + vat = total` exactly. Fitting is charged only for placed pieces.

### `share.js`
`async encodeProject(project) -> string`: compact JSON (the room's walls are left out when the template regenerates them), deflate-raw through `CompressionStream`, base64url. The first character says which: `z` deflated, `u` plain base64url JSON (no `CompressionStream`). `async decodeProject(str) -> project | null`: accepts `#p=...`, `p=...` or the bare string; a `#design=...` string or a bare string starting with `e` is an old v1 link and goes through `configurator/share.js` `decodeDesign` and `migrate`; the result is passed through `clampProject`; any error gives `null`. `saveLocal(project)` / `loadLocal()` use the key `gj.project.v2` (plain JSON, synchronous, try/catch).

### `store.js` (pure reducer, plus a thin store)
State: `{ project, past[], future[], key, keyAt, ui }`. `ui = { step: 0..4, wallId, openingId|null, pane: 'plan'|'wall'|'3d', notice?: { id, text } }`. UI state is never part of undo, saving or sharing; `wallId` and `openingId` are cleaned up whenever the room changes.
* `reduce(state, action)` is pure. `createStore(project, { persist, delay = 400, now, save, setHash }) -> { getState, dispatch, subscribe(fn(state, before, action)) -> unsubscribe, flush(), lastHash }`. `dispatch` stamps `action.at` (ms). With `persist`, a project change schedules one save to `saveLocal` and one `history.replaceState(#p=...)`, both after `delay`. `loadInitialProject({ hash, load })` reads `#p=` first, then local storage, then `createProject()`.
* History: at most `HISTORY_LIMIT` (100) steps. An action with a `coalesce` key joins the previous undo step when the previous action had the same key and is less than `COALESCE_MS` (1200) older; `history/seal` ends a run. Actions that change nothing add no history.
* Actions. Project: `room/template { id, params? }`, `room/params { params }` (merged into the current template), `room/update { patch: { height, floor, wall, skirting } }`, `room/opening/add { opening: { type, wallId?, offset?, ... } }`, `room/opening/update { id, patch }` (an empty patch re-fits an opening), `room/opening/move { id, wallId? }`, `room/opening/remove { id }`. History: `history/undo`, `history/redo`, `history/seal`. Other: `project/load { project }` (clamped, history reset), `ui/step { step }`, `ui/wall { wallId }`, `ui/opening { id|null }`, `ui/pane { pane }`.
* Adding an opening without an `offset` centres it in the largest free gap on the wall (openings that share no height band with it are ignored, so a socket may sit under a window). If no gap is wide enough the project is unchanged and `ui.notice = { id (increments), text: 'No room on this wall for a 120 cm window.' }`. `freeOffset(room, wall, spec, width, skipId)` is exported.
* After `room/template` and `room/params`, every opening that no longer fits (flagged, off its wall or on a wall that is gone) is re-homed: first a free spot on its own wall, then on the longest other walls. A spot must be free and the opening must fit under the ceiling profile along its full width (so not on an attic knee wall unless it is low enough); full-height walls are preferred. Only if nothing fits does it stay flagged, and validation reports it.

### `plan-geom.js` (pure)
`WALL_T` = 10 (cm, walls grow outward from the room outline). `cornerOffsets(room, t)` gives the outward mitre vector per corner; `wallQuads(room, t) -> [{ id, index, wall, inner: [p, p], outer: [p, p], shift: [u0, u1] }]`; `wallPoint(wall, u, v)` (u along the wall from its start, v into the room); `ceilingProfile(room, wall) -> [[u, height], ...]` (bent by an attic slope); `minCeiling(profile, u0, u1)`; `roomBounds(room)`; `PLAN_HANDLES[templateId] -> [{ param, wall (0-based index), axis: 'x'|'z', sign, factor? }]`; `snapTo(v, step)`.

### `geometry.js` (browser, THREE passed in)
Scene units are metres. Each wall is a `Group` in wall space (x along the wall, y up, z into the room, inner face at z = 0, body at z in [-0.1, 0]); the walls are mitred, with real holes for windows and notches for doors. `buildFloor(room, THREE, lib) -> Mesh`, `buildWall(room, index, THREE, lib) -> Group` (`userData: { wallId, index, body, face, edge, materials }`; holds window frames and glass, a door leaf standing ajar, a radiator, sockets, skirting, and for an attic's slope wall a plane from the knee wall up to the ridge that is visible only from below), `buildRoom(room, THREE, lib) -> Group` (floor and walls; no ceiling), `floorSignature(room)`, `wallSignature(room, index)` (rebuild a part only when its signature changes), `disposeGroup(g)`, `setWallFade(group, 0..1)`, `setWallHighlight(group, color, on)`. The end walls of an attic follow `ceilingProfile`, so they have a gable shape.

### `viewer.js` (browser)
`createViewer(canvas, { onWallPick(wallId) }) -> { setProject(project), focusWall(id), highlightWall(id|null), setView('3d'|'plan'), getView(), onViewChange(cb), resetView(), resize(), stats: { frames, requests }, idle, debug, dispose() }`. It renders only on demand (no endless rAF); `stats.frames` counts renders. Walls whose outer face is toward the camera fade out. `setView('plan')` is a top-down orthographic camera; the page calls it from a "Top view" button.
