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
    id: 'ivory-ombre-drape',
    name: 'The Ivory Ombré Drape',
    readyMade: true,
    price: 3000,
    leadTime: null,
    images: ['assets/products/ivory-ombre-drape.webp'],
  },
  {
    id: 'royal-plum-set',
    name: 'Royal Plum Set',
    readyMade: true,
    price: 300,
    leadTime: null,
    images: ['assets/products/royal-plum-set.webp'],
  },
  {
    id: 'ruby-luxe-statement-dress',
    name: 'Ruby Luxe Statement Dress',
    readyMade: true,
    price: 270,
    leadTime: null,
    images: ['assets/products/ruby-luxe-statement-dress.webp'],
  },
  {
    id: 'luxe-silhouette-dress',
    name: 'Luxe Silhouette Dress',
    readyMade: true,
    price: 250,
    leadTime: null,
    images: ['assets/products/luxe-silhouette-dress.webp'],   // original studio background kept, as the owner asked
  },
  {
    id: 'duchess-navy-dress',
    name: 'Duchess Navy Dress',
    readyMade: true,
    price: 290,
    leadTime: null,
    images: ['assets/products/duchess-navy-dress.webp'],   // original studio background kept
  },
  {
    id: 'turquoise-elegance-set',
    name: 'Turquoise Elegance Set',
    readyMade: true,
    price: 350,
    leadTime: null,
    images: ['assets/products/turquoise-elegance-set.webp'],   // original studio background kept
  },
  {
    id: 'scarlett-slit-sleeve-dress',
    name: 'Scarlett Slit Sleeve Dress',
    readyMade: true,
    price: 250,
    leadTime: null,
    images: ['assets/products/scarlett-slit-sleeve-dress.webp'],   // original studio background kept
  },
  {
    id: 'black-pearl',
    name: 'Black Pearl',
    readyMade: true,
    price: 250,
    leadTime: null,
    images: ['assets/products/black-pearl.webp'],   // original studio background kept
  },
  {
    id: 'cafe-creme-set',
    name: 'Café Crème Set',
    readyMade: false,        // made to order; price on request until the owner sets one
    price: null,
    leadTime: null,
    images: ['assets/products/cafe-creme-set.webp'],
  },
  {
    id: 'cocoa-tassel-dress',
    name: 'Cocoa Tassel Dress',
    readyMade: false,
    price: null,
    leadTime: null,
    images: ['assets/products/cocoa-tassel-dress.webp'],
  },
];

window.RAPH_CONFIG = {
  currency: 'GHS',
  // Fallback sizes, used only until/unless stock can be loaded. The real list (and how many of each are left)
  // comes from the product_stock table in Supabase; see supabase/README.md.
  sizes: ['UK 8', 'UK 10', 'UK 12', 'UK 14', 'UK 16', 'UK 18', 'UK 20', 'UK 22'],
  // Where finished orders are sent: the Supabase Edge Function URL, e.g.
  //   https://<project-ref>.supabase.co/functions/v1/<function-slug>
  // (the slug in the address is the one on the function's Overview tab; it can differ from the name
  // in the dashboard heading). See supabase/README.md. While this is null, orders are only saved in the browser they were made
  // in, and the confirmation screen says so.
  // Cloudflare Turnstile site key (public) for spam protection; see supabase/README.md step 8. null = off.
  turnstileSiteKey: '0x4AAAAAAFx3hp_-DMaQ3Ru7',
  orderEndpoint: 'https://ploapqarddqvqooxkiut.supabase.co/functions/v1/clever-processor',
};
