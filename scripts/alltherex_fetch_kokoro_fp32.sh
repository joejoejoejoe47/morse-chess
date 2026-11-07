#!/usr/bin/env bash
# Download the official Kokoro fp32 ONNX into a site tree and verify SHA-256.
# Usage: alltherex_fetch_kokoro_fp32.sh [site-root]
#   site-root contains bots/kokoro/...  (for AllTheRex deploy: chess)
set -euo pipefail
ROOT="${1:-.}"
DEST="$ROOT/bots/kokoro/models/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx"
URL="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx"
SHA="8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb"
BYTES=325532232
mkdir -p "$(dirname "$DEST")"
if [ -f "$DEST" ]; then
  got_bytes=$(wc -c < "$DEST")
  got_sha=$(sha256sum "$DEST" | awk '{print $1}')
  if [ "$got_bytes" = "$BYTES" ] && [ "$got_sha" = "$SHA" ]; then
    echo "already verified $DEST"
    exit 0
  fi
  echo "removing unverified $DEST (bytes=$got_bytes sha=$got_sha)"
  rm -f "$DEST"
fi
curl -fL --retry 3 --retry-delay 2 "$URL" -o "$DEST.partial"
got_bytes=$(wc -c < "$DEST.partial")
got_sha=$(sha256sum "$DEST.partial" | awk '{print $1}')
if [ "$got_bytes" != "$BYTES" ] || [ "$got_sha" != "$SHA" ]; then
  rm -f "$DEST.partial"
  echo "verification failed bytes=$got_bytes sha=$got_sha" >&2
  exit 1
fi
mv "$DEST.partial" "$DEST"
echo "fetched and verified $DEST"
