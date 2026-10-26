# Contracts

Every module in the site builds against these shapes. Change them only by editing this file first.

## Units and coordinates
- All lengths in the design model are **centimetres** (integers, snapped to 1 cm).
- 3D scene uses **metres** (`cm / 100`). Origin: floor level, left end of the back wall, at the wall surface. +X runs right along the wall, +Y up, +Z out of the wall into the room.
- Money is **EUR**, stored as numbers, rounded to cents only for display.

## Design model (`site/js/configurator/model.js`, pure, no DOM)
*Legacy.* This is the v1 design of the old single-screen configurator, which the planner replaced. It stays for the stock tables the Materials page reads and for old `#design=` links, which `planner/model.js` `migrate()` turns into pieces (the room is dropped). The planner's own contract is "Planner v2" below.
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
- The configurator's link goes to `planner.html#design=<encoded>`. `contact.html` has no form any more: `contact.html#design=` and `contact.html#p=` forward to `planner.html` with the same hash.
- The Projects page's presets link to `configurator.html#design=<encoded>`.

## Design tokens (`site/css/base.css`)
Use the CSS custom properties only, never raw hex values, in page CSS.

## Planner v2 (`site/js/planner/`)
Design: `docs/PLANNER.md`. The planner designs **furniture only**: it knows pieces, not rooms. All logic modules are pure (no DOM, no Three.js) and run in Node 22 and the browser. Lengths are cm. Money is EUR, computed in integer cents. The 3D scene uses metres and a neutral studio (see `studio.js`).

### Project shape (`model.js`)
```js
project = {
  v: 2,
  pieces: [{ id: 'p1', type, style, width, height, depth,
             elevation,                           // cm off the floor; wall units hang, everything else 0
             carcass: { material, finish }, interior: null | { material, finish },
             fronts: { kind: 'hinged'|'sliding'|'open'|'glass'|'none', material, finish, handle, grainVertical, ... },
             look: { design, edge, base, top, gables, gap, scribe, upper, split, ... },
             plinth: 10 /* cm, 0 = none */, worktop: null | materialId,
             space?: { width: number|null, height: number|null },   // the wall width and ceiling height the person has (cm)
             bays: [{ width, door: 'left'|'right'|'double'|'none', items: [{ kind, y, ...params }] }] }]
}
```
* **No room, no placements.** `clampProject` keeps only `v` and `pieces`; a `room` and `placements` in an older save or share link are ignored. The one thing it takes from a placement is its `elevation`, so a wall unit that hung at 150 cm still hangs there. A `radiatorCutout` flag on an old piece is dropped.
* `space` (optional; absent when empty) is a plain constraint, not geometry: it is never drawn and never priced. `clampSpace(raw)` clamps each side to `LIMITS.space` (width 40..1500, height 60..500) and returns `null` when both are empty. Set it with `updatePiece(p, id, { space })` (`null` clears it).
* Bay widths are clear widths: `sum(bay.width) = width - 2*LAYOUT_T - (bays-1)*LAYOUT_T` with `LAYOUT_T = 2` (18 mm board, 2 cm layout module). Inner height = height - plinth - slab - 2*LAYOUT_T (`pieceGeometry`).
* Item `y` is cm from the bay floor to the item's reference line (shelf: its underside; drawers: bottom of the stack; rail: the rail tube). It is snapped to the 32 mm system: multiples of 3.2 cm, rounded to 0.1.

