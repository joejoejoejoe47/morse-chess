# Kokoro voice pack (same-origin)

- Model: hexgrad/Kokoro-82M → onnx-community/Kokoro-82M-v1.0-ONNX (Apache-2.0)
- Runtime: kokoro-js + @huggingface/transformers + onnxruntime-web
- Shipped under `/bots/kokoro/` so the browser never needs Hugging Face network access
- Voices included: af_heart (female), am_michael (male)
