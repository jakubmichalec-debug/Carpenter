# Step-by-step furniture planner: system design

Status: furniture only. The planner used to start with a room (shapes, openings, floor and walls) and ended with placing
each piece in it. That is gone: the person designs **furniture**, and sees it in a neutral studio. A room needs drawing
skill and patience that most visitors do not have, and the workshop measures the real room anyway.
`site/configurator.html` (the old single-screen configurator) redirects to `planner.html` and keeps old links working.

## 1. Requirements

### What the user does (functional)
Three steps, shown as 9 questions (section 11). The user can go back to any earlier question at any time without losing work.

1. **Furniture.** Pick a type (wardrobe, kitchen run, wall unit, desk, table, window seat, under-stairs), a style (one click
   sets fronts, colours, handles, base and top) and fine-tune it: front design (slab, shaker, glass, ribbed), edges, colour
   and material for the fronts, the box and the inside, two-tone, handles, legs or plinth, crown, end panels, scribe strips,
   and its size (standard sizes and 1 cm steps). Optionally the person says **how much space they have** (a wall width and a
   ceiling height); the planner warns when the piece does not fit and offers **Fit to the space**. Every option shows its
   price. The stock range lives in one table, `site/js/planner/materials.js`.
2. **Interior.** Lay out the inside, section by section. Set the number of sections, then add and move any item from the
   interior catalogue (section 3): shelves, rails, drawers, jewellery drawers, shoe racks, trouser and tie racks, baskets,
   a laundry pull-out, mirrors, hooks and LED strips. Every item can be dragged to any height, within limits that make sense.
   A piece with no inside (a table) skips this step.
3. **Review.** Look at all the pieces side by side in 3D, with a preset view for each piece, then press **Render** for a
   realistic, path-traced image with an itemised quote: per piece, per material, hardware, labour, fitting, VAT and lead
   time. From here the user can **add another piece** (back to step 1), download the render, share a link, print the quote or
   send the design to the workshop (the contact question; nothing is sent).

### How it has to behave (non-functional)
| Need | Target |
|---|---|
| Hosting | Static files on GitHub Pages. No server, no accounts, no database. |
| Speed | Every step stays at 60 fps on a mid-range laptop; a step loads in under 1 s after the first visit. |
| Realistic render | A clean 1600×900 image in under about 60 s on an integrated GPU, and much faster on a discrete one. Progressive: a noisy preview appears at once and refines. |
| Phones | Steps 1 and 2 work with touch. Step 3 renders at a lower resolution. |
| Saving | Autosave to the browser; the whole project fits in a share link. |
| Accessibility | Every editor can be used by keyboard, with numeric inputs next to every drag handle. |
| Correctness | Pure, unit-tested model, pricing and validation (`node --test`). |

### Constraints
Plain ES modules and no build step. Three.js 0.169 stays pinned. Same design tokens. The contact step still sends nothing.

## 2. High-level design

```
 ┌───────────────────────────── planner.html ─────────────────────────────┐
 │  Chapters:  1 Furniture ─ 2 Interior ─ 3 Review                         │
 │                                                                         │
 │  ┌──────────── step views (DOM + SVG) ────────────┐  ┌── 3D viewer ──┐  │
 │  │ FurniturePicker type / style / size cards      │  │ three.js      │  │
 │  │ InteriorEditor  front elevation per piece (SVG)│  │ pieces in a   │  │
 │  │ Review          quote + Render button          │  │ studio (live, │  │
 │  └────────────┬───────────────────────────────────┘  │ raster)       │  │
 │               │ actions                         ┌────┴──────────────┐  │
 │        ┌──────▼───────┐   state   ┌──────────┐  │ PathTraceRenderer │  │
 │        │ store.js     ├──────────►│ selectors│  │ three-gpu-        │  │
 │        │ reducer +    │           │ validate │  │ pathtracer, HDRI, │  │
 │        │ undo/redo    │           │ quote    │  │ PBR textures      │  │
 │        └──────┬───────┘           └──────────┘  └───────────────────┘  │
 │               │ persist (debounced)                                     │
 │        localStorage  +  #p=<compressed share link>                      │
 └─────────────────────────────────────────────────────────────────────────┘
```

