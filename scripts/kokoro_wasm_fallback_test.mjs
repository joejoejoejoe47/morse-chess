/**
 * Regression: browser verification of PR #64 failed with
 *   "no available backend found ERR [webgpu] Failed to get GPU adapter"
 * after model progress 55% / 95%. navigator.gpu existed but requestAdapter()
 * failed; same-worker WASM fallback inherited transformers.js's rejected
 * wasmInitPromise and never started WASM.
 *
 * Also: shipped dtype is q8. Official kokoro-js recommends WebGPU only with
 * fp32; hexgrad/kokoro#68 reported garbled speech for q8/q4 on WebGPU.
 * pickInitialDevice must keep q8 on WASM even when an adapter exists.
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
  sanitizeKokoroPcm,
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

assert.equal(SHIPPED_DTYPE, 'q8');
assert.equal(pickInitialDevice({ forceWasm: false, adapterOk: false }), 'wasm');
assert.equal(pickInitialDevice({ forceWasm: true, adapterOk: true }), 'wasm');
assert.equal(
  pickInitialDevice({ forceWasm: false, adapterOk: true }),
  'wasm',
  'shipped q8 must not use WebGPU even when an adapter exists',
);
assert.equal(pickInitialDevice({ forceWasm: false, adapterOk: true, dtype: 'q8' }), 'wasm');
assert.equal(pickInitialDevice({ forceWasm: false, adapterOk: true, dtype: 'q4' }), 'wasm');
assert.equal(pickInitialDevice({ forceWasm: false, adapterOk: true, dtype: 'fp32' }), 'webgpu');
assert.equal(pickInitialDevice({ forceWasm: false, adapterOk: false, dtype: 'fp32' }), 'wasm');

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

const shippedQ8Calls = [];
const shippedQ8 = await loadKokoroDevice({
  forceWasm: false,
  adapterOk: true,
  dtype: 'q8',
  fromPretrained: async (device) => {
    shippedQ8Calls.push(device);
    if (device === 'webgpu') throw new Error('must not try WebGPU for shipped q8');
    return 'wasm-ok';
  },
});
assert.deepEqual(shippedQ8, { kind: 'ready', backend: 'wasm' });
assert.deepEqual(shippedQ8Calls, ['wasm'], 'adapter present + q8 must load WASM only');

const poisoned = makePoisonedSessionStore();
const afterPoison = await loadKokoroDevice({
  forceWasm: false,
  adapterOk: true,
  dtype: 'fp32',
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

const pcm = new Float32Array([0.25, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2.5, -4, 1, -1, 0]);
const { replaced } = sanitizeKokoroPcm(pcm);
assert.equal(replaced, 5);
assert.deepEqual(Array.from(pcm), [0.25, 0, 0, 0, 1, -1, 1, -1, 0]);
const clean = new Float32Array([0, 0.5, -0.5]);
assert.equal(sanitizeKokoroPcm(clean).replaced, 0);
assert.deepEqual(Array.from(clean), [0, 0.5, -0.5]);

const worker = readFileSync(join(root, 'src/lib/bots/kokoro.worker.ts'), 'utf8');
const main = readFileSync(join(root, 'src/lib/bots/kokoro.ts'), 'utf8');
const voice = readFileSync(join(root, 'src/lib/bots/voice.ts'), 'utf8');
const playback = readFileSync(join(root, 'src/lib/bots/playback.ts'), 'utf8');
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
assert.ok(worker.includes('sanitizeKokoroPcm'), 'worker must sanitize PCM before toBlob');
assert.ok(worker.includes('dtype: "q8"'));
assert.ok(!worker.includes('Trying WebGPU with the on-site q8 model'), 'must not advertise WebGPU+q8');
const playFn = playback.slice(playback.indexOf('export async function playWavBlob'));
assert.ok(playFn.includes('playViaElement'), 'playWavBlob must use HTMLAudio');
assert.ok(
  playFn.indexOf('playViaElement') < playFn.indexOf('playViaContext'),
  'HTMLAudio must be preferred over decodeAudioData (PR63 / official kokoro-js demo path)',
);

console.log('PASS kokoro_wasm_fallback_test');
