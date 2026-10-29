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

## Roadmap

- [x] Scroll hero
- [ ] Collection of dresses
- [ ] Measurement form with style-reference uploads
- [ ] Paystack checkout (mobile money + card)
- [ ] Order storage and admin view
- [ ] Order emails (on hold)