* **One store, many views.** Every change is an action, such as `piece/update` or `piece/item/add`, handled by a pure
  reducer. Views subscribe to the store. Undo and redo keep a history of states.
* **2D for editing, 3D for seeing.** The interior is edited in SVG (a front elevation): it's precise, works with touch and
  keyboard, and is cheap. The 3D viewer mirrors every change.
* **One layout, two renderers.** `studio.js` (pure) decides where every piece stands. The live viewer uses ordinary WebGL
  raster with PBR materials; Review hands the same layout to a path tracer for the realistic image. Geometry and materials
  are built once in `geometry.js` and `piece-geometry.js` from the model, so the two can never disagree.

## 3. Data model (`model.js`, pure)

All lengths in cm.

```js
project = {
  v: 2,
  pieces: [
    {
      id: 'p1', type: 'wardrobe', style: 'flat-oak',
      width: 240, height: 240, depth: 60, elevation: 0,   // elevation: a wall unit hangs
      carcass: { material: 'birch-ply' },
      fronts: { kind: 'hinged', material: 'oak', handle: 'bar', grainVertical: true },
      plinth: 10, worktop: null,
      space: { width: 260, height: 250 },                 // optional: the wall width and ceiling height the person has
      bays: [                                             // "sections" in the interface; left to right
        { width: 80, door: 'left', items: [
          { kind: 'shelf', y: 200 }, { kind: 'rail', y: 180, length: 'long' },
          { kind: 'drawers', y: 10, count: 3, size: 'low' } ] },
        { width: 80, door: 'right', items: [ { kind: 'shelf', y: 40 }, { kind: 'shelf', y: 80 }, { kind: 'shoes', y: 10, rows: 2 } ] },
        { width: 80, door: 'left', items: [ { kind: 'rail', y: 180, length: 'long' }, { kind: 'led', y: 230 } ] },
      ],
    },
  ],
}
```

* **There is no room and there are no placements.** Nothing in the model, the quote, the validation or the share link
  knows where a piece stands. `clampProject` keeps `v` and `pieces`; a room and placements in an older save or link are
  ignored (the pieces load, a wall unit keeps the height it hung at).
* **`space` is a constraint, not geometry.** It never changes how a piece is drawn or priced. `fit.js` compares it with
  the piece (`spaceCheck`), `validate.js` turns a mismatch into two non-blocking messages (`space-too-wide`,
  `space-too-tall`), and "Fit to the space" (`fitToSpace`) sets the width to the wall width and the height to the ceiling
  minus the elevation and a little air (0.5 cm, 1.5 cm with scribe strips), within the limits of the type.
* **The interior is a list of items with heights, per section.** That covers any layout without a fixed menu of presets.
  Presets ("hanging + shelves", "all drawers") are just starting lists.

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

* **Rules** (`validate.js`, pure, reporting `{ code, message, ref, blocking }`):
  * piece: sections sum to the inner width; each item stays inside its section; minimum gaps (shelf to shelf 18 cm,
    a long rail needs 150 cm of hanging height, a short one 95 cm, and drawers need their runner length); a drawer item
    behind a door needs one.
  * space: the piece is no wider than the wall width and no taller than the ceiling height (advice only).
  * Problems never block editing. They show as warnings on the step and in the quote. Only **Send to the workshop** asks
    the user to fix blocking ones first.

**Migration:** `migrate(v1)` turns a single-screen configurator design (an old `#design=` link) into pieces: each v1 module
becomes a piece, the v1 `interior` enum expands into an item list, and the room is dropped. Old share links keep working.

## 4. The steps in detail

