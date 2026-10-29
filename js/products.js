// The shop catalogue. Add a dress by adding an object here; the shop grid is built from this list.
//
//   id        short, unique, lowercase with dashes
//   name      shown on the card and in the order
//   readyMade true if a finished dress can be bought straight away (adds an "Add to cart" button)
//   price     number in GHS, or null to show "Price on request"
//   leadTime  e.g. "3 to 4 weeks", or null to hide it
//   images    photos for the card (first one is the main photo; drag across the card to flick through the rest)
//   gallery   photos shown as thumbnails on the dress page (defaults to `images`)
//   spin      optional photo sequence the dress page turns through when the big photo is dragged
//
// Shop photos live in assets/products/. Put the original in assets/source/products/ and run
// scripts/cutout_products.py to get a white-background version the same shape as the others.
const heroFrame = (n) => `assets/hero-frames/${String(n).padStart(4, '0')}.webp`;

window.PRODUCTS = [
  {
    id: 'sunset-kente-mermaid',
    name: 'The Sunset Kente Mermaid',
    readyMade: true,
    price: 4800,
    leadTime: null,
    images: [1, 17, 33, 49, 65, 81, 97, 113].map(heroFrame),
    gallery: [1, 25, 61, 89].map(heroFrame),
    spin: Array.from({ length: 32 }, (_, i) => heroFrame(1 + i * 4)),
  },
  {
    id: 'ruby-kente-mermaid',
    name: 'The Ruby Kente Mermaid',
    readyMade: true,
    price: 4000,
    leadTime: null,
    images: ['assets/products/ruby-kente-mermaid.webp'],
  },
  {
    id: 'cocoa-kente-gown',
    name: 'The Cocoa Kente Gown',
    readyMade: true,
    price: 4500,
    leadTime: null,
    images: ['assets/products/cocoa-kente-gown.webp'],
  },
  {
    id: 'ivory-ombre-drape',
    name: 'The Ivory Ombré Drape',
    readyMade: true,
    price: 3000,
    leadTime: null,
    images: ['assets/products/ivory-ombre-drape.webp'],
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
