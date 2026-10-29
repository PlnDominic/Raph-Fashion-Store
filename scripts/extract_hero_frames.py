#!/usr/bin/env python3
"""Turn a Flow video (model on a white studio backdrop) into the hero frame sequence.

    python3 scripts/extract_hero_frames.py [video] [fps]

What it does to each frame:
  1. pushes the near-white backdrop to pure white, so it melts into the page
  2. finds the model + dress and crops a window that follows her, so she stays
     centred and a similar size however she moves or the camera drifts
  3. fades everything except the model and dress to pure white
  4. saves a small WebP

Needs ffmpeg, Pillow and numpy.
"""
import subprocess, sys, tempfile, pathlib
import numpy as np
from PIL import Image, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
VIDEO = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / "assets/source/hero.mp4")
FPS = int(sys.argv[2]) if len(sys.argv) > 2 else 16
OUT = ROOT / "assets/hero-frames"

ASPECT = 0.62            # output frame width / height
OUT_H = 800              # output frame height in px
WHITE_POINT = 0.88       # anything brighter than this becomes pure white
SUBJECT_THRESHOLD = 560  # r+g+b below this counts as "not backdrop"
MARGIN = 1.10            # breathing room around the subject
HALO = 14                # px (source) of backdrop kept around the subject; the rest goes pure white
SMOOTH = 5               # frames of smoothing on the crop window

tmp = pathlib.Path(tempfile.mkdtemp())
# trim a few px off the edges: generated clips often have a dark line there
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", VIDEO,
                "-vf", f"crop=iw-12:ih-12:6:6,fps={FPS}", str(tmp / "%04d.png")], check=True)
files = sorted(tmp.glob("*.png"))

def levels(a):
    return np.clip(a.astype(np.float32) * (255.0 / (255 * WHITE_POINT)), 0, 255).astype(np.uint8)

frames, boxes = [], []
for f in files:
    img = levels(np.array(Image.open(f).convert("RGB")))
    mask = img.astype(int).sum(axis=2) < SUBJECT_THRESHOLD
    ys, xs = np.where(mask)
    # keep only the model and dress: grow the subject mask a little, soften it, and fade
    # everything outside it (wall shadow, floor glow) to pure white
    m = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(2 * HALO + 1))
    alpha = np.array(m.filter(ImageFilter.GaussianBlur(HALO / 2)), np.float32)[:, :, None] / 255.0
    frames.append((255 - (255 - img.astype(np.float32)) * alpha).astype(np.uint8))
    boxes.append((xs.min(), ys.min(), xs.max(), ys.max()) if len(xs) > 50 else None)

# fill gaps, then derive a crop window (cx, cy, height) per frame
last = next(b for b in boxes if b)
for i, b in enumerate(boxes):
    boxes[i] = b or last
    last = boxes[i]
win = []
for x0, y0, x1, y1 in boxes:
    bw, bh = (x1 - x0) * MARGIN, (y1 - y0) * MARGIN
    h = max(bh, bw / ASPECT)               # grow if the train spreads wide
    win.append(((x0 + x1) / 2, (y0 + y1) / 2, h))
win = np.array(win)
k = np.ones(SMOOTH) / SMOOTH
pad = SMOOTH // 2
smooth = np.stack([np.convolve(np.pad(win[:, c], pad, mode="edge"), k, mode="valid") for c in range(3)], axis=1)

OUT.mkdir(parents=True, exist_ok=True)
for old in OUT.glob("*.webp"):
    old.unlink()
out_w = round(OUT_H * ASPECT)
for i, (img, (cx, cy, h)) in enumerate(zip(frames, smooth), start=1):
    w = h * ASPECT
    L, T = int(round(cx - w / 2)), int(round(cy - h / 2))
    R, B = int(round(L + w)), int(round(T + h))
    # crop with white padding so the window may extend past the frame
    canvas = np.full((B - T, R - L, 3), 255, np.uint8)
    sx0, sy0 = max(L, 0), max(T, 0)
    sx1, sy1 = min(R, img.shape[1]), min(B, img.shape[0])
    canvas[sy0 - T:sy1 - T, sx0 - L:sx1 - L] = img[sy0:sy1, sx0:sx1]
    small = Image.fromarray(canvas).resize((out_w, OUT_H), Image.LANCZOS)
    small.save(OUT / f"{i:04d}.webp", quality=82, method=6)

total = sum(p.stat().st_size for p in OUT.glob("*.webp"))
print(f"{len(frames)} frames, {out_w}x{OUT_H}, {total/1e6:.1f} MB -> {OUT}")
