# Grain & Joint

A concept website for a fictional carpentry studio in Antwerp that makes built-in furniture: wardrobes, kitchens, wall units, desks, tables and window seats. The brand is invented. Plain HTML, CSS and ES modules in `site/`, no build step. Three.js, GSAP (with ScrollTrigger) and Lenis load from jsDelivr through an import map.

Run it with `python tools/dev_server.py` (serves `site/` on http://localhost:5174, or set `PORT`). See `CONTRACTS.md` for the data model and `CLAUDE.md` for conventions.

## Image credits

Every photograph is from [Unsplash](https://unsplash.com/) and used under the [Unsplash License](https://unsplash.com/license). The same list is published on `site/credits.html`.

- Oak kitchen with island and tall appliance wall: photo by [Frames For Your Heart](https://unsplash.com/@framesforyourheart) on Unsplash (`photo-1512916194211-3f2b7f5f7de3`)
- Oak-veneer wardrobe doors: photo by [Rumman Amin](https://unsplash.com/@rumanamin) on Unsplash (`photo-1558997519-83ea9252edf8`)
- White staircase with a wicker bench: photo by [Francesca Tosolini](https://unsplash.com/@fromitaly) on Unsplash (`photo-1560185127-59e4420e2c93`)
- White library wall with open shelves: photo by [Pickawood](https://unsplash.com/@pickawood) on Unsplash (`photo-1593430980497-a817d32da543`)
- Wall-hung oak shelf and desk with chair: photo by [Jeffery Ho](https://unsplash.com/@jefferyho) on Unsplash (`photo-1597072689227-8882273e8f6a`)
- Oak kitchen run with tall cabinets: photo by [Sergei Sushchik](https://unsplash.com/@sergeisushchik) on Unsplash (`photo-1610733374054-59454fe657cd`)
- Dining table set with green chairs: photo by [Spacejoy](https://unsplash.com/@spacejoy) on Unsplash (`photo-1617806118233-18e1de247200`)
- Built-in bench beside a grey wardrobe wall: photo by [Bilal Mansuri](https://unsplash.com/@itsbilalmn) on Unsplash (`photo-1643949914877-b20f30792c1e`)
- Weathered timber boards with deep grain: photo by [engin akyurt](https://unsplash.com/@enginakyurt) on Unsplash (`photo-1644931551533-02906718127f`)
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

### 3D textures

The planner's realistic render (`site/assets/planner-tex/`, loaded only when someone presses Render on step 5) uses CC0 textures from Poly Haven, resized to 1k or 512 px JPEGs: [oak_veneer_01](https://polyhaven.com/a/oak_veneer_01), [walnut_veneer](https://polyhaven.com/a/walnut_veneer), [ash_veneer](https://polyhaven.com/a/ash_veneer), [white_oak_veneer](https://polyhaven.com/a/white_oak_veneer) (also brightened for birch plywood and pale ash boards), [laminate_floor_02](https://polyhaven.com/a/laminate_floor_02), [concrete_floor_02](https://polyhaven.com/a/concrete_floor_02), [large_floor_tiles_02](https://polyhaven.com/a/large_floor_tiles_02) and [white_plaster_02](https://polyhaven.com/a/white_plaster_02), with the same [small_empty_room_3](https://polyhaven.com/a/small_empty_room_3) HDRI as daylight.

The Home hero's wardrobe and room (`site/assets/3d/`, built with `tools/blender/`) use CC0 assets from [Poly Haven](https://polyhaven.com/): [oak_veneer_01](https://polyhaven.com/a/oak_veneer_01), [white_oak_veneer](https://polyhaven.com/a/white_oak_veneer), [laminate_floor_02](https://polyhaven.com/a/laminate_floor_02), [white_plaster_02](https://polyhaven.com/a/white_plaster_02) and the [small_empty_room_3](https://polyhaven.com/a/small_empty_room_3) HDRI. The rendered hero room is furnished with Poly Haven models and textures: potted_plant_01, potted_plant_02, potted_plant_04, side_table_01, ceramic_vase_01, hanging_picture_frame_01 (with a generated print), mid_century_lounge_chair and the hessian_230 texture for the rug.
