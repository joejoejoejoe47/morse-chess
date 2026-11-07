#!/usr/bin/env bash
# Remove the 325 MB fp32 ONNX from a built tree before committing to git
# (GitHub file limit is 100 MB). The deploy workflow must fetch it separately.
set -euo pipefail
ROOT="${1:-.}"
TARGET="$ROOT/bots/kokoro/models/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx"
# Also recognize a chess/ prefix used by AllTheRex
if [ ! -f "$TARGET" ] && [ -f "$ROOT/chess/bots/kokoro/models/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx" ]; then
  TARGET="$ROOT/chess/bots/kokoro/models/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx"
fi
if [ -f "$TARGET" ]; then
  echo "stripping $TARGET ($(wc -c < "$TARGET") bytes) so it is not committed"
  rm -f "$TARGET"
else
  echo "no model.onnx to strip under $ROOT"
fi
# Never leave a q8 file in the tree either
find "$ROOT" -name 'model_quantized.onnx' -print -delete || true
