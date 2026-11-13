# Mave Collection

_Rooted in elegance, designed to stand out._ Danfa, Accra.

Made-to-measure gowns, sewn to order. A single scrolling storefront where customers pick a design, send their measurements, and pay online (Ghana: mobile money / card, GHS).

## Run it

Static site, no build step:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Hero: the line-up

`index.html` (`#hero`) + `js/rail.js` + `css/rail.css`. One model is shown in full in the middle; the next dresses peek in, smaller and fainter, on either side. Move along with the arrows, the keyboard arrow keys, a swipe, or a tap on a neighbour. Under the model sit her name, price and the "View the dress" and "Get it tailored" buttons. A green band of text scrolls along the bottom. The menu sits top left, the logo in the middle, Shop and the cart on the right.

Every dress in `js/products.js` that has a `rail` image is in the line-up. To add one: put its photo in `assets/source/products/<id>.jpg`, add its crop line to `scripts/make_rail_cutouts.py` and run `python3 scripts/make_rail_cutouts.py <id>` (needs rembg). It cuts the whole model out and writes a transparent `assets/rail/<id>.webp`. Then set `rail: 'assets/rail/<id>.webp'` on the dress (`railScale` makes a photo that stops at the hips stand a little smaller).

## Shop and orders

`js/products.js` is the catalogue: add a dress by adding an object (name, price in GHS, lead time, photos). Shop photos are on a white background: put the original in `assets/source/products/` and run `python3 scripts/cutout_products.py <file>` (needs `pip install "rembg[cpu]"`) to get `assets/products/<file>.webp`. If a photo is small or soft, first run `python3 scripts/enhance_photo.py assets/source/originals/<file> RealESRGAN_x4plus.pth` (AI 4x upscale with Real-ESRGAN, weights from github.com/xinntao/Real-ESRGAN releases), then cut out the result. Leave `price` / `leadTime` as `null` and the card shows "Price on request" and no lead time.

"Get it tailored" (the closer look and the cards) open the order sheet (`js/shop.js`): details, measurements (inches, tailor-style, with range checks), style photos (up to 5, shrunk on the phone before upload) and a review step. A half-finished form is kept in the browser.

Each dress card has two buttons: **Add to cart** adds the ready-made dress to the cart (`js/cart.js`: choose a size, set the quantity, check out with name, phone and delivery address), and **Get it tailored** opens the made-to-measure sheet. A dress only gets the Add to cart button if `readyMade: true` in `js/products.js`; sizes and quantities come from the `product_stock` table in Supabase (see `supabase/README.md`, step 7); `RAPH_CONFIG.sizes` is only a fallback. The cart is kept in the browser.

**Order database.** Orders are sent to a Supabase function that validates them and saves them in a database (with style photos in private storage). The code and a step-by-step setup guide are in `supabase/` (`supabase/README.md`). Until `RAPH_CONFIG.orderEndpoint` in `js/products.js` is set to the function URL, orders are only saved in the customer's browser (`localStorage`, key `raph_orders`) and the confirmation screen says "Test mode".

## Dress page

Tapping a dress photo or name in the shop opens its page (`js/pdp.js`): photo gallery (drag the big photo to turn the dress), UK size, **Add to cart**, **Get it tailored**. Thumbnails come from `gallery` in `js/products.js`.

## Website address

The live address is https://www.mavecollections.com/ . It is used for the link-preview tags in `index.html` (`og:url`, `og:image`, `twitter:image`), `robots.txt` and `sitemap.xml`. If the domain ever changes, update those four places. WhatsApp and TikTok cache previews, so after changing the share image re-scrape it (Facebook Sharing Debugger works for WhatsApp too).

## Roadmap

- [x] Scroll hero
- [x] Shop grid and order sheet (details, measurements, style photos, review)
- [x] Cart for ready-made dresses
- [x] Dress page
- [ ] Real dress details: name, specs, price, lead time
- [x] Three more dresses (Ruby, Cocoa, Ivory)
- [x] Per-size stock for ready-made dresses (sold-out states, no overselling)
- [x] Delivery, payment and returns information ("Good to know" section), privacy notice (`privacy.html`) and consent tick-boxes
- [x] Spam protection with Cloudflare Turnstile (code ready; switch on with `supabase/README.md`, step 8)
- [ ] Real names and lead times for every dress
- [x] Order storage code (Supabase tables, storage, order function), tested locally
- [ ] Create the Supabase project and connect it (see `supabase/README.md`)
- [ ] Paystack checkout (mobile money + card)
- [x] Order emails to the team via Resend (code ready; needs the setup in `supabase/README.md`, step 6)
