# Raph Fashion Store

Made-to-measure gowns, sewn to order. A single scrolling storefront where customers pick a design, send their measurements, and pay online (Ghana: mobile money / card, GHS).

## Run it

Static site, no build step:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Hero

`index.html` + `js/hero.js` + `css/style.css`. The hero pins to the screen and scrolling plays a frame sequence of the dress turning (`assets/hero-frames/`). Text beats fade in and out at set scroll points (`data-from` / `data-to` on each `.beat`, 0 to 1).

### Changing the hero video

The hero expects a clip of the model on a plain white studio backdrop (generated in Google Flow).

1. Put the new video at `assets/source/hero.mp4`.
2. Run `python3 scripts/extract_hero_frames.py` (needs ffmpeg, Pillow, numpy). It whitens the backdrop, crops each frame to follow the model, and writes WebP frames to `assets/hero-frames/`.
3. Set `data-frames` on `#hero` in `index.html` to the frame count the script prints.

## Shop and orders

`js/products.js` is the catalogue: add a dress by adding an object (name, blurb, price in GHS, lead time, photos). Leave `price` / `leadTime` as `null` and the card shows "Price on request" and no lead time.

"Get it tailored" (hero and cards) open the order sheet (`js/shop.js`): details, measurements (cm or in, with range checks), style photos (up to 5, shrunk on the phone before upload) and a review step. A half-finished form is kept in the browser.

Each dress card has two buttons: **Add to cart** adds the ready-made dress to the cart (`js/cart.js`: choose a size, set the quantity, check out with name, phone and delivery address), and **Get it tailored** opens the made-to-measure sheet. A dress only gets the Order button if `readyMade: true` in `js/products.js`; sizes come from `RAPH_CONFIG.sizes`. The cart is kept in the browser.

**Orders are not delivered anywhere yet.** `RAPH_CONFIG.orderEndpoint` in `js/products.js` is `null`, so a placed order is only saved in that browser (`localStorage`, key `raph_orders`; cart orders have `type: "ready-made"`) and the confirmation screen says "Test mode". Set it to a URL that accepts a multipart POST (`order` = JSON, `photos` = the images) once the backend exists.

## Roadmap

- [x] Scroll hero
- [x] Shop grid and order sheet (details, measurements, style photos, review)
- [x] Cart for ready-made dresses
- [ ] Real dress details: name, specs, price, lead time
- [ ] More dresses in the collection
- [ ] Order storage (database + photo storage) and a team view of incoming orders
- [ ] Paystack checkout (mobile money + card)
- [ ] Order emails (on hold)