| Step | Editor | Main interactions | Leaves the step when |
|---|---|---|---|
| 1 Furniture | Type cards, then a style panel, a short colour list and the size editor | Type → style (preset look) → optional colour and handles → size: standard sizes, 1 cm steps, and the optional space (with "Fit to the space") | Always. The piece is created |
| 2 Interior | Front elevation of the piece, doors hidden | Set the section count, drag dividers; drag items from a palette into a section; drag items up and down (snapping to 32 mm system holes); delete; apply a preset per section | Always |
| 3 Review | The pieces side by side in 3D plus a quote panel | Orbit and use preset views (all pieces, front of each piece); open doors; **Render** (progressive) then **Download PNG**; share link; print the quote; send to the workshop | (end) |

The chapter bar allows jumps backwards and forwards. Nothing is deleted silently.

## 5. The realistic render

**Choice: path tracing in the browser** with `three-gpu-pathtracer` 0.0.23 and `three-mesh-bvh` 0.8.3. Both
declare support for three 0.169, which the site already pins.

* The same studio and the same pieces as the live viewer (`studio.js`), plus:
  * the Poly Haven PBR textures from `tools/blender/` (oak, walnut, ash and birch veneer, plaster for the studio)
  * a product-shot light set: a big soft key light from the front left, a smaller fill from the right, and the
    `small_empty_room_3` HDRI for reflections and a little ambient light
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

`pricing.js` v2, pure and tested, works from the project:

* **Boards:** the cut list comes from each piece: carcass panels, section dividers, back, each shelf, drawer boxes
  and fronts. Area per material × price per m² × waste factor.
* **Hardware:** hinges (two or three per door, by height), runners per drawer, rails per metre, shoe racks,
  handles, LED per metre plus drivers.
* **Labour:** a base per piece type, plus time per item (each drawer and each door adds minutes).
* **Fitting:** per piece, by its width. There are no extras that depend on a room.
* **Totals:** design fee, VAT toggle, lead time = 4 weeks + workshop hours / 40.

Every line points back to a piece and item, so the quote can show "Wardrobe 1 › Section 2 › 3 drawers: €138".

## 7. Persistence and sharing

* Autosave to `localStorage` (`gj.project.v2`), debounced to 400 ms.
* Share link `#p=` is the pieces as JSON (no room, no placements), deflated with the built-in `CompressionStream` and
  base64url-encoded. Two furnished pieces make a link of about 900 characters. Older browsers get plain base64.
* Old `#p=` links (which also carry a room), `#design=` links from the first configurator, `configurator.html` and
  `contact.html` all land in the planner with their pieces.
* **Send to the workshop** opens the guided flow's contact question (switching to the guided view when the tabbed view is
  on). Nothing is sent; `contact.html` has no form and forwards old `#p=` links to the planner.

## 8. Files

```
site/planner.html                      the page (configurator.html redirects here)
site/js/planner/store.js               reducer, actions, undo/redo, persistence
site/js/planner/model.js       (pure)  types, defaults, presets, clamps, migrate(v1)
site/js/planner/validate.js    (pure)  piece and space rules
site/js/planner/pricing.js     (pure)  cut list and quote
site/js/planner/share.js       (pure)  encode/decode with compression
site/js/planner/fit.js         (pure)  does it fit the space, and "Fit to the space"
site/js/planner/studio.js      (pure)  where each piece stands in the studio; preset camera poses
site/js/planner/flow.js        (pure)  the guided questions
site/js/planner/geometry.js            the studio mesh; re-exports the piece builders
site/js/planner/viewer.js              live 3D view
site/js/planner/render.js, render-scene.js   path tracer, loaded on demand in the review
site/js/planner/steps/furniture.js, look-panel.js, interior.js, review.js, guided.js
tests/planner-*.test.mjs
```

`CONTRACTS.md` has the shapes, per the repo convention.

## 9. History

