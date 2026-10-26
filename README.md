# Grain & Joint

A concept website for a fictional carpentry studio in Antwerp that makes built-in furniture: wardrobes, kitchens, wall units, desks, tables and window seats. The brand is invented. Plain HTML, CSS and ES modules in `site/`, no build step. Three.js, GSAP (with ScrollTrigger) and Lenis load from jsDelivr through an import map.

Run it with `python tools/dev_server.py` (serves `site/` on http://localhost:5174, or set `PORT`). See `CONTRACTS.md` for the data model and `CLAUDE.md` for conventions.

## Image credits

Every photograph is from [Unsplash](https://unsplash.com/) and used under the [Unsplash License](https://unsplash.com/license), except one oak scan from [Poly Haven](https://polyhaven.com/) (CC0). The same list is published on `site/credits.html`.

- Oak kitchen with island and tall appliance wall: photo by [Frames For Your Heart](https://unsplash.com/@framesforyourheart) on Unsplash (`photo-1512916194211-3f2b7f5f7de3`)
- Oak-veneer wardrobe doors: photo by [Rumman Amin](https://unsplash.com/@rumanamin) on Unsplash (`photo-1558997519-83ea9252edf8`)
- White staircase with a wicker bench: photo by [Francesca Tosolini](https://unsplash.com/@fromitaly) on Unsplash (`photo-1560185127-59e4420e2c93`)
- White library wall with open shelves: photo by [Pickawood](https://unsplash.com/@pickawood) on Unsplash (`photo-1593430980497-a817d32da543`)
- Wall-hung oak shelf and desk with chair: photo by [Jeffery Ho](https://unsplash.com/@jefferyho) on Unsplash (`photo-1597072689227-8882273e8f6a`)
- Oak kitchen run with tall cabinets: photo by [Sergei Sushchik](https://unsplash.com/@sergeisushchik) on Unsplash (`photo-1610733374054-59454fe657cd`)
- Dining table set with green chairs: photo by [Spacejoy](https://unsplash.com/@spacejoy) on Unsplash (`photo-1617806118233-18e1de247200`)
- Built-in bench beside a grey wardrobe wall: photo by [Bilal Mansuri](https://unsplash.com/@itsbilalmn) on Unsplash (`photo-1643949914877-b20f30792c1e`)
- Wardrobe with a dressing nook and round mirror: photo by [Billy Jo Catbagan](https://unsplash.com/@billy_sixteenstudio) on Unsplash (`photo-1672137233327-37b0c1049e77`)
- White hall wardrobe with shoe store: photo by [Pickawood](https://unsplash.com/@pickawood) on Unsplash (`photo-1683181181300-44c0c991a2cf`)
- Light timber desk under a sloping ceiling: photo by [Marko Lengyel](https://unsplash.com/@marko_lengyel) on Unsplash (`photo-1705417272217-490f4511abeb`)
- Pale sliding wardrobe doors on shelves: photo by [Alex Tyson](https://unsplash.com/@alextyson195) on Unsplash (`photo-1721901944646-8b7da57bea7e`)
- Oak table with X base and tall windows: photo by [Sanju Pandita](https://unsplash.com/@spxclicks) on Unsplash (`photo-1721989516850-a02c70e2fce3`)
- Oak-fronted wardrobe wall with mirrors: photo by [Lisa Anna](https://unsplash.com/@lisaanna195) on Unsplash (`photo-1722349674028-a148f4364e43`)
- Open oak wardrobe beside a bed: photo by [Alex Tyson](https://unsplash.com/@alextyson195) on Unsplash (`photo-1722650364570-90bf509d7dff`)
- Arched timber shelving bay: photo by [Raymond Yeung](https://unsplash.com/@optiny) on Unsplash (`photo-1746361747275-31c08d2c6d5e`)
- Desk beside a large window: photo by [Arthur Tseng](https://unsplash.com/@arthur3607) on Unsplash (`photo-1748566711619-a172ca8932ca`)
- Round walnut dining table: photo by [Jubéo Hernandez](https://unsplash.com/@youbeyo) on Unsplash (`photo-1749476101600-90b2eb7efa89`)
- Timber dining table corner and chair: photo by [Costa Live](https://unsplash.com/@vendedorescostalive) on Unsplash (`photo-1758977403865-f79e156415b3`)
- Window seat with cushions: photo by [Franco Debartolo](https://unsplash.com/@francotheshooter) on Unsplash (`photo-1776482128072-898fb8a242bd`)
- Sunlit workbench with wooden hand tools: photo by [HENG YIN](https://unsplash.com/@maple_yin) on Unsplash (`photo-1788296817269-8df0458ab799`)
- Floating oak wall cabinets and shelves (Wall units card): photo on [Unsplash](https://images.unsplash.com/photo-1594026112284-02bb6f3352fe) (`photo-1594026112284-02bb6f3352fe`)
- Oak and white kitchen with island and stools (Kitchens card): photo on [Unsplash](https://images.unsplash.com/photo-1600585152220-90363fe7e115) (`photo-1600585152220-90363fe7e115`)
- Built-in bench along a timber-clad wall (Window seats & nooks card): photo on [Unsplash](https://images.unsplash.com/photo-1600607687939-ce8a6c25118c) (`photo-1600607687939-ce8a6c25118c`)

### Materials page photos

The finish photos in `site/assets/materials/` (600 px WebP, metadata stripped, one per material id in `site/js/planner/materials.js`) show what the studio offers. Paints are one plaster photo tinted per colour, smoked oak is the oak photo graded darker, and the laminates are matte stand-in surfaces, so they show texture rather than an exact match. Credits:

- White plaster wall texture: photo by [Augustine Wong](https://unsplash.com/@augustinewong) on Unsplash (https://unsplash.com/photos/white-plaster-wall-texture-kTg4NXEmfs8). Materials page: one plaster photo, tinted for each paint colour (Chalk white, Pebble grey, Sand, Sage, Dark green, Ink blue, Clay, Black, Neutral white matte base (for CSS/canvas tint)).
- Light oak wood plank texture background: photo by [simon](https://unsplash.com/@simon_berger) on Unsplash (https://unsplash.com/photos/light-oak-wood-plank-texture-background-JH_R66BihvA). Materials page: Natural oak. The same photo, graded dark brown, is Smoked oak (derived).
- Close-up of dark wood grain: photo by [The Cleveland Museum of Art](https://unsplash.com/@clevelandart) on Unsplash (https://unsplash.com/photos/KKKHaEA4coc). Materials page: Walnut. Real dark wood grain, slightly graded toward #6b4a36; species not stated on page, reads as walnut.
- Light brown wood grain texture background: photo by [Compagnons](https://unsplash.com/@sigmund) on Unsplash (https://unsplash.com/photos/light-brown-wood-grain-texture-background-2ZX2HqdxcC8). Materials page: Pale ash. Pale straight-grained board, graded toward #d9c7a3; species not stated on page.
- A stack of wooden boards stacked on top of each other: photo by [Tim Meyer](https://unsplash.com/@tim_meijer) on Unsplash (https://unsplash.com/photos/a-stack-of-wooden-boards-stacked-on-top-of-each-other-NDQIHPA9Iv0). Materials page: Birch plywood (exposed edge). Clean layered edges of curved pale birch-like sheets; not a flat plywood edge, possibly a render (tags mention render).
- Dark textured plaster wall: photo by [Annie Spratt](https://unsplash.com/@anniespratt) on Unsplash (https://unsplash.com/photos/dark-textured-plaster-wall-6a3nqQ1YwBw). Materials page: Black laminate. Stand-in: matte near-black surface, desaturated. Not literally laminate.
- Monochrome concrete wall: photo by [Yan Ots](https://unsplash.com/@yanots) on Unsplash (https://unsplash.com/photos/UuBR5kbvt4Y). Materials page: Light grey laminate. Stand-in: matte light grey concrete-look surface. Matte stand-in, not a real laminate sample.
- A close up of a white marble surface: photo by [Augustine Wong](https://unsplash.com/@augustinewong) on Unsplash (https://unsplash.com/photos/a-close-up-of-a-white-marble-surface-li0iC0rjvvg). Materials page: White quartz. White marble slab; marble-look quartz.
- A close up of a black marble surface: photo by [Kanishk Jain](https://unsplash.com/@kanishkjain_123) on Unsplash (https://unsplash.com/photos/OQDOskPJEMY). Materials page: Honed black stone. Dark grey-black stone with fine light vein; replaces the white-veined marble.
- Close-up of gray concrete: photo by [Annie Spratt](https://unsplash.com/@anniespratt) on Unsplash (https://unsplash.com/photos/ctXf1GVyf9A). Materials page: Matt laminate (grey). Stand-in: grey concrete-look surface, desaturated and set to about #8d8e8c. Matte stand-in, not a real laminate sample.
- Arched black cabinet with glass doors: photo by [Franco Debartolo](https://unsplash.com/@francotheshooter) on Unsplash (https://unsplash.com/photos/POcDzpLZnB8). Materials page: Clear glass. Clear glass cabinet door with black frame, oak shelves behind.
- Black glass cabinet displaying decorative vases and artwork: photo by [Franco Debartolo](https://unsplash.com/@francotheshooter) on Unsplash (https://unsplash.com/photos/ZdPylmn6gBc). Materials page: Grey-tinted glass. Dark-glazed glass cabinet door; real tinted-look glass, contents visible.
- A close up of a metal object on a table: photo by [Zain Khan](https://unsplash.com/@aabedeen51) on Unsplash (https://unsplash.com/photos/a-close-up-of-a-metal-object-on-a-table-OO_2w0sJD3A). Materials page: Brass. Brushed brass cabinet pulls.
- Black handrail casting a shadow on a white wall: photo by [Alexander Van Steenberge](https://unsplash.com/@lexerium) on Unsplash (https://unsplash.com/photos/9vKF96cs7KU). Materials page: Black handle. Plain matte black round bar on a wall bracket (a handrail, closest plain black bar found).
- Brushed metal surface with light reflection: photo by [apryan widodo](https://unsplash.com/@apryan_cahyo) on Unsplash (https://unsplash.com/photos/brushed-metal-surface-with-light-reflection-tRrIXmtOmL4). Materials page: Brushed steel. 
- Oak Wood Planks: scan from [Poly Haven](https://polyhaven.com/) (CC0) (https://polyhaven.com/a/oak_wood_planks). Materials page: Oak handle finish. Oak grain stand-in; no turned-oak handle photo found.

### 3D textures

The planner's stock range (paints, veneers, worktops, glass, handle finishes) is one data table, `site/js/planner/materials.js`; the pickers, the 3D, the render and the quote all read it. The planner's realistic render (`site/assets/planner-tex/`, loaded only when someone presses Render in the review) uses CC0 textures from Poly Haven, resized to 1k or 512 px JPEGs: [oak_veneer_01](https://polyhaven.com/a/oak_veneer_01), [walnut_veneer](https://polyhaven.com/a/walnut_veneer), [ash_veneer](https://polyhaven.com/a/ash_veneer), [white_oak_veneer](https://polyhaven.com/a/white_oak_veneer) (also brightened for birch plywood and pale ash boards) and [white_plaster_02](https://polyhaven.com/a/white_plaster_02) (the studio backdrop), with the same [small_empty_room_3](https://polyhaven.com/a/small_empty_room_3) HDRI as daylight.

The Home hero's wardrobe and room (`site/assets/3d/`, built with `tools/blender/`) use CC0 assets from [Poly Haven](https://polyhaven.com/): [oak_veneer_01](https://polyhaven.com/a/oak_veneer_01), [white_oak_veneer](https://polyhaven.com/a/white_oak_veneer), [laminate_floor_02](https://polyhaven.com/a/laminate_floor_02), [white_plaster_02](https://polyhaven.com/a/white_plaster_02) and the [small_empty_room_3](https://polyhaven.com/a/small_empty_room_3) HDRI. The rendered hero room is furnished with Poly Haven models and textures: potted_plant_01, potted_plant_02, potted_plant_04, side_table_01, ceramic_vase_01, hanging_picture_frame_01 (with a generated print), mid_century_lounge_chair and the hessian_230 texture for the rug.
