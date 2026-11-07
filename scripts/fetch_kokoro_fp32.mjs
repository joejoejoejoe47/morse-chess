#!/usr/bin/env node
/**
 * Fetch the official Kokoro fp32 ONNX file, verify size + SHA-256, and place it
 * at the transformers.js path. Never writes or accepts model_quantized.onnx.
 *
 * Official URL and digest live in kokoro_fp32_artifact.mjs (no secrets).
 * Override dest with KOKORO_FP32_DEST and a verified local source with KOKORO_FP32_SRC.
 */
import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { KOKORO_FP32 } from "./kokoro_fp32_artifact.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function defaultDest() {
  return resolve(process.env.KOKORO_FP32_DEST || join(root, KOKORO_FP32.relativeDest));
}

export async function sha256File(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

export async function verifyKokoroFp32File(path) {
  if (!path || !existsSync(path)) return { ok: false, reason: "missing" };
  const size = statSync(path).size;
  if (size !== KOKORO_FP32.bytes) {
    return { ok: false, reason: `size ${size} != ${KOKORO_FP32.bytes}`, size };
  }
  const sha = await sha256File(path);
  if (sha !== KOKORO_FP32.sha256) {
    return { ok: false, reason: `sha256 ${sha} != ${KOKORO_FP32.sha256}`, size, sha };
  }
  return { ok: true, size, sha };
}

function sources(dest) {
  const out = [];
  if (process.env.KOKORO_FP32_SRC) out.push(resolve(process.env.KOKORO_FP32_SRC));
  out.push(join(root, "node_modules/@huggingface/transformers/.cache/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx"));
  return out.filter((p) => p && resolve(p) !== resolve(dest));
}

async function downloadOfficial(dest) {
  const partial = `${dest}.partial`;
  mkdirSync(dirname(dest), { recursive: true });
  if (existsSync(partial)) unlinkSync(partial);
  const res = await fetch(KOKORO_FP32.url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Official download failed (${res.status}) ${KOKORO_FP32.url}`);
  }
  const hash = createHash("sha256");
  let size = 0;
  const hasher = new Transform({
    transform(chunk, _enc, cb) {
      size += chunk.length;
      hash.update(chunk);
      cb(null, chunk);
    },
  });
  await pipeline(res.body, hasher, createWriteStream(partial));
  const sha = hash.digest("hex");
  if (size !== KOKORO_FP32.bytes || sha !== KOKORO_FP32.sha256) {
    unlinkSync(partial);
    throw new Error(`Downloaded file failed verification size=${size} sha256=${sha}`);
  }
  renameSync(partial, dest);
}

export async function fetchKokoroFp32() {
  const dest = defaultDest();
  if (dest.endsWith("model_quantized.onnx") || dest.includes("model_quantized")) {
    throw new Error("Refusing to write q8 model_quantized.onnx; this pack is fp32-only.");
  }
  mkdirSync(dirname(dest), { recursive: true });
  const have = await verifyKokoroFp32File(dest);
  if (have.ok) {
    console.log(`kokoro fp32 already verified at ${dest}`);
    return dest;
  }
  if (existsSync(dest)) {
    console.warn(`removing unverified ${dest}: ${have.reason}`);
    unlinkSync(dest);
  }
  for (const src of sources(dest)) {
    if (!existsSync(src)) continue;
    const v = await verifyKokoroFp32File(src);
    if (!v.ok) continue;
    copyFileSync(src, dest);
    const again = await verifyKokoroFp32File(dest);
    if (!again.ok) throw new Error(`copy failed verification: ${again.reason}`);
    console.log(`copied verified kokoro fp32 from ${src}`);
    return dest;
  }
  console.log(`downloading official kokoro fp32 (${KOKORO_FP32.bytes} bytes)`);
  await downloadOfficial(dest);
  const final = await verifyKokoroFp32File(dest);
  if (!final.ok) throw new Error(final.reason);
  console.log(`fetched and verified kokoro fp32 at ${dest}`);
  return dest;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetchKokoroFp32().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
