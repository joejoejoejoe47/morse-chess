/**
 * Regression: browser verification of PR #64 failed with
 *   "no available backend found ERR [webgpu] Failed to get GPU adapter"
 * after model progress 55% / 95%. navigator.gpu existed but requestAdapter()
 * failed; same-worker WASM fallback inherited transformers.js's rejected
 * wasmInitPromise and never started WASM.
 *
 * Run from repo root:
 *   node --experimental-strip-types scripts/kokoro_wasm_fallback_test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GPU_ADAPTER_ERROR,
  SHIPPED_DTYPE,
  isGpuBackendFailure,
  loadKokoroDevice,
  makePoisonedSessionStore,
  pickInitialDevice,
  probeWebGpuAdapter,
  shouldReloadWasmAfterSynth,
} from '../src/lib/bots/kokoro-backend.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const LIVE = 'no available backend found ERR [webgpu] Failed to get GPU adapter';
const ORT = 'no available backend found. ERR: [webgpu] Failed to get GPU adapter';
const FLAG = 'Failed to get GPU adapter. You may need to enable flag "--enable-unsafe-webgpu" if you are using Chrome.';

assert.equal(isGpuBackendFailure(new Error(LIVE)), true, 'user-facing error must match');
assert.equal(isGpuBackendFailure(new Error(ORT)), true);
assert.equal(isGpuBackendFailure(new Error(FLAG)), true);
assert.equal(isGpuBackendFailure(new Error(GPU_ADAPTER_ERROR)), true);
assert.equal(isGpuBackendFailure(new Error('Voice synthesis failed.')), false);
assert.equal(isGpuBackendFailure(new Error('cancelled')), false);

assert.equal(pickInitialDevice({ forceWasm: false, adapterOk: false }), 'wasm');
assert.equal(pickInitialDevice({ forceWasm: true, adapterOk: true }), 'wasm');
assert.equal(pickInitialDevice({ forceWasm: false, adapterOk: true }), 'webgpu');

assert.equal(await probeWebGpuAdapter(undefined), false);
assert.equal(await probeWebGpuAdapter(null), false);
assert.equal(await probeWebGpuAdapter({}), false);
assert.equal(await probeWebGpuAdapter({ requestAdapter: async () => null }), false);
assert.equal(await probeWebGpuAdapter({ requestAdapter: async () => { throw new Error(FLAG); } }), false);
assert.equal(await probeWebGpuAdapter({ requestAdapter: async () => ({ name: 'fake' }) }), true);

const noAdapterCalls = [];
const noAdapter = await loadKokoroDevice({
  forceWasm: false,
  adapterOk: false,
  fromPretrained: async (device) => {
    noAdapterCalls.push(device);
    if (device === 'webgpu') throw new Error(LIVE);
    return 'wasm-ok';
  },
});
assert.deepEqual(noAdapter, { kind: 'ready', backend: 'wasm' });
assert.deepEqual(noAdapterCalls, ['wasm'], 'must not attempt WebGPU when requestAdapter() failed');

const poisoned = makePoisonedSessionStore();
const afterPoison = await loadKokoroDevice({
  forceWasm: false,
  adapterOk: true,
  fromPretrained: poisoned,
});
assert.equal(afterPoison.kind, 'reload-wasm', `expected reload-wasm, got ${JSON.stringify(afterPoison)}`);
assert.equal(isGpuBackendFailure(afterPoison.reason), true);

const fresh = makePoisonedSessionStore();
const afterReload = await loadKokoroDevice({
  forceWasm: true,
  adapterOk: true,
  fromPretrained: fresh,
});
assert.deepEqual(afterReload, { kind: 'ready', backend: 'wasm' });

assert.equal(shouldReloadWasmAfterSynth('webgpu', new Error(LIVE)), true);
assert.equal(shouldReloadWasmAfterSynth('wasm', new Error(LIVE)), false);
assert.equal(shouldReloadWasmAfterSynth('webgpu', new Error('phonemizer failed')), false);

const worker = readFileSync(join(root, 'src/lib/bots/kokoro.worker.ts'), 'utf8');
const main = readFileSync(join(root, 'src/lib/bots/kokoro.ts'), 'utf8');
const voice = readFileSync(join(root, 'src/lib/bots/voice.ts'), 'utf8');
assert.ok(worker.includes('probeWebGpuAdapter'), 'worker must probe a real GPU adapter');
assert.ok(worker.includes('reload-wasm'), 'worker must ask for a fresh WASM worker after poisoned WebGPU init');
assert.ok(worker.includes('forceWasm'), 'worker must accept WASM-only reload');
assert.ok(worker.includes('shouldReloadWasmAfterSynth'), 'first-synthesis WebGPU errors must reload WASM');
assert.ok(!/function hasWebGPU\(\)[\s\S]*!!.*\.gpu/.test(worker), 'optimistic !!navigator.gpu helper must be gone');
assert.ok(main.includes('restartWorkerForWasm'), 'main thread must terminate poisoned worker');
assert.ok(main.includes('forceWasm: true') || main.includes('forceWasm: forceWasmOnly'), 'main thread must reload WASM-only');
assert.ok(!/speechSynthesis\.speak/.test(voice), 'must not call OS speechSynthesis');
assert.ok(voice.includes('cancelKokoro'));
assert.ok(voice.includes('Generating first words'));
assert.equal(SHIPPED_DTYPE, 'fp32');
assert.ok(worker.includes('dtype: "fp32"'), 'worker must load official fp32');
assert.ok(!worker.includes('dtype: "q8"'), 'worker must never request q8');
assert.ok(!worker.includes('model_quantized'), 'worker must not mention q8 filename');
assert.ok(!worker.includes('sanitizeKokoroPcm'), 'must not pretend sanitizing bad q8 output is a fix');
assert.ok(main.includes('morse-kokoro-consent-v3'), 'old q8 consent must be invalidated');
assert.ok(!main.includes('morse-kokoro-consent-v2'));

console.log('PASS kokoro_wasm_fallback_test');
