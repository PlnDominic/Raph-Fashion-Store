#!/usr/bin/env bash
# Turns a Flow video into the frame sequence the hero scrubs through.
#   ./scripts/extract-hero-frames.sh [video] [panel] [start-seconds] [fps]
# The current source is a 4-up grid of takes (4 vertical panels in one 1280x720
# frame). PANEL picks one (0-3). For a normal single-clip export, pass PANEL=full.
set -euo pipefail
cd "$(dirname "$0")/.."

VIDEO="${1:-assets/source/hero-take-grid.mp4}"
PANEL="${2:-1}"
START="${3:-0.9}"
FPS="${4:-16}"
OUT=assets/hero-frames

if [ "$PANEL" = "full" ]; then
  CROP="null"
else
  # Each panel is 320 wide; trim a few px off every edge to drop the seams.
  CROP="crop=312:708:$((PANEL * 320 + 4)):6"
fi

rm -f "$OUT"/*.jpg
ffmpeg -v error -y -ss "$START" -i "$VIDEO" -vf "$CROP,fps=$FPS" -q:v 5 "$OUT/%04d.jpg"
COUNT=$(ls "$OUT"/*.jpg | wc -l | tr -d ' ')
echo "$COUNT frames -> $OUT"
