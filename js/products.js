// The shop catalogue. Add a dress by adding an object here; the shop grid is built from this list.
//
//   id        short, unique, lowercase with dashes
//   name      shown on the card and in the order
//   readyMade true if a finished dress can be bought straight away (adds an "Add to cart" button)
//   price     number in GHS, or null to show "Price on request"
//   leadTime  e.g. "3 to 4 weeks", or null to hide it
//   frames    which hero frames (1-128) to use as the card photos; scroll/drag over the card to turn the dress
//   gallery   frames shown as thumbnails on the dress page (front, side, back, ...)
//   spin      true if the dress page can turn through the full hero sequence when dragged
//
// Photos come from assets/hero-frames/. For new dresses add a folder of photos and point `images` at it instead.
window.PRODUCTS = [
  {
    id: 'sunset-kente-mermaid',
    name: 'The Sunset Kente Mermaid',
    readyMade: true,
    price: null,
    leadTime: null,
    frames: [1, 17, 33, 49, 65, 81, 97, 113],
    gallery: [1, 25, 61, 89],
    spin: true,
  },
];

window.RAPH_CONFIG = {
  currency: 'GHS',
  // sizes offered when buying a ready-made dress
  sizes: ['UK 8', 'UK 10', 'UK 12', 'UK 14', 'UK 16', 'UK 18'],
  // Where finished orders are sent (POST, multipart form). While this is null, orders are only
  // saved in the browser they were made in, and the confirmation screen says so.
  orderEndpoint: null,
};
