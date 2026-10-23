# Step-by-step planner: system design

Status: approved (templates for rooms, extended interior catalogue, replaces the old planner). Building in phases.
Replaces the single-screen planner in `site/configurator.html`, which will redirect to `planner.html` and keep old links working.

## 1. Requirements

### What the user does (functional)
A five-step flow. The user can go back to any earlier step at any time without losing work.

1. **Room.** Start from a template and set its measurements: rectangle, L-shape, chimney breast with two alcoves,
   attic, hallway or bay window. Then set the ceiling height, add openings on any wall (doors, windows, radiators,
   sockets) and choose floor and wall finishes. Free drawing is not in scope yet; the model already stores
   rooms as corner lists, so it can be added later without a migration.
2. **Furniture.** Pick a type (wardrobe, kitchen run, wall unit, desk, table, window seat, under-stairs), a style
   (one click sets fronts, colours, handles, base and top) and fine-tune it: front design (slab, shaker, glass, ribbed), edges,
   colour and material for the fronts, the box and the inside, two-tone, handles, legs or plinth, crown, end panels, scribe
   strips, and its size (presets, 1 cm steps, fit to wall, fit to ceiling). Every option shows its price. The stock range lives
   in one table, `site/js/planner/materials.js`.
3. **Interior.** Lay out the inside, bay by bay. Set the number of bays, then add and move any item from the
   interior catalogue (section 3): shelves, rails, drawers, jewellery and divided drawers, shoe racks, trouser and
   tie racks, baskets, a laundry pull-out, a fold-out ironing board, mirrors, cubbies, hooks and LED strips. Every item can be dragged to any height,
   within limits that make sense (a drawer stack needs room for its runners, for example).
4. **Place.** Put the piece in the room: against a wall (snapped to it, and kept clear of doors, windows and
   radiators), in a corner, or free-standing (a table or an island). From here the user can **add another piece**,
   which goes back to step 2, or **edit** any placed piece, which goes back to step 2 or 3 for that piece.
5. **Review.** Walk around the finished room in 3D, then press **Render** for a realistic, path-traced image
   with an itemised quote: per piece, per material, hardware, labour, fitting, VAT and lead time.
   From here the user can download the render, share a link, print the quote or send the design to the quote form.

### How it has to behave (non-functional)
| Need | Target |
|---|---|
| Hosting | Static files on GitHub Pages. No server, no accounts, no database. |
| Speed | Every step stays at 60 fps on a mid-range laptop; a step loads in under 1 s after the first visit. |
| Realistic render | A clean 1600×900 image in under about 60 s on an integrated GPU, and much faster on a discrete one. Progressive: a noisy preview appears at once and refines. |
| Phones | Steps 1 to 4 work with touch, using 2D editors. Step 5 renders at a lower resolution. |
| Saving | Autosave to the browser; the whole project fits in a share link. |
| Accessibility | Every editor can be used by keyboard, with numeric inputs next to every drag handle. |
| Correctness | Pure, unit-tested model, pricing and validation, as today (`node --test`). |

### Constraints
Plain ES modules and no build step. Three.js 0.169 stays pinned. Same design tokens. The quote form still sends nothing.

## 2. High-level design

```
 ┌───────────────────────────── planner.html ─────────────────────────────┐
 │  Stepper:  1 Room ─ 2 Furniture ─ 3 Interior ─ 4 Place ─ 5 Review      │
 │                                                                         │
 │  ┌──────────── step views (DOM + SVG) ────────────┐  ┌── 3D viewer ──┐  │
 │  │ RoomEditor      plan (SVG) + wall elevations   │  │ three.js      │  │
 │  │ FurniturePicker type / style / size cards      │  │ room + pieces │  │
 │  │ InteriorEditor  front elevation per piece (SVG)│  │ (live, raster)│  │
 │  │ PlacementEditor plan (SVG) with snapping       │  └──────┬────────┘  │
 │  │ Review          quote + Render button          │         │ same     │
 │  └────────────┬───────────────────────────────────┘         │ scene    │
 │               │ actions                         ┌───────────▼───────┐  │
 │        ┌──────▼───────┐   state   ┌──────────┐  │ PathTraceRenderer │  │
 │        │ store.js     ├──────────►│ selectors│  │ three-gpu-        │  │
 │        │ reducer +    │           │ validate │  │ pathtracer, HDRI, │  │
 │        │ undo/redo    │           │ quote    │  │ PBR textures      │  │
 │        └──────┬───────┘           └──────────┘  └───────────────────┘  │
 │               │ persist (debounced)                                     │
 │        localStorage  +  #p=<compressed share link>                      │
 └─────────────────────────────────────────────────────────────────────────┘
```

