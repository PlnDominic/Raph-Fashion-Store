# Raff Fashion Store

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

1. Put the new Flow video in `assets/source/`.
2. Run `./scripts/extract-hero-frames.sh <video> full 0 16` (use a panel number 0-3 instead of `full` for a 4-up grid like the current source).
3. Update `data-frames` on `#hero` in `index.html` to the frame count the script prints.

## Roadmap

- [x] Scroll hero
- [ ] Collection of dresses
- [ ] Measurement form with style-reference uploads
- [ ] Paystack checkout (mobile money + card)
- [ ] Order storage and admin view
- [ ] Order emails (on hold)
