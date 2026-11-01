#!/usr/bin/env bash
# Convert song page PNGs to lossless WebP (same pixels, about 30% of the size) and
# delete the PNGs. The site only loads .webp song pages. The deploy workflow runs
# this too, so a PNG pushed by mistake is still served as WebP.
#
#   tools/songs_to_webp.sh        # needs cwebp: brew install webp / apt-get install webp
set -euo pipefail
cd "$(dirname "$0")/.."

find shi_ge bu_chong_ben xin_ge_song_yong hong_ben lan_ben -maxdepth 1 -name '*.png' -print0 |
  xargs -0 -P 8 -I{} sh -c 'f="{}"; cwebp -quiet -lossless -z 9 "$f" -o "${f%.png}.webp" && rm "$f"'

echo "remaining png: $(find shi_ge bu_chong_ben xin_ge_song_yong hong_ben lan_ben -maxdepth 1 -name '*.png' | wc -l | tr -d ' ')"
