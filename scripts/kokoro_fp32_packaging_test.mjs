/**
 * Precision, artifact hash, fetch script, and “no q8” packaging regressions.
 * Run from repo root: node scripts/kokoro_fp32_packaging_test.mjs
 */
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KOKORO_FP32, KOKORO_FP32_PACK_BYTES } from './kokoro_fp32_artifact.mjs';
import { defaultDest, verifyKokoroFp32File } from './fetch_kokoro_fp32.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

assert.equal(KOKORO_FP32.dtype, 'fp32');
assert.equal(KOKORO_FP32.fileName, 'model.onnx');
assert.equal(KOKORO_FP32.bytes, 325532232);
assert.equal(KOKORO_FP32.sha256, '8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb');
assert.equal(
  KOKORO_FP32.url,
  'https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/onnx/model.onnx',
);
assert.equal(KOKORO_FP32_PACK_BYTES, 325532232 + 33843226);

const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
assert.ok(ignore.includes('public/bots/kokoro/models/**/onnx/*.onnx'), 'onnx weights must stay out of git');

const tracked = execSync('git ls-files public/bots/kokoro', { cwd: root, encoding: 'utf8' });
assert.ok(!tracked.includes('model_quantized.onnx'), 'q8 weights must not remain tracked');
assert.ok(!tracked.split('\n').some((l) => l.endsWith('model.onnx')), 'fp32 weights must not be tracked (100 MB git limit)');
assert.ok(tracked.includes('model.onnx.sha256'), 'checksum sidecar must be tracked');

const sidecar = readFileSync(join(root, 'public/bots/kokoro/models/onnx-community/Kokoro-82M-v1.0-ONNX/onnx/model.onnx.sha256'), 'utf8');
assert.ok(sidecar.includes(KOKORO_FP32.sha256));
assert.ok(sidecar.includes(String(KOKORO_FP32.bytes)));
assert.ok(sidecar.includes(KOKORO_FP32.url));

const fetchSrc = readFileSync(join(root, 'scripts/fetch_kokoro_fp32.mjs'), 'utf8');
assert.ok(fetchSrc.includes('KOKORO_FP32'));
assert.ok(fetchSrc.includes('Refusing to write q8'));

const strip = readFileSync(join(root, 'scripts/strip_kokoro_onnx_for_git.sh'), 'utf8');
assert.ok(strip.includes('model.onnx'));
assert.ok(strip.includes('model_quantized.onnx'));

const deployFetch = readFileSync(join(root, 'scripts/alltherex_fetch_kokoro_fp32.sh'), 'utf8');
assert.ok(deployFetch.includes(KOKORO_FP32.url));
assert.ok(deployFetch.includes(KOKORO_FP32.sha256));
assert.ok(deployFetch.includes('325532232'));

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
assert.ok(pkg.scripts.build.startsWith('node scripts/fetch_kokoro_fp32.mjs'));
assert.equal(pkg.scripts['fetch-kokoro'], 'node scripts/fetch_kokoro_fp32.mjs');

const worker = readFileSync(join(root, 'src/lib/bots/kokoro.worker.ts'), 'utf8');
assert.ok(worker.includes('dtype: "fp32"'));
assert.ok(!worker.includes('dtype: "q8"'));
assert.ok(!worker.includes('sanitizeKokoroPcm'));
assert.ok(!worker.includes('model_quantized'));

const backend = readFileSync(join(root, 'src/lib/bots/kokoro-backend.ts'), 'utf8');
assert.ok(backend.includes('SHIPPED_DTYPE = "fp32"'));
assert.ok(!backend.includes('sanitizeKokoroPcm'));

const main = readFileSync(join(root, 'src/lib/bots/kokoro.ts'), 'utf8');
assert.ok(main.includes('morse-kokoro-consent-v3'));
assert.ok(main.includes('325.5 MB full-precision model'));

const manifest = JSON.parse(readFileSync(join(root, 'public/bots/kokoro/MANIFEST.json'), 'utf8'));
assert.equal(manifest.dtype, 'fp32 (model.onnx)');
assert.equal(manifest.model_sha256, KOKORO_FP32.sha256);
assert.ok(!JSON.stringify(manifest).includes('model_quantized'));

if (existsSync(defaultDest())) {
  const v = await verifyKokoroFp32File(defaultDest());
  assert.equal(v.ok, true, `local dest failed verification: ${v.reason}`);
  console.log('local dest verified', defaultDest());
} else {
  console.log('local dest not present yet (ok before fetch-kokoro)');
}

console.log('PASS kokoro_fp32_packaging_test');
