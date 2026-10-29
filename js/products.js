// The shop catalogue. Add a dress by adding an object here; the shop grid is built from this list.
//
//   id        short, unique, lowercase with dashes
//   name      shown on the card and in the order
//   blurb     one or two lines under the name
//   price     number in GHS, or null to show "Price on request"
//   leadTime  e.g. "3 to 4 weeks", or null to hide it
//   frames    which hero frames (1-128) to use as the card photos; scroll/drag over the card to turn the dress
//
// Photos come from assets/hero-frames/. For new dresses add a folder of photos and point `images` at it instead.
window.PRODUCTS = [
  {
    id: 'sunset-kente-mermaid',
    name: 'The Sunset Kente Mermaid',
    blurb: 'Hand-beaded corset bodice, sculpted shoulder and a kente-print train, finished with a matching beaded fan.',
    price: null,
    leadTime: null,
    frames: [1, 17, 33, 49, 65, 81, 97, 113],
  },
];

window.RAPH_CONFIG = {
  currency: 'GHS',
  // Where finished orders are sent (POST, multipart form). While this is null, orders are only
  // saved in the browser they were made in, and the confirmation screen says so.
  orderEndpoint: null,
};