* **One store, many views.** Every change is an action, such as `addWall`, `setInteriorItem` or `placePiece`,
  handled by a pure reducer. Views subscribe to the store. Undo and redo keep a history of states, as today.
* **2D for editing, 3D for seeing.** Steps 1, 3 and 4 edit in SVG (plan or elevation): it's precise, works with
  touch and keyboard, and is cheap. The 3D viewer sits beside each editor and mirrors every change. Direct
  dragging in 3D stays for moving a placed piece along its wall, which the current planner already does well.
* **Two renderers for one scene.** The live viewer uses ordinary WebGL raster with PBR materials. Review hands
  the same scene to a path tracer for the realistic image. Geometry and materials are built once in
  `geometry.js` from the model, so the two can never disagree.

## 3. Data model v2 (`model.js`, pure)

All lengths in cm, as today.

```js
project = {
  v: 2,
  room: {
    walls: [                         // a closed outline, clockwise, in plan coordinates (x right, z down)
      { id: 'w1', x: 0, z: 0 },      // each corner starts a wall that runs to the next corner
      { id: 'w2', x: 420, z: 0 },
      { id: 'w3', x: 420, z: 380 },
      { id: 'w4', x: 0, z: 380 },
    ],
    height: 260,                     // ceiling height
    slope: null,                     // or { wallId: 'w1', lowHeight: 140, depth: 120 }: an attic slope
    openings: [                      // on a wall, measured along it from its start corner
      { id: 'o1', wallId: 'w1', type: 'window', offset: 260, bottom: 90, width: 120, height: 130 },
      { id: 'o2', wallId: 'w4', type: 'door', offset: 40, bottom: 0, width: 90, height: 210, swing: 'in-left' },
      { id: 'o3', wallId: 'w2', type: 'radiator', offset: 100, bottom: 15, width: 80, height: 60, depth: 10 },
    ],
    floor: 'oak-floor', wall: 'chalk', skirting: 7,
  },
  pieces: [                          // furniture designs, independent of where they stand
    {
      id: 'p1', type: 'wardrobe', style: 'flat-oak',
      width: 240, height: 240, depth: 60,
      carcass: { material: 'birch-ply' },
      fronts: { kind: 'hinged', material: 'oak', handle: 'bar', grainVertical: true },
      plinth: 10, worktop: null,
      bays: [                        // left to right; widths sum to the inner width
        { width: 80, door: 'left', items: [
          { kind: 'shelf', y: 200 }, { kind: 'rail', y: 180, length: 'long' },
          { kind: 'drawers', y: 10, count: 3, height: 60 } ] },
        { width: 80, door: 'right', items: [ { kind: 'shelf', y: 40 }, { kind: 'shelf', y: 80 }, { kind: 'shoes', y: 10, rows: 2 } ] },
        { width: 80, door: 'left', items: [ { kind: 'rail', y: 180, length: 'long' }, { kind: 'led', y: 230 } ] },
      ],
    },
  ],
  placements: [                      // where each piece stands
    { pieceId: 'p1', mode: 'wall', wallId: 'w2', offset: 20, elevation: 0 },
    // { pieceId: 'p2', mode: 'free', x: 210, z: 220, rotation: 90 }
  ],
}
```

* **Pieces and placements are separate.** A piece can be designed before it's placed, and moving it never
  changes its design. Duplicating a piece later ("two identical bedside units") is just a second placement.