| Phase | Built |
|---|---|
| 1 | Model v2, validate, pricing v2, share v2, migrate(v1), tests |
| 2 | Planner shell, stepper, store; the live viewer |
| 3 | Furniture picker and interior editor |
| 4 | Review: quote panel, path-traced render, PNG, share, send to the form |
| 5 | Polish: phones, accessibility pass, performance budget, smoke tests |
| 6 | Guided question flow (section 11) |
| 7 | **Furniture only**: the room editor and the placement step were removed; pieces stand side by side in a studio; an optional space constraint with "Fit to the space" |

## 10. Trade-offs and what to revisit

* **No room.** The planner cannot catch a piece that blocks a door or a radiator, and cannot show it in the person's own
  room. The workshop measures anyway, and the optional wall width and ceiling height cover the most common mistake (a piece
  that is simply too big). If rooms ever come back they belong in a separate tool that reads the same pieces.
* **SVG editors vs. editing in 3D:** SVG is precise and accessible but less "magic". The 3D view stays live beside it.
* **Path tracing in the browser:** it's free and private but slow on weak devices. If it ever becomes a real product with
  real customers, a server render queue gives Blender quality on any device.
* **Interior as free items vs. presets:** items give full control. Presets keep it quick for most people, so both are offered.
* **Share links in the URL:** no backend, but a design with dozens of detailed pieces could pass about 8 KB, which some
  chat apps cut off. Revisit with a small storage service if that happens.

## 11. The guided question flow

The planner shows its three steps as **9 questions**, one per screen, by default. The tabbed view of section 4 stays as
**Edit everything** (a small link at the end of the chapter bar, remembered in `localStorage` under `gj.planner.view`).
Both views use the same store and the same step editors, so switching loses nothing.

| Chapter | Questions |
|---|---|
| Furniture | 1 What would you like us to build? (one tap creates the piece) · 2 Which look do you like best? · 3 Want to change the colour or handles? (optional, "More options" opens the full look panel) · 4 How big should it be? (standard sizes and your own size, plus the optional "How much space do you have?" with "Fit to the space") |
| Interior | 5 What should go inside? (a picture per preset, "Use your suggestion") · 6 Want to arrange it yourself? (optional, opens the interior editor). Skipped for a piece with no inside, such as a table. |
| Review | 7 Would you like anything else built? (the pieces with Edit and Remove, "Add another piece" goes back to 1) · 8 Here’s your furniture. (3D, a preset view per piece, Render, quote with the VAT switch, Download PNG, share link, print) · 9 Where should we send your design? (contact details; the site still sends nothing) |

The start screen offers **Start a new piece** (an empty project) and **Start from an example** (a wardrobe and a desk, both
furnished, no room).

* **Where the logic lives.** `flow.js` is pure and tested (`tests/planner-flow.test.mjs`): the question table, the order
  with the Interior skip, "Question 3 of 9" and "Question 2 of 4", where a saved project lands, the contact checks.
  `steps/guided.js` is the DOM part: it shows the sections of the existing editors that answer a question
  (`createTabs().showMany`), hides their tab bars and adds the type and preset cards, the short colour list, the pieces list
  and the contact form.
* **Landing.** A saved project or a share link with at least one piece opens on question 8 with every chapter marked done.
  The chapter bar is clickable for every chapter already reached.
* **One screen.** No question scrolls the page. Only a long list (the twelve looks, the full look panel, the quote) scrolls
  inside its own box. A phone gives the preview 16 to 42 percent of the height, depending on how much the question shows.
  The size question puts width, height and depth in one row and the standard sizes in a row that scrolls sideways, so the
  space boxes, the warning and "Fit to the space" stay in view.
* **The 3D view.** The Furniture and Interior questions show the piece being edited, alone in the studio; the Review
  questions show every piece side by side. The camera frames the set again when the view is resized, until the person
  moves it. Nothing keeps drawing while nothing changes.
* **Accessibility.** The question is the `h2` and takes focus; it starts with a visually hidden "Question 3 of 9: " and the
  live region says the same. Enter moves on when focus is on the question or on a radio card, never on a button.
* **Nothing about the project changes** because of the flow: no new action, no new field. The contact details are kept in
  memory only.
