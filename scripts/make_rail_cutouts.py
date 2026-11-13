#!/usr/bin/env python3
"""Cut each dress out for the homepage clothes rail (transparent WebP, the whole model).

    python3 scripts/make_rail_cutouts.py            # every dress listed below
    python3 scripts/make_rail_cutouts.py black-pearl

Needs `rembg` and Pillow. Reads assets/source/products/<id>.jpg, writes assets/rail/<id>.webp.
Crop lines are fractions of the photo height: (top, bottom). fade = soften the cut edge (top, bottom).
"""
import sys, pathlib
import numpy as np
from PIL import Image
from rembg import remove, new_session

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "assets/source/products", ROOT / "assets/rail"
# id: (top, bottom, fade_top, fade_bottom). Full length: the whole model, head to feet. Two photos stop at the hips,
# so their lower edge is softened instead of cut hard.
CROPS = {
    "royal-plum-set":              (0.0, 1.0, False, True),
    "ruby-luxe-statement-dress":   (0.0, 1.0, False, False),
    "luxe-silhouette-dress":       (0.0, 1.0, False, False),
    "duchess-navy-dress":          (0.0, 1.0, False, True),
    "turquoise-elegance-set":      (0.0, 1.0, False, False),
    "scarlett-slit-sleeve-dress":  (0.0, 1.0, False, False),
    "black-pearl":                 (0.0, 1.0, False, False),
    "zaria-luxe-corset-dress":     (0.0, 1.0, False, False),
    "luxe-tassel-midi-dress":      (0.0, 1.0, False, False),
}
# Parts of the backdrop or props that the cut-out keeps by mistake, as polygons in photo fractions (x, y): alpha is cleared inside.
# luxe-silhouette-dress: the orange chair behind the model.
CLEAR = {
    "luxe-silhouette-dress": [
        [(0.00, 0.520), (0.402, 0.520), (0.376, 0.625), (0.358, 0.762), (0.00, 0.762)],
        [(0.00, 0.762), (0.368, 0.762), (0.360, 1.00), (0.00, 1.00)],
        [(0.6125, 0.545), (1.00, 0.545), (1.00, 0.762), (0.6125, 0.762)],
        [(0.625, 0.762), (1.00, 0.762), (1.00, 0.905), (0.625, 0.905)],
    ],
}
H_OUT = 900
session = new_session("birefnet-general")
ids = [sys.argv[1]] if len(sys.argv) > 1 else list(CROPS)
OUT.mkdir(parents=True, exist_ok=True)
for pid in ids:
    top, bottom, ft, fb = CROPS[pid]
    img = Image.open(SRC / f"{pid}.jpg").convert("RGB")
    img.thumbnail((1400, 1800))
    cut = remove(img, session=session, post_process_mask=True)           # RGBA
    W, H = cut.size
    if pid in CLEAR:
        from PIL import ImageDraw
        m = Image.new("L", cut.size, 255)
        d = ImageDraw.Draw(m)
        for poly in CLEAR[pid]:
            d.polygon([(x * W, y * H) for x, y in poly], fill=0)
        cut.putalpha(Image.fromarray(np.minimum(np.array(cut.getchannel("A")), np.array(m))))
    y0, y1 = int(H * top), int(H * bottom)
    cut = cut.crop((0, y0, W, y1))
    a = np.array(cut)
    alpha = a[:, :, 3].astype(np.float32)
    h = alpha.shape[0]
    f = max(8, int(h * 0.05))
    if ft: alpha[:f] *= np.linspace(0, 1, f)[:, None]
    if fb: alpha[-f:] *= np.linspace(1, 0, f)[:, None]
    a[:, :, 3] = alpha.astype(np.uint8)
    cut = Image.fromarray(a, "RGBA")
    box = cut.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    cut = cut.crop(box)
    cut = cut.resize((round(cut.width * H_OUT / cut.height), H_OUT), Image.LANCZOS)
    cut.save(OUT / f"{pid}.webp", quality=88, method=6)
    print(pid, cut.size, flush=True)
