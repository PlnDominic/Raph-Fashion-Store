#!/usr/bin/env python3
"""Sharpen and enlarge a small or soft shop photo before it is cut out.

    python3 scripts/enhance_photo.py assets/source/originals/<photo> path/to/RealESRGAN_x4plus.pth

Upscales 4x with Real-ESRGAN (weights: github.com/xinntao/Real-ESRGAN releases, BSD-3-Clause),
gently lifts exposure and colour, and writes a PNG with the same name into assets/source/products/,
ready for scripts/cutout_products.py. Needs torch, spandrel and Pillow.
"""
import sys, pathlib
import numpy as np
import torch
from PIL import Image, ImageEnhance, ImageFilter
from spandrel import ModelLoader

ROOT = pathlib.Path(__file__).resolve().parent.parent
src, weights = pathlib.Path(sys.argv[1]), sys.argv[2]
BRIGHTNESS, CONTRAST, COLOUR = float(sys.argv[3]) if len(sys.argv) > 3 else 1.12, 1.04, 1.06
TILE, PAD = 192, 16

model = ModelLoader().load_from_file(weights).eval()
scale = model.scale
img = np.asarray(Image.open(src).convert("RGB")).astype(np.float32) / 255
h, w, _ = img.shape
out = np.zeros((h * scale, w * scale, 3), np.float32)

# upscale in overlapping tiles so memory stays small
with torch.no_grad():
    for y in range(0, h, TILE):
        for x in range(0, w, TILE):
            y0, x0 = max(y - PAD, 0), max(x - PAD, 0)
            y1, x1 = min(y + TILE + PAD, h), min(x + TILE + PAD, w)
            t = torch.from_numpy(img[y0:y1, x0:x1]).permute(2, 0, 1)[None]
            r = model(t)[0].permute(1, 2, 0).clamp(0, 1).numpy()
            oy, ox = (y - y0) * scale, (x - x0) * scale
            th, tw = (min(y + TILE, h) - y) * scale, (min(x + TILE, w) - x) * scale
            out[y * scale:y * scale + th, x * scale:x * scale + tw] = r[oy:oy + th, ox:ox + tw]

big = Image.fromarray((out * 255).round().astype(np.uint8))
big = ImageEnhance.Brightness(big).enhance(BRIGHTNESS)
big = ImageEnhance.Contrast(big).enhance(CONTRAST)
big = ImageEnhance.Color(big).enhance(COLOUR)
big = big.filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2))
dest = ROOT / "assets/source/products" / (src.stem + ".png")
big.save(dest, optimize=True)
print(f"{src.name} {w}x{h} -> {dest.relative_to(ROOT)} {big.width}x{big.height}")
