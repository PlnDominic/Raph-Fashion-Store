// The shop catalogue. Add a dress by adding an object here; the shop grid is built from this list.
//
//   id        short, unique, lowercase with dashes
//   name      shown on the card and in the order
//   readyMade true if a finished dress can be bought straight away (adds an "Add to cart" button)
//   price     number in GHS, or null to show "Price on request"
//   leadTime  e.g. "3 to 4 weeks", or null to hide it
//   images    photos for the card (first one is the main photo; drag across the card to flick through the rest)
//   gallery   photos shown as thumbnails on the dress page (defaults to `images`)
//   rail      cut-out for the homepage clothes rail (made by scripts/make_rail_cutouts.py); leave out to keep a dress off the rail
//   spin      optional photo sequence the dress page turns through when the big photo is dragged
//
// Shop photos live in assets/products/. Put the original in assets/source/products/ and run
// scripts/cutout_products.py to get a white-background version the same shape as the others.

window.PRODUCTS = [
  {
    id: 'royal-plum-set',
    rail: 'assets/rail/royal-plum-set.webp',
    railScale: 0.7,        // this photo stops at the hips, so it stands a little smaller in the line-up
    name: 'Royal Plum Set',
    readyMade: true,
    price: 300,
    leadTime: null,
    images: ['assets/products/royal-plum-set.webp'],   // original background kept
  },
  {
    id: 'ruby-luxe-statement-dress',
    rail: 'assets/rail/ruby-luxe-statement-dress.webp',
    name: 'Ruby Luxe Statement Dress',
    readyMade: true,
    price: 270,
    leadTime: null,
    images: ['assets/products/ruby-luxe-statement-dress.webp'],   // original background kept
  },
  {
    id: 'luxe-silhouette-dress',
    rail: 'assets/rail/luxe-silhouette-dress.webp',
    name: 'Luxe Silhouette Dress',
    readyMade: true,
    price: 250,
    leadTime: null,
    images: ['assets/products/luxe-silhouette-dress.webp'],   // original studio background kept, as the owner asked
  },
  {
    id: 'duchess-navy-dress',
    rail: 'assets/rail/duchess-navy-dress.webp',
    railScale: 0.7,        // this photo stops at the hips, so it stands a little smaller in the line-up
    name: 'Duchess Navy Dress',
    readyMade: true,
    price: 290,
    leadTime: null,
    images: ['assets/products/duchess-navy-dress.webp'],   // original studio background kept
  },
  {
    id: 'turquoise-elegance-set',
    rail: 'assets/rail/turquoise-elegance-set.webp',
    name: 'Turquoise Elegance Set',
    readyMade: true,
    price: 350,
    leadTime: null,
    images: ['assets/products/turquoise-elegance-set.webp'],   // original studio background kept
  },
  {
    id: 'scarlett-slit-sleeve-dress',
    rail: 'assets/rail/scarlett-slit-sleeve-dress.webp',
    name: 'Scarlett Slit Sleeve Dress',
    readyMade: true,
    price: 250,
    leadTime: null,
    images: ['assets/products/scarlett-slit-sleeve-dress.webp'],   // original studio background kept
  },
  {
    id: 'black-pearl',
    rail: 'assets/rail/black-pearl.webp',
    name: 'Black Pearl',
    readyMade: true,
    price: 250,
    leadTime: null,
    images: ['assets/products/black-pearl.webp'],   // original studio background kept
  },
  {
    id: 'zaria-luxe-corset-dress',
    rail: 'assets/rail/zaria-luxe-corset-dress.webp',
    name: 'The Zaria Luxe Corset Dress',
    readyMade: true,
    price: 270,
    leadTime: null,
    images: ['assets/products/zaria-luxe-corset-dress.webp'],   // original studio background kept
  },
  {
    id: 'luxe-tassel-midi-dress',
    rail: 'assets/rail/luxe-tassel-midi-dress.webp',
    name: 'The Luxe Tassel Midi Dress',
    readyMade: true,
    price: 270,
    leadTime: null,
    images: ['assets/products/luxe-tassel-midi-dress.webp'],   // original studio background kept
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
