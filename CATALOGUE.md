# Mave Collection catalogue: names and prices

The single record of what each dress is called and what it costs (GHS), as given by the owner on WhatsApp.
The live source for the shop is `js/products.js`. Keep the two in step.

## Earlier dresses (kente collection)
| Name | Price | id |
|---|---|---|
| The Sunset Kente Mermaid | 4,800 | sunset-kente-mermaid |
| The Ruby Kente Mermaid | 4,000 | ruby-kente-mermaid (name still to confirm) |
| The Cocoa Kente Gown | 4,500 | cocoa-kente-gown (name still to confirm) |
| The Ivory Ombré Drape | 3,000 | ivory-ombre-drape (name still to confirm) |

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

## Named by Claude (the owner gave no name or price: change freely)
| Photo file | Name | Price | On the site? | id |
|---|---|---|---|---|
| 1.JPG (cream blouse, brown skirt) | Café Crème Set | price on request | yes, order-to-measure only | cafe-creme-set |
| 1-6.JPG (cream long-sleeve dress, brown tassels) | Cocoa Tassel Dress | price on request | yes, order-to-measure only | cocoa-tassel-dress |

## Adding a dress
1. Put the original photo in `assets/source/products/<id>.jpg`.
2. Run `python3 scripts/cutout_products.py <id>.jpg` (white background, same shape as the others).
3. Add it to `js/products.js`, and run a stock SQL insert like `supabase/migrations/20261107000000_royal_plum_stock.sql` for its sizes.
