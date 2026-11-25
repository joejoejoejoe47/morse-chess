#!/usr/bin/env bash
# Legendary Campaign arena GLBs (owner t402u): shrink a Sketchfab download for the web and drop it in for a chapter.
#   bash scripts/arena-glb.sh <download.glb> <chapter 1-5> [simplify ratio, default 0.5]
# Output: public/legendary/arenas/ch<N>.glb (meshopt geometry, WebP textures <= 1024px). The game picks it up on the
# next build; if the file is missing the code-built arena is used. Credits live in arena-models.ts.
set -euo pipefail
IN="$1"; CH="$2"; RATIO="${3:-0.5}"
GT="${GLTF_TRANSFORM:-/workspace/tools/gltf/node_modules/.bin/gltf-transform}"
OUT="$(dirname "$0")/../public/legendary/arenas/ch${CH}.glb"
mkdir -p "$(dirname "$OUT")"
TMP="$(mktemp -d)"
"$GT" optimize "$IN" "$TMP/a.glb" --compress meshopt --texture-compress webp --texture-size 1024 --simplify true --simplify-ratio "$RATIO" --simplify-error 0.002
cp "$TMP/a.glb" "$OUT"
rm -rf "$TMP"
ls -la "$OUT"
"$GT" inspect "$OUT" --format md 2>/dev/null | head -20 || true
