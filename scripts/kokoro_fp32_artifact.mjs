/**
 * Official immutable Kokoro full-precision ONNX artifact.
 * Source: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
 * Do not substitute model_quantized.onnx (q8) — that path emits NaN/Inf/garbled speech.
 */
export const KOKORO_FP32 = Object.freeze({
  modelId: "onnx-community/Kokoro-82M-v1.0-ONNX",
  dtype: "fp32",
  fileName: "model.onnx",
  url: "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx",
  sha256: "8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb",
  bytes: 325532232,
  relativeDest: "public/bots/kokoro/models/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx",
  // Remaining same-origin pack (voices + ORT wasm + tokenizer), excluding the old q8 file.
  runtimeAndVoicesBytes: 33843226,
});

export const KOKORO_FP32_PACK_BYTES = KOKORO_FP32.bytes + KOKORO_FP32.runtimeAndVoicesBytes;
