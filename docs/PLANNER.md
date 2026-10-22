# Step-by-step planner: system design

Status: proposal, not built yet. Replaces the single-screen planner in `site/configurator.html`.

## 1. Requirements

### What the user does (functional)
A five-step flow. The user can go back to any earlier step at any time without losing work.

1. **Room.** Build the room: its outline (rectangle, L-shape or any polygon you draw), wall heights, a sloped
   ceiling, and openings on each wall (doors, windows, radiators, sockets, niches). Choose floor and wall finishes.
2. **Furniture.** Pick a type (wardrobe, kitchen run, wall unit, desk, table, window seat, under-stairs), a style
   (fronts, handles, plinth, materials) and its size.
3. **Interior.** Lay out the inside, bay by bay. Set the number of bays, then add and move shelves, hanging rails
   (long or short), drawer stacks, shoe racks, pull-outs and LED strips. Every item can be dragged to any height,
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
* **Rules** (`validate.js`, pure, reporting `{ code, message, ref }` like today):
  * room: at least 3 walls, no crossing walls, openings fit on their wall and don't overlap.
  * piece: bays sum to the inner width; each item stays inside its bay; minimum gaps (shelf to shelf 18 cm,
    a long rail needs 150 cm of hanging height, a short one 95 cm, and drawers need their runner length);
    nothing hits a hinged door's swing.
  * placement: a piece doesn't overlap another piece, doesn't cover a door or window (a radiator only if the
    style allows a cut-out), fits under the ceiling slope, and a free-standing piece leaves 60 cm to walk past.
  * Problems never block editing. They show as warnings on the step and in the quote. Only **Send to
    quote form** asks the user to fix blocking ones first.

**Migration:** `migrate(v1)` turns today's single back wall into a four-wall rectangle and each v1 module into
a piece and a placement on wall 1, expanding the v1 `interior` enum into an item list. Old share links keep working.

## 4. The steps in detail

| Step | Editor | Main interactions | Leaves the step when |
|---|---|---|---|
| 1 Room | Plan (SVG grid at 1 cm with a 5 cm snap) plus an elevation of the selected wall | Pick a template (rectangle, L, attic); drag corners; split a wall to add a corner; type exact lengths; drag openings along a wall; set ceiling and slope | The outline is closed and valid. "Next: furniture" |
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
* **Free-form polygon rooms:** they cover any plan but make placement snapping harder, so walls stay straight.
  Curved walls are out of scope.
* **Path tracing in the browser:** it's free and private but slow on weak devices. If it ever becomes a real
  product with real customers, a server render queue gives Blender quality on any device.
* **Interior as free items vs. presets:** items give full control. Presets keep it quick for most people, so both are offered.
* **Share links in the URL:** no backend, but very large projects could pass about 8 KB, which some chat apps cut off.
  Revisit with a small storage service if that happens.