* **The interior is a list of items with heights, per bay.** That covers any layout without a fixed menu
  of presets. Presets ("hanging + shelves", "all drawers") are just starting lists.

### Interior catalogue (`model.js` → `ITEMS`)
Every item has a kind, the parameters the editor shows, the vertical space it needs (`clear`, cm above its `y`),
whether it needs a door in front, and its hardware for pricing. The interior editor's palette is this table.

| kind | Label | Params | Needs (cm) | Hardware priced |
|---|---|---|---|---|
| `shelf` | Shelf | material (body or glass), adjustable | 18 above | 4 shelf pins (adjustable) |
| `rail-long` | Long hanging rail | — | 150 below | rail per bay width, 2 rail sockets |
| `rail-short` | Short hanging rail | — | 95 below | rail, 2 sockets |
| `double-hang` | Double hanging | — | 190 total | 2 rails |
| `pull-down-rail` | Pull-down rail | — | 100 below, bay ≥ 210 high | wardrobe lift mechanism |
| `drawers` | Drawer stack | count 1 to 6, front height 12 to 30 | sum of fronts | full-extension soft-close runners per drawer |
| `inner-drawers` | Drawers behind the door | count 1 to 4 | sum of fronts | runners; front set back 2.5 cm so the door closes |
| `jewellery` | Jewellery drawer | lining colour | 8 | runners, velvet tray with dividers |
| `divided-drawer` | Socks and underwear drawer | grid 3 × 4 or 4 × 5 | 15 | runners, divider grid |
| `shoes` | Shoe rack | rows 1 to 4, angled | 20 per row | angled rack rails |
| `shoe-pullout` | Pull-out shoe rack | rows 2 to 4 | 22 per row | runners |
| `trouser-rack` | Pull-out trouser rack | — | 70 | side-mount runner, rack |
| `tie-belt` | Tie and belt rack | side | 50 | side pull-out |
| `valet-rod` | Valet rod | side | 5 | telescopic rod |
| `basket` | Pull-out basket | wood or wire, depth 15 to 30 | depth + 3 | runners |
| `hamper` | Laundry pull-out | 1 or 2 bags | 60 | runners, removable bags |
| `ironing` | Fold-out ironing board | — | 110, bay ≥ 40 wide | ironing board fitting |
| `mirror` | Mirror | inside door or pull-out | — (door) / 120 (pull-out) | mirror glass per m², pull-out runner |
| `divider` | Vertical divider | position | spans a gap | board |
| `cubbies` | Cubby grid | columns × rows | 30 per row | boards |
| `hooks` | Accessory hooks | count 3 to 8 | 10 | hook rail |
| `led` | LED strip | warm or neutral, motion sensor | 2 | LED per metre, driver, sensor if set |

Presets per bay: *Hanging*, *Double hanging*, *Shelves*, *Drawers*, *Shoes*, *Trousers and ties*; the kitchen, tall, wall-unit, desk, window-seat and under-stairs presets are listed in `CONTRACTS.md` ("Interior depth"). **The catalogue above was revised in the interior-depth round (see `docs/INTERIOR-RESEARCH.md` and `CONTRACTS.md`)**: rails are one item with a length, drawers have heights, fronts and divider inserts, and the pull-out tray, larder and spice pull-out are new; the ironing board, cubby grid and divided drawer are gone. Kitchen, desk and wall-unit types get their own palettes
(cutlery insert, pan drawer, bin pull-out, corner carousel, cable tray, keyboard drawer, book shelf, media niche).

* **Rules** (`validate.js`, pure, reporting `{ code, message, ref }` like today):
  * room: at least 3 walls, no crossing walls, openings fit on their wall and don't overlap.
  * piece: bays sum to the inner width; each item stays inside its bay; minimum gaps (shelf to shelf 18 cm,
    a long rail needs 150 cm of hanging height, a short one 95 cm, and drawers need their runner length);
    nothing hits a hinged door's swing.
  * placement: a piece doesn't overlap another piece, doesn't cover a door or window (a radiator only if the
    style allows a cut-out), fits under the ceiling slope, and a free-standing piece leaves 60 cm to walk past.
  * Problems never block editing. They show as warnings on the step and in the quote. Only **Send to
    quote form** asks the user to fix blocking ones first.

