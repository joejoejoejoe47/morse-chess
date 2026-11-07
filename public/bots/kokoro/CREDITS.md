# Kokoro voice pack (same-origin)

- Model: hexgrad/Kokoro-82M → onnx-community/Kokoro-82M-v1.0-ONNX (Apache-2.0)
- Runtime: kokoro-js + @huggingface/transformers + onnxruntime-web
- Served under `/bots/kokoro/` so the browser loads the same-origin pack (no Hugging Face at runtime)
- Weights: official fp32 `onnx/model.onnx` (325,532,232 bytes), SHA-256 `8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb`, fetched at build/deploy — never the q8 `model_quantized.onnx`
- Voices included: af_heart (female), am_michael (male)
