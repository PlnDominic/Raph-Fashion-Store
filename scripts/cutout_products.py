#!/usr/bin/env python3
"""Put shop photos on a pure white background, framed like the hero frames.

    python3 scripts/cutout_products.py            # every photo in assets/source/products/
    python3 scripts/cutout_products.py name.png   # just one

Needs `rembg` (pip install "rembg[cpu]") and Pillow. Output: assets/products/<name>.webp
"""
import sys, pathlib
import numpy as np
from PIL import Image, ImageFilter
from rembg import remove, new_session

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "assets/source/products", ROOT / "assets/products"
ASPECT, OUT_H, MARGIN = 0.62, 1000, 1.08     # same shape as the hero frames, a little bigger for detail

session = new_session(sys.argv[2] if len(sys.argv) > 2 else "birefnet-general")
files = [SRC / sys.argv[1]] if len(sys.argv) > 1 and sys.argv[1] != "all" else sorted(p for p in SRC.iterdir() if p.is_file())
OUT.mkdir(parents=True, exist_ok=True)

for f in files:
    img = Image.open(f).convert("RGB")
    cut = remove(img, session=session, post_process_mask=True)          # RGBA
    a = np.array(cut.getchannel("A"))
    ys, xs = np.where(a > 24)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    h = max((y1 - y0) * MARGIN, (x1 - x0) * MARGIN / ASPECT)
    w = h * ASPECT
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    box = tuple(int(round(v)) for v in (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2))
    white = Image.new("RGBA", cut.size, (255, 255, 255, 255))
    white.alpha_composite(cut)
    canvas = Image.new("RGB", (box[2] - box[0], box[3] - box[1]), (255, 255, 255))
    canvas.paste(white.convert("RGB").crop((max(box[0], 0), max(box[1], 0), min(box[2], cut.width), min(box[3], cut.height))),
                 (max(-box[0], 0), max(-box[1], 0)))
    out = canvas.resize((round(OUT_H * ASPECT), OUT_H), Image.LANCZOS)
    out.save(OUT / (f.stem + ".webp"), quality=86, method=6)
    print(f"{f.name} -> {f.stem}.webp")