Every project also stores `room.template = { id, params }` so the room step can reopen the same template form.

**Migration:** `migrate(v1)` turns today's single back wall into a four-wall rectangle and each v1 module into
a piece and a placement on wall 1, expanding the v1 `interior` enum into an item list. Old share links keep working.

### Room templates (`model.js` → `roomFromTemplate(id, params)`)
Each template is a function from named measurements to the corner list, so editing a measurement regenerates
the walls. Openings are kept by wall index and offset where the wall still exists, and flagged if not.

| id | Params (cm) | Notes |
|---|---|---|
| `rect` | width, depth | 4 walls |
| `l-shape` | lengthA, widthA, lengthB, widthB | 6 walls; the notch is the bottom right |
| `alcoves` | width, depth, breastWidth, breastDepth, breastOffset | chimney breast on wall 1, two alcoves either side |
| `attic` | width, depth, kneeHeight, slopeAngle, slopeWall | rectangle with `slope` set; height is the ridge |
| `hallway` | length, width | rectangle with long-wall defaults and door openings at the ends |
| `bay` | width, depth, bayWidth, bayDepth | 3-sided bay on wall 1 |

## 4. The steps in detail

| Step | Editor | Main interactions | Leaves the step when |
|---|---|---|---|
| 1 Room | Template cards, then a plan (SVG, 1 cm grid, 5 cm snap) plus an elevation of the selected wall | Pick a template; set its named measurements by number input or by dragging the dimension handles on the plan; drag openings along a wall; set ceiling height (and knee wall and slope for the attic) | The room is valid. "Next: furniture" |
| 2 Furniture | Cards, then a style panel | Type → style (preset look) → size, using sliders and number inputs limited per type | Always. The piece is created, unplaced |
| 3 Interior | Front elevation of the piece, doors hidden | Set the bay count, drag bay dividers; drag items from a palette into a bay; drag items up and down (snapping to 32 mm system holes); delete; apply a preset per bay | Always. "Next: place it" |
| 4 Place | Plan of the room with the piece under the pointer | Click a wall to snap it, slide it along, rotate a free piece; red where it clashes. Buttons: **Add another piece** (step 2), **Edit this piece** (step 2 or 3), **Review** | At least one piece is placed |
| 5 Review | 3D walk-around plus a quote panel | Orbit and use preset views; open doors; **Render** (progressive) then **Download PNG**; share link; print the quote; send to the quote form | (end) |

The stepper allows jumps backwards and forwards. If an earlier edit makes a later state invalid (a wall gets
shorter than a piece standing on it), the piece stays in place and gets a warning to fix in step 4. Nothing
is deleted silently.

## 5. The realistic render

**Choice: path tracing in the browser** with `three-gpu-pathtracer` 0.0.23 and `three-mesh-bvh` 0.8.3. Both
declare support for three 0.169, which the site already pins.

* The same scene as the live viewer, plus:
  * the Poly Haven PBR textures from `tools/blender/` (oak and birch veneer, laminate, plaster)
  * the `small_empty_room_3` HDRI for daylight
  * a sun through each window opening
  * the LED strips as emissive area lights