### The look of a piece (furniture depth)
Everything below is in `model.js` and `materials.js` and is pure. Every field is optional on input: `clampPiece` fills a missing or unknown value from the piece's style, so projects, local saves and share links made before these fields existed load with the look they had.
```js
piece = { ..., elevation,                      // cm off the floor, within the type's limits: a wall unit hangs there
  carcass:  { material, finish },              // sides, top, bottom (outer faces)
  interior: null | { material, finish },       // back, dividers, shelves, drawer boxes, inner faces. null = same as carcass; material 'front' = same as fronts
  fronts:   { kind, material, finish, handle, grainVertical,
              handleFinish, handleSize: 'short'|'medium'|'long',
              doorHandle: 'auto'|'top'|'middle'|'bottom'|'full', drawerHandle: 'centre'|'top' },
  look: { design: 'slab'|'shaker'|'glass'|'ribbed', edge: 'square'|'chamfer'|'round',
          glass: materialId /* use 'glass' */, base: 'none'|'recessed'|'flush'|'legs', legs: 'wood'|handleFinishId,
          top: 'flush'|'overhang'|'cornice', gables: bool /* outer side faces in the front material */,
          gap: 2|3|4 /* mm between fronts */, scribe: bool /* filler strips at the ceiling and the sides */,
          upper: null | { material, finish } /* two-tone: fronts above `split` */, split: cm from the floor },
  plinth: 0..30 /* height of the base: plinth or legs; 0 = no base, and base 'none' <=> plinth 0 */, worktop }
```
* `fronts.kind 'glass'` and `look.design 'glass'` always go together (`clampPiece` enforces it; `updatePiece` keeps them in step). `HANDLES = bar, knob, cup, edge (routed finger pull), push`; `DESIGNS = slab, shaker, glass, ribbed`. Older values map on: handle `groove` -> `edge`, `long-bar` and `leather` -> `bar`; design `fluted` and `vgroove` -> `ribbed`, `cane` -> `shaker`.
* `pieceGeometry` also returns `cap` (cm of height taken by the top treatment: overhang 2.5, cornice 5, only for types with `allowTop`); `Hc = height - plinth - slab - cap`. `legCount(width)` is 4, 6 or 8.
* `surfacesOf(piece) -> { front, carcass, interior, upper }` resolves which surface each part uses; `roleSegments(lo, hi, piece)` splits a stretch of front at the two-tone split into `front` / `upper` parts (separate doors, a gap apart). `defaultElevation(piece)`, `defaultSplit(height, plinth)`, `SIZE_PRESETS[type]` (also `TYPES[type].sizePresets`), `TYPES[type].allowTop`.
* `styleBundle(type, styleId)` gives a complete look for a type; ids that are not in the material table fall back, so a style survives a change of stock. `STYLES[id] = { label, blurb, legacy?, fronts, carcass, carcassFinish, interior, plinth, worktop, look }`; `legacy` styles keep working but are shown only on a piece that already uses one. `updatePiece(p, id, { style })` replaces the whole look with the style's; a patch may carry `look`, `fronts`, `carcass`, `interior` (null clears it).
* `fit.js` (pure): `spaceCheck(piece) -> { has, fits, tooWide, tooTall, overWidth, overHeight, space }` (a piece fits when its width is at most the space width and `elevation + height` is at most the space height; either side may be empty), `fitToSpace(piece) -> { width, height, changed, exact } | null` (the width fills the wall, the height is the ceiling minus the elevation and a little air, 0.5 cm, or 1.5 cm with scribe strips; both held to the type's limits, `exact: false` when a limit won), `spaceMessage(piece)` ("This piece is 20 cm too wide and 10 cm too tall for your space."), `headroom(piece)`.

### `materials.js` (pure): the stock range
One table, `LIBRARY` (= `MATERIALS`), read by the pickers, the live 3D, the path tracer and the pricing. Swap the table to change the range; nothing else changes. Each entry: `label, family, kind, color, roughness, metalness, grain, grainStyle?, tex?, edgeGrain?, veined?, pricePerM2, finishes[], satinPlus, uses[] ('front'|'carcass'|'interior'|'top'|'glass'|'handle'), thickness?, factor? (handles), note`. Helpers: `materialsFor(use)`, `familiesFor(use)`, `isUsable(id, use)`, `resolveMaterial(id, use, ...prefer)`, `cleanSurface(raw, use, fallback)`, `pricePerM2(surface)`, `thicknessOf(id)`, `resolveHandleFinish(id)`, `glassTypes()`, `canonicalId(id)`. `ALIASES` maps ids of earlier ranges to today's (`lacquer-white` -> `chalk-white`, `lacquer-sage` -> `sage`, `lacquer-charcoal` -> `black`, `lacquer-clay` -> `clay`, `terrazzo` -> `quartz-white`, `steel-black` -> `handle-black`); any other id that is not on offer falls back to the style's. The range today: 8 paints, 4 wood veneers, birch plywood, 2 laminates, 4 worktops, 2 glass types, 4 handle finishes; paints and veneers come in one finish.

### Interior depth
Driven by `docs/INTERIOR-RESEARCH.md`. Everything is pure and lives in `model.js` and `materials.js`. Old projects, saves and share links keep loading: removed kinds map to their replacements in `normalizeItem` and `clampPiece` (tests in `tests/planner-interior-depth.test.mjs` with `tests/fixtures/pre-interior-link.txt`).
* **Catalogue (`ITEMS`)**: `shelf` (material body or glass), `rail` (length `long` 150 cm or `short` 95 cm; finish `chrome|nickel|black|white`), `pull-down-rail`, `drawers`, `inner-drawers`, `jewellery`, `tray` (pull-out tray / valet tray), `shoes` (rows, angled, `lip`), `shoe-pullout`, `trouser-rack`, `tie-belt`, `valet-rod` (finish), `basket`, `hamper`, `mirror` (mode `fixed|swivel|pull-out`), `divider`, `hooks`, `led` (tone, `trigger: always|door|motion`); kitchen `cutlery-insert`, `pan-drawer`, `bin-pullout`, `spice` (narrow pull-out, 2 to 5 tiers), `larder` (pull-out larder, 3 to 6 wire baskets, 35 cm each, tall cabinet only), `carousel` (shape `round|kidney`); desk and wall unit `cable-tray`, `keyboard-drawer`, `book-shelf`, `media-niche`.
* **Drawers**: `size` is `low|medium|deep` = 19.2, 28.8, 38.4 cm (6, 9 and 12 holes of the 32 mm system, `DRAWER_SIZES`); the item also carries `front` (the height in cm, derived from `size`; an old numeric `front` becomes the nearest size). `face` (`drawers` only) is `same` as the doors, `wood` (plain oak) or `glass` (slim frame with glass). `insert` (`drawers`, `inner-drawers`) is `none|cutlery|socks|jewellery`. `lining` (`grey|sand|charcoal`, from the table's `lining-*` entries) applies to jewellery drawers, trays with a felt insert and any drawer with an insert; old `black` and `navy` become `charcoal`. A parameter that only matters sometimes is listed in `ITEMS[kind].when[name](item)`; the inspector hides it otherwise.
* **Mapped kinds**: `rail-long` and `rail-short` become `rail`; `double-hang` becomes two short rails (bay-level, `expandLegacyItems`); `divided-drawer` becomes `drawers` with `insert: 'socks'`; `cubbies` become shelves and vertical dividers; `ironing` becomes a shelf; mirror mode `door` becomes `fixed`; LED `sensor` becomes `trigger: 'motion'`. When an old bay held a drawer height or a replaced kind, items standing on the floor are pushed up where the new sizes overlap (`settleBay`); nothing else moves.
* **Bay options**: `bay = { width, door, items, colour?, back? }`. `colour` is a material id with the `bay` use in the table (chalk white, pebble grey, natural oak, black); absent means the piece's inside material. `back` is `closed` (default, not stored), `open` (no back board, the wall shows) or `mirror`. They colour the bay's back, dividers, inner side face, shelves and drawer boxes.
* **Advice, not blocks**: `ITEMS[kind].warn = { minWidth, maxWidth, minDepth }` gives non-blocking `item-size` errors: pull-down rail bay 75 to 109 cm wide and piece 54 cm deep (the 210 cm height stays a block), drawers behind the door bay 40 to 109 and depth 42, tray depth 45, pull-out shoe rack depth 50, rail depth 50, larder bay 30 to 60 and depth 50, spice pull-out bay up to 30 cm. The older `minBay` and `minDepth` clearances stay blocking.
* **Presets** (`PRESETS`, `presetsFor(type)`, `PRESET_ALIASES` for old ids): `hang`, `double-hang`, `shelves`, `drawers`, `shoes`, `trousers-ties` (wardrobe and the like); `kitchen-pans`, `kitchen-spice`, `kitchen-bin`, `kitchen-corner`; `larder` (tall cabinet); `books`, `media` (wall unit); `desk-fit`; `seat-drawer`; `stairs`. Every preset keeps to the type's palette and never leaves a blocking clash.
* **Pricing**: new hardware keys `railFinish` (the extra EUR for a finish, metres times the table's `perMetre`), `swivelFitting`, `ledDoorSwitch`, `feltInsert`, `shoeLip`, `spiceRack`, `spiceTier`, `larderFrame`. Glass drawer fronts add glass and a frame; a divider insert adds its insert; boards of a bay with its own colour use that colour's price; a mirror back panel is priced as mirror glass per m2 plus fitting time and replaces the back board, an open back saves it. Lines keep the `piece > bay > item` path; bay lines use `ref: { bay, part: 'back' }`.

### Exports of `model.js`
* Constants: `LAYOUT_T`, `GRID` (3.2), `FRONT_KINDS`, `DOOR_SIDES`, `LIMITS` (`pieces` 40, `bays` 12, `itemsPerBay` 24, `space`), `TYPES`, `STYLES`, `ITEMS`, `PRESETS`, and `MATERIALS` re-exported.
* `TYPES[type] = { label, icon, freestanding, defaultStyle, defaults: { width, height, depth, elevation, plinth, worktop, fronts, bays }, limits: { width, height, depth, elevation, bays }, allowedFronts, allowPlinth, allowWorktop, palette: [item kinds] }`. Types: `wardrobe, kitchen-base, kitchen-wall, tall-cabinet, wall-unit, desk, table, window-seat, under-stairs, island`.
* `STYLES[id] = { label, fronts: { kind, material, handle, grainVertical }, carcass, plinth, worktop }`.
* `ITEMS[kind] = { label, params: { name: { type: 'int'|'enum'|'bool', min, max, values, default } }, body(item) -> [lo, hi], zone(item) -> [lo, hi] | null, needsDoor(item), minBay: { width, height }, minDepth, hardware(item, ctx) -> [{ key, qty }], boards(item, ctx) -> [{ part, w, h, t, qty, use: 'body'|'front' }], minutes }`. `body` is the physical extent and `zone` the space the item claims, both in cm relative to `y`. Two zones may not overlap; a zone may not reach below the bay floor (hanging space); a body may not leave the bay.
* Also exported: `MIN_BAY` (20), `clampPiece(raw)`, `clampSpace(raw)`, `maxBaysFor(type, width)`, `itemBody(item)`, `itemZone(item)`, `visibleFrontHeight(items)` (drawer fronts a door is cut around).
* Piece helpers: `pieceGeometry(piece, bays?) -> { slab, plinth, Hc, innerH, innerW, outerBayW }`, `normalizeItem(item, { bayWidth, innerH })`, `describeItem(item)`, `presetsFor(type)`, `snapY`, `snapUp`, `snapDown`, `pieceLabel(project, pieceId)`.
* Pure edits (each returns a new project, never mutates, and never throws on unknown ids; it returns the project unchanged): `createProject()` (the example: a wardrobe and a desk, nothing else), `createBlankProject()` (`{ v: 2, pieces: [] }`), `createPiece(type, style, overrides)`, `addPiece(p, type, style, overrides)`, `updatePiece(p, id, patch)`, `removePiece(p, id)`, `setBays(p, id, countOrWidths)`, `addItem(p, pieceId, bay, item)`, `moveItem(p, pieceId, bay, index, { y?, bay? })`, `updateItem(p, pieceId, bay, index, patch)`, `removeItem(p, pieceId, bay, index)`, `applyPreset(p, pieceId, bay, presetId)`.
* Snapping: item `y` to the 32 mm system.
* `clampProject(raw)` returns a valid project from any object (ranges, ids, snapping). `migrate(v1Design)` converts a v1 design (`site/js/configurator/model.js`, from an old `#design=` link) to a project: one piece per module, a wall cabinet keeping the height it hung at; the room is dropped. `cloneProject(p)`, `pieceLabel(project, pieceId)` ("Wardrobe 1").

### `validate.js`
`validateProject(project) -> { ok, errors, blocking, warnings }`. `errors: [{ code, message, ref, blocking }]`; `ok` is true when no error has `blocking: true`; `blocking` / `warnings` are the filtered lists. `ref` is `{ type: 'project' } | { type: 'piece', id } | { type: 'bay', pieceId, bay } | { type: 'item', pieceId, bay, index }`. It never throws. It checks pieces only: whatever a project carries beyond `pieces` is not looked at.

| code | blocking | meaning |
|---|---|---|
| `piece-type-unknown`, `piece-size`, `bays-count`, `bays-width` | yes | piece shape |
| `item-unknown`, `item-outside-bay`, `item-clearance`, `item-needs-door` | yes | interior |
| `item-not-allowed`, `item-off-grid`, `item-size` | no | interior advice |
| `space-too-wide`, `space-too-tall` | no | the piece is bigger than the `space` the person gave (the message says by how much); "Fit to the space" fixes both |
| `project-invalid`, `validation-failed` | yes / no | not a project; a check that crashed |

### `pricing.js`
`PRICES_V2` (new item prices, hardware table, labour) on top of the configurator `PRICES`. `cutListFor(piece) -> [{ part, w, h, t, qty, material, ref }]`.
`quoteProject(project, { vat = true } = {})` returns
```js
{ pieces: [{ id, label, lines: [{ ref, label, path, group, qty, unit, amount, cents }], items: [{ ref, label, path, amount, cents }], total, cents }],
  lines: [{ label, amount, cents }],   // Materials, Hardware, Workshop labour, Fitting, Design fee
  subtotal, vat, total, cents: { subtotal, vat, total },
  cutList, boardM2ByMaterial, leadTimeWeeks }   // 4 + ceil(workshop hours / 40)
```
`group` is one of Materials, Hardware, Workshop labour, Fitting. A line `ref` is `{ pieceId, part?, bay?, item? }`. `path` reads "Wardrobe 1 > Section 2 > 3 drawers". Every amount is `cents / 100`, and all sums are taken on the integer cents, so `sum(piece lines) = piece total`, `sum(lines) = subtotal` and `subtotal + vat = total` exactly. Fitting is charged for every piece: a base amount plus an amount per metre of width (`PRICES_V2.fitting`). Nothing depends on a room: there is no scribing to a slope and no radiator cut-out (scribe strips on the piece are priced as workshop labour, as before).

### `share.js`
`async encodeProject(project) -> string`: compact JSON of `{ v: 2, pieces }` (a link never carries a room or placements), deflate-raw through `CompressionStream`, base64url. The first character says which: `z` deflated, `u` plain base64url JSON (no `CompressionStream`). Two furnished pieces make a link of about 900 characters. `async decodeProject(str) -> project | null`: accepts `#p=...`, `p=...` or the bare string; a `#design=...` string or a bare string starting with `e` is an old v1 link and goes through `configurator/share.js` `decodeDesign` and `migrate`; any other object with a `pieces` array (including an older planner link that also holds a `room` and `placements`) is passed through `clampProject`, which ignores what is not a piece; any error gives `null`. `saveLocal(project)` / `loadLocal()` use the key `gj.project.v2` (plain JSON, synchronous, try/catch); an old save with a room loads its pieces and is saved back without the room.

### `store.js` (pure reducer, plus a thin store)
State: `{ project, past[], future[], key, keyAt, ui }`. `ui = { step: 0..2, pieceId|null, bay, item|null, fresh|null, starting: boolean, pane: 'plan'|'3d' }` (`STEP_IDS = ['furniture', 'interior', 'review']`). UI state is never part of undo, saving or sharing; `pieceId`, `bay` and `item` are cleaned up whenever the pieces change (`pieceId` falls back to the first piece, or `null` when there is none; `bay` is clamped to the piece's bays; `item` is an index into that bay's items or `null`). On the Interior step `pane` `'plan'` means the front drawing; on a phone the Interior step shows the drawing or the 3D view, every other step shows 3D only.
* `reduce(state, action)` is pure. `createStore(project, { persist, delay = 400, now, save, setHash }) -> { getState, dispatch, subscribe(fn(state, before, action)) -> unsubscribe, flush(), lastHash }`. `dispatch` stamps `action.at` (ms). With `persist`, a project change schedules one save to `saveLocal` and one `history.replaceState(#p=...)`, both after `delay`. `loadStart({ hash, load })` reads `#p=` / `#design=` first, then local storage, then the example (`kind` `'link'`, `'saved'` or `'new'`); `loadInitialProject` returns just the project.
* History: at most `HISTORY_LIMIT` (100) steps. An action with a `coalesce` key joins the previous undo step when the previous action had the same key and is less than `COALESCE_MS` (1200) older; `history/seal` ends a run. Actions that change nothing add no history.
* Actions. History: `history/undo`, `history/redo`, `history/seal`. Other: `project/load { project }` (clamped, history reset, the step is kept), `ui/step { step }` (0..2), `ui/pane { pane }`, `ui/new-piece` (go to step 0 with `ui.starting = true`: Furniture shows only the type cards until a type is picked; any piece action, `ui/piece` or `ui/step` clears it). There are no room or placement actions.
* Piece actions. `id` defaults to `ui.pieceId`. `piece/add { pieceType, style?, overrides? }` adds a piece, selects it (`bay` 0, `item` null) and marks it `ui.fresh`. If the selected piece is still `fresh` (nothing was changed on it since it was added), the new piece replaces it, so trying several types does not litter the list; any other piece action, `ui/piece` or a step change clears `fresh`. `piece/update { id?, patch }` (`patch` as `updatePiece`; sizes, `space`, `style`, `fronts`, `carcass`, `plinth`, `worktop`, `bays`), `piece/remove { id? }` (selects the previous piece), `piece/bays { id?, bays }` (a count or an array of widths, as `setBays`), `piece/item/add { id?, bay, item }` (selects the new item), `piece/item/move { id?, bay, index, y?, toBay? }` (the selection follows the item; moving to another bay appends it there), `piece/item/update { id?, bay, index, patch }`, `piece/item/remove { id?, bay, index }`, `piece/preset { id?, bay, preset }`. Selection: `ui/piece { id }`, `ui/bay { bay }`, `ui/item { bay, index|null }`. All of these go through the model's pure edits, so snapping and clamping stay in `model.js`.

### `studio.js` (pure)
The neutral studio the pieces stand in. The planner has no room: pieces stand side by side in a studio, and the live view and the render use the same layout, so they never disagree. Units: cm (the scene turns them into metres); x right, z out of the back wall toward the camera, y up; the wall is the plane z = 0.
* `STUDIO = { gap: 30, side: 360, front: 260, freeGap: 80, wallAbove: 140, wallMin: 300, cove: 25 }`.
* `layoutStudio(project) -> { items: [{ pieceId, x, z, lift, w, h, d, free }], extent, floor: { x0, x1, z1 }, wall: { x0, x1, height }, bounds: { minX, maxX, minZ, maxZ, maxY }, empty }`. Pieces of the types that stand on their own (`TYPES[t].freestanding`: tables and islands) form a front row; all the others stand against the wall, left to right in the order of the project, `gap` apart. The front row stands `freeGap` in front of the deepest wall piece (or of the wall when there is none) and is centred on the wall row; `extent` is the longer of the two rows. `x, z` is the piece's left-back corner, `lift` the height it hangs at (`defaultElevation`). The floor runs `side` beyond the pieces on both sides and `front` in front; the wall is `wallAbove` taller than the tallest piece, at least `wallMin`. An empty project has an empty layout.
* `itemOf(layout, pieceId)`, `presetList(project) -> [{ id: 'all' | 'front:<pieceId>', label }]` ("All pieces", or "Overview" for a single piece, then "Front of Wardrobe 1" for each), `frontPose(layout, pieceId, { aspect, fov }) -> { position: [x, y, z], target: [x, y, z] } | null` (metres; straight in front of the piece, far enough to frame it), `overviewPose(layout, { aspect, fov, fill })` (metres; from the front left and a little above; the camera backs off until every corner of every piece is inside `fill` (0.74) of the picture, found by projecting the corners).

### `geometry.js` (browser, THREE passed in)
`studioSignature(layout)` (rebuild the studio only when this changes: moving or adding a piece that does not change the floor and wall size leaves it alone), `buildStudio(layout, THREE, material?) -> Mesh` (one smooth surface, floor curving up into the back wall with a 25 cm cove; single-sided, so a camera behind the wall or under the floor sees through it; `userData.part = 'studio'`), `disposeGroup(g)`, `STUDIO_COLOR`, and the piece builders re-exported from `piece-geometry.js`.

### `viewer.js` (browser)
`createViewer(canvas) -> { setProject(project, { only?, fronts? }), setPose({ position, target }, { instant }), getCameraState() -> { camera, size: { w, h } }, capture({ maxWidth }) -> HTMLCanvasElement, resetView(), resize(), layout, stats: { frames, requests }, idle, debug, dispose() }`. `setProject` shows the pieces side by side in the studio (`only: pieceId` shows that one piece alone, as the Furniture and Interior steps do; `fronts` is `'closed'`, `'ajar'` or `'hidden'`). Lit like a product shot: a soft key light with shadows from the front left, a fill from the right, a hemisphere light and the studio environment. It rebuilds a piece only when `pieceSignature` changes and the studio only when its size changes, and it renders only on demand (no endless rAF loop). The camera is framed with `overviewPose` and framed again on a resize until the person moves it (`auto`); it also frames again when the set of pieces changes or its size changes by more than 30 %.

### `interior-geom.js` (pure, steps 3 helpers)
`bayLayout(piece) -> [{ index, x0, x1, width }]` (cm from the piece's left edge to the bay's clear opening), `suggestY(piece, bayIndex, kind) -> number` (a free, grid-snapped height for a new item: hanging items from the top down, everything else from the floor up, the first place where its zone clashes with nothing; falls back to the clamped default when the bay is full), `dragDivider(widths, k, delta) -> widths` (moves the divider between bay k and k+1 by `delta` cm, whole cm, each bay at least `MIN_BAY`), `resizeBay(widths, k, width) -> widths` (sets bay k and takes the difference from its right neighbour, or its left one for the last bay), `bayAt(layout, x) -> index` (nearest bay), `nudgeY(y, steps) -> y` (moves by whole 32 mm steps), `itemsProblems(errors, pieceId) -> { piece: [], bays: {i: []}, items: {'bay:index': []} }` (groups validation errors by where they apply).

### `geometry.js`, pieces
`buildPiece(piece, THREE, lib, { fronts = 'closed' }) -> Group` (`fronts`: `'closed'`, `'ajar'` (hinged doors stand half open and drawers a little out) or `'hidden'`). The group is in metres with its origin at the piece's left end, bottom and back; +x right, +y up, +z out of the wall. It holds the carcass (sides, top, bottom, back), bay dividers, each item of every bay, fronts, handles, plinth and worktop or seat slab. `userData = { width, height, depth }` (metres). `pieceSignature(piece, fronts)` is the string to compare to decide whether to rebuild.

### Review step
The Review step shows the finished pieces side by side, an itemised quote and the render. Pure logic lives in `review-logic.js`; the step UI in `steps/review.js`; the path tracer in `render.js` and `render-scene.js`, which load on demand (dynamic `import()`, only when the user presses Render). Neither three-gpu-pathtracer nor three-mesh-bvh is imported anywhere else, and neither is in the import map of any page except `planner.html` (pinned there: `three-gpu-pathtracer@0.0.23`, `three-mesh-bvh@0.8.3`, plus `three/examples/jsm/` for the library's own import of `Pass.js`).

#### `review-logic.js` (pure, no DOM, no Three.js)
* `formatEuro(amount) -> '€1,234.50'` (`en-IE`, always two decimals; the same function is used by the planner), `formatEuroWhole(amount)`, `formatDuration(seconds)`.
* `issueStep(ref) -> 0..1` (which step fixes a validation error: 0 Furniture for a piece or a section, 1 Interior for an item; `STEP_NAMES = ['Furniture', 'Interior']`), `sendBlockers(project, errors) -> [{ code, message, ref, step, label, pieceId? }]`: every blocking error, plus `no-pieces` when nothing is designed. Nothing has to be placed. "Send to the workshop" is allowed only when this list is empty. `adviceList(errors)` is the non-blocking rest (the space warnings are in it).
* `quoteView(quote, project) -> { pieces: [{ id, label, size, cents, groups: [{ label, cents }], sections: [{ key, title, cents, rows: [{ label, cents }] }] }], totals: { lines: [{ label, cents }], subtotalCents, vatCents, totalCents, vatOn, leadTimeWeeks }, materials: [{ id, label, m2 }] }`. A piece's sections are "The piece" (carcass, frame, plinth, worktop, sliding doors, workshop time, fitting) then "Section 1", "Section 2", and so on; a row sums every quote line with the same ref (materials, hardware and labour together). Section and piece cents are the sums of their rows, so the view always adds up to `quote.cents.subtotal`.
* `renderSettings(env, override?) -> { cls: 'desktop' | 'weak', width, height, maxSamples, maxSeconds, tiles: [x, y], bounces, stages: [{ scale, samples }], capped, reasons, note }`. `env = { screenWidth, screenHeight, pointerCoarse, deviceMemory, cores, maxTextureSize, software, aspect }`. Desktop: long edge 1600 px, 256 samples, 60 s. Weak (small touch screen, 4 GB or less, a software renderer, small textures): long edge 960 px, 96 samples, 45 s, and `note` says so. The first stage is quarter resolution, so an image appears at once. `override` (`{ width, maxSamples, maxSeconds }`) is for tests (`window.gjRenderLimits`).
* `progressFraction({ samples, maxSamples, elapsed, maxSeconds })` in 0..1 (whichever limit is closer).

#### `render.js` (browser; imported on demand)
* `probeRender() -> { ok, reason?, software, maxTextureSize }`: needs WebGL2 and `EXT_color_buffer_float`. No Three.js import, cheap enough to call when the step opens.
* `startRender({ host, project, camera, fronts, settings, onStage, onProgress }) -> { stop(), dispose(), done: Promise<{ canvas, samples, seconds, reason }> }`. It builds its own `WebGLRenderer` on a fresh canvas appended to `host`, builds the scene with `render-scene.js` (`buildStudio`, `buildPiece`: the same builders and the same layout as the viewer), loads `assets/3d/room_1k.hdr` (used only for reflections and a little ambient light), and runs a progressive loop: quarter, half, then full resolution, one `renderSample()` per frame, the display pass denoising (`DenoiseMaterial`) only when it stops. Stages reported through `onStage`: `loading`, `building`, `compiling`, `preview`, `refining`, `done`, `stopped`, `error`. It stops at `settings.maxSamples` or `settings.maxSeconds` (counted from the first sample, in frame time, so a hidden tab does not use it up). Everything is disposed when the render ends, the result is a 2D canvas copy (`done.canvas`), and no `requestAnimationFrame` runs afterwards.
* `render-scene.js`: `buildRenderScene({ project, THREE, lib, fronts, camera, hdr, background, tex }) -> { scene, dispose() }` and `neededTextures(project) -> [name]`. The studio and every piece come from the geometry builders, given a material library that swaps in PBR textures from `site/assets/planner-tex/` (`<name>_diff.jpg` 1k or 512, `_rough.jpg` and `_nor.jpg` 512; Poly Haven CC0; names `oak`, `walnut`, `ash`, `birch`, `plaster`; the studio uses the plaster roughness and normal, the pieces the wood sets). `render.js` loads only the sets `neededTextures` names, and only when Render is pressed. The wood textures have their grain along the image x axis, like the live viewer's canvases, so `piece-geometry.js` UVs apply unchanged (1.6 m along, 0.6 m across, one tile = 0.9 m); the studio uses metre UVs. Handles are metal (roughness 0.3) and door glass is transmissive. The whole scene is merged into one plain, non-indexed mesh per material with the world transform baked in (`flattenByMaterial`): three-gpu-pathtracer 0.0.23 merges meshes itself in uuid order (random per page load), and some orders rendered whole surfaces black or too bright. Light, like a product shot: a large warm `RectAreaLight` as the key (front left, above), a smaller cool one as the fill (front right), a thin `RectAreaLight` and emissive material per LED strip, and the HDRI as the environment at 0.55; ACES tone mapping at exposure 0.8. The background is the page colour.
* Do not set `transmissiveBounces` on the tracer (leave the library default): a low value left a fifth of the pixels permanently black.

#### Step behaviour
* Doors toggle (closed or open) and the preset views (All pieces, Front of each piece) drive the live viewer. Render captures the viewer camera as it is. While the render is shown the live view is covered; "Back to live view" removes it. The Render button becomes Stop while rendering.
* Fallback: without WebGL2 or float targets the Render button says so and the live view stays (it already has soft shadows); Download PNG still saves the live view.
* Download PNG saves the finished render when there is one for the current project, otherwise the live view.
* Actions: Copy share link (`#p=`), Print the quote (print stylesheet; the quote is rebuilt into `#pl-print` on `beforeprint`), Send to the workshop (opens the guided flow's last question, "Where should we send your design?", with the contact fields; the tabbed view switches to the guided flow without saving the mode choice). Send refuses while `sendBlockers` is not empty and lists what to fix, with a button to the step that fixes each.

### Guided flow (`flow.js`, pure; `steps/guided.js`, DOM)
UI only: the project, the store actions, pricing, validation and share links are unchanged by it. `CHAPTERS = ['Furniture', 'Interior', 'Review']`. `QUESTIONS` is the list of 9 `{ id, chapter, title, help, next, optional?, needs? }` (`needs`: `'piece'` or `'inside'`):

| chapter | questions |
|---|---|
| Furniture | `type` What would you like us to build? · `style` Which look do you like best? · `look` Want to change the colour or handles? (optional, "More options") · `piece-size` How big should it be? (standard sizes, your own size, and the optional "How much space do you have?" pair with "Fit to the space") |
| Interior | `inside` What should go inside? · `arrange` Want to arrange it yourself? (optional). Both skipped for a piece with no inside. |
| Review | `more` Would you like anything else built? (pieces with Edit and Remove, "Add another piece") · `review` Here’s your furniture. (3D, quote, VAT, PNG, share link, print) · `send` Where should we send your design? (nothing is sent) |

`activeIds({ hasInside })` drops the Interior questions for a piece with no inside (`hasInside(piece)`: its type has a palette). `nextId`, `prevId`, `position(id, ctx) -> { n, total, k, of, chapter }`, `announcement(id, ctx)` ("Question 3 of 9: ..."), `chapterProgress` ("Question 2 of 4"), `firstOfChapter`, `settle(id, { pieces, hasInside })` (the question to ask instead when this one cannot be asked yet: no piece means `type`; no inside means `more`), `landing(project)` (`'review'` when there is a piece, otherwise `'type'`), `view(id, flags) -> { step, sections }` (what the step editors show; `flags`: `arrange`, `lookMore`), `questionForStep(step, ctx)`, `expertSection`, `DEFAULT_SECTIONS` (`['pieces', 'layout', 'quote']`), `commonFronts`, `checkContact`, `referenceNumber`. "Edit everything" (the tabbed view) has the same three steps, Furniture (Pieces, Style, Look, Size), Interior and Review. `createTabs()` in `steps/ui.js` has `showMany(ids)` (any number of sections, tab bar out of sight). The page keeps `data-mode="guided"|"expert"` and `data-q="<question id>"` on `#pl-app`; the mode is stored in `localStorage` under `gj.planner.view`.
