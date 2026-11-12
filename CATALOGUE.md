# Mave Collection catalogue: names and prices

The single record of what each dress is called and what it costs (GHS), as given by the owner on WhatsApp.
The live source for the shop is `js/products.js`. Keep the two in step.

## Removed from the shop (owner's request)
The Sunset Kente Mermaid (4,800), The Ruby Kente Mermaid (4,000), The Cocoa Kente Gown (4,500) and The Ivory Ombré Drape (3,000).
Their stock rows may still exist in Supabase (`product_stock`); they are harmless and no longer shown.
The Sunset Kente dress still appears in the homepage scroll animation (the hero video), but it is no longer sold.

## Workwear collection (from the owner's WhatsApp list, by photo file name)
| Photo file | Name | Price | On the site? | id |
|---|---|---|---|---|
| 1-8.JPG (lavender top, plum skirt) | Royal Plum Set | 300 | yes | royal-plum-set |
| 2(2).JPG (purple dress, big collar; also 2(3), 2(4), 2(4)(2), 2(4)(3)) | Ruby Luxe Statement Dress | 270 | yes | ruby-luxe-statement-dress |
| 3(14)(1).JPG (orange dress, slit; also 3(14)) | Luxe Silhouette Dress | 250 | yes (original background kept, by the owner's request) | luxe-silhouette-dress |
| 3(9).JPG (navy dress, brown waist and cuffs) | Duchess Navy Dress | 290 | yes (original background kept) | duchess-navy-dress |
| 2(5).JPG (turquoise top and trousers; also 2(6)) | Turquoise Elegance Set | 350 | yes (original background kept) | turquoise-elegance-set |
| 2(7).JPG (red dress, slit sleeves) | Scarlett Slit Sleeve Dress | 250 | yes (original background kept) | scarlett-slit-sleeve-dress |
| 3(4).JPG (black flared dress; also 3(2), 3(8)) | Black Pearl | 250 | yes (original background kept) | black-pearl |

## Named by the owner after first being named by Claude
| Photo file | Name | Price | On the site? | id |
|---|---|---|---|---|
| 1.JPG (cream blouse, brown skirt) | The Zaria Luxe Corset Dress | 270 | yes (original background kept; named by the owner) | zaria-luxe-corset-dress |
| 1-6.JPG (cream long-sleeve dress, brown tassels) | The Luxe Tassel Midi Dress | 270 | yes (original background kept; named by the owner) | luxe-tassel-midi-dress |

## Adding a dress
1. Put the original photo in `assets/source/products/<id>.jpg`.
2. Run `python3 scripts/cutout_products.py <id>.jpg` (white background, same shape as the others).
3. Add it to `js/products.js`, and run a stock SQL insert like `supabase/migrations/20261107000000_royal_plum_stock.sql` for its sizes.