* **Progressive:** it starts at 1/4 resolution so the image appears in under a second, refines with each sample,
  and stops at about 256 samples or after 60 s. The result is denoised (the library's built-in denoise pass) and
  offered as a PNG.
* **Phones and weak GPUs:** cap the resolution at 960 px and the samples at 96, and say so in the UI. If WebGL2 or
  the needed float textures are missing, fall back to the raster view with soft shadows plus a note.

Alternatives considered:

| Option | Realism | Cost and complexity | Verdict |
|---|---|---|---|
| Browser path tracer (chosen) | Close to Blender for this kind of scene | No server, about 250 KB of extra JS loaded only in step 5 | Fits a static site |
| Better raster (baked AO, SSAO, reflections) | Good, clearly CG | Cheapest | Kept as the live viewer and the fallback |
| Server render (Blender in a queue, like our hero film) | Best | Needs a server, a queue and money per render; minutes of waiting | Revisit only if this becomes a real product |

## 6. The quote

`pricing.js` v2, pure and tested, works from the project rather than from v1 modules:

* **Boards:** the cut list comes from each piece: carcass panels, bay dividers, back, each shelf, drawer boxes
  and fronts. Area per material × price per m² × waste factor.
* **Hardware:** hinges (two or three per door, by height), runners per drawer, rails per metre, shoe racks,
  handles, LED per metre plus drivers.
* **Labour:** a base per piece type, plus time per item (each drawer and each door adds minutes).
* **Fitting:** per piece, plus extras for scribing to a slope or around a radiator.
* **Totals:** design fee, VAT toggle, lead time = 4 weeks + workshop hours / 40.

Every line points back to a piece and item, so the quote can show "Wardrobe 1 › Bay 2 › 3 drawers: €138".

## 7. Persistence and sharing

* Autosave to `localStorage` (`gj.project.v2`), debounced to 400 ms.
* Share link `#p=` is JSON, deflated with the built-in `CompressionStream` and base64url-encoded. That keeps a
  room with four detailed pieces at roughly 1 to 2 KB. Older browsers get plain base64.
* **Send to quote form** passes the same link to `contact.html`, which shows the render thumbnail and the quote.

## 8. Files

```
site/planner.html                      the new page (configurator.html redirects here)
site/js/planner/store.js               reducer, actions, undo/redo, persistence
site/js/planner/model.js       (pure)  types, defaults, presets, clamps, migrate(v1)
site/js/planner/validate.js    (pure)  room, piece, placement rules
site/js/planner/pricing.js     (pure)  cut list and quote v2
site/js/planner/share.js       (pure)  encode/decode with compression
site/js/planner/geometry.js            project -> Three.js meshes (shared by viewer and path tracer)
site/js/planner/viewer.js              live 3D view
site/js/planner/render.js              path tracer, loaded on demand in step 5
site/js/planner/steps/room.js, furniture.js, interior.js, place.js, review.js
tests/planner-*.test.mjs
```

`CONTRACTS.md` gets the v2 shapes before any code, per the repo convention.

## 9. Delivery plan

The director (Opus) writes the contracts and reviews every phase with tests, screenshots and frame-time
measurements. Builders (Sonnet) do one phase each. Each phase ends usable and deployed.

| Phase | Builds | Done when |
|---|---|---|
| 1 | Model v2, validate, pricing v2, share v2, migrate(v1), tests | `node --test` covers rooms, interiors, placements and the quote; v1 links decode |
| 2 | Planner shell, stepper, store; step 1 room editor; live viewer | A user can draw an L-shaped room with openings and see it in 3D |
| 3 | Steps 2 and 3: furniture picker and interior editor | A wardrobe with three custom bays can be designed by mouse, touch and keyboard |
| 4 | Step 4 placement, with the add-another / edit loop | Two or more pieces placed with snapping and clash warnings |
| 5 | Step 5 review: quote panel, path-traced render, PNG, share, send to the form | A clean render in under 60 s on a laptop; the quote matches the unit tests |
| 6 | Polish: phones, accessibility pass, performance budget, smoke tests | 60 fps per step; all pages pass `tools/smoke.mjs` |

## 10. Trade-offs and what to revisit

* **SVG editors vs. editing in 3D:** SVG is precise and accessible but less "magic". The 3D view stays
  live beside it. Revisit if user testing shows people want to grab things in 3D.
* **Templates instead of free drawing:** six parametric templates cover most rooms and keep placement simple.
  Free drawing (dragging corners, splitting walls) can come later on the same corner-list model. Curved walls are out of scope.
* **Path tracing in the browser:** it's free and private but slow on weak devices. If it ever becomes a real
  product with real customers, a server render queue gives Blender quality on any device.
* **Interior as free items vs. presets:** items give full control. Presets keep it quick for most people, so both are offered.
* **Share links in the URL:** no backend, but very large projects could pass about 8 KB, which some chat apps cut off.
  Revisit with a small storage service if that happens.
