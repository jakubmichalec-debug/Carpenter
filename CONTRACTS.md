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
