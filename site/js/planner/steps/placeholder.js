// Steps 2 to 5 are built in later phases. Until then each shows what it will do, so the stepper already works.
const COPY = {
  furniture: {
    title: 'Furniture',
    lede: 'Pick what you want built, choose its look and set its size.',
    points: ['Wardrobes, kitchens, wall units, desks, tables and window seats', 'A style for fronts, handles, plinth and materials', 'Width, height and depth within sensible limits']
  },
  interior: {
    title: 'Interior',
    lede: 'Lay out the inside of the piece, bay by bay.',
    points: ['Shelves, rails, drawers, shoe racks, baskets, mirrors and lighting', 'Drag items to any height, snapped to the 32 mm system', 'Presets to start from, then change anything']
  },
  place: {
    title: 'Place',
    lede: 'Put the piece in your room.',
    points: ['Snaps to a wall and stays clear of doors, windows and radiators', 'Corner and free-standing placement', 'Add another piece, or edit a placed one']
  },
  review: {
    title: 'Review',
    lede: 'Walk around the finished room and see the price.',
    points: ['A realistic render of the room', 'An itemised quote with every material and fitting', 'Share a link, print the quote or send it to the workshop']
  }
};

export function createPlaceholderStep(root, id, index) {
  const c = COPY[id];
  root.innerHTML = `
    <section class="pl-sec" aria-labelledby="pl-h-${id}">
      <header class="pl-sec__head">
        <p class="eyebrow">Step ${index + 1} of 5</p>
        <h2 id="pl-h-${id}">${c.title}</h2>
        <p class="pl-lede">${c.lede}</p>
      </header>
      <div class="pl-soon">
        <p class="pl-soon__tag">Coming next</p>
        <p class="pl-soon__text">This step is not open yet. Your room is saved, and you can go back to it at any time.</p>
        <ul class="pl-soon__list">${c.points.map((p) => `<li>${p}</li>`).join('')}</ul>
      </div>
    </section>`;
  return { update() {}, show() {} };
}
