/**
 * English defaults: browser UI language must not silently switch Morse Chess
 * speech recognition or bot replies to another language (t297 Chinese report).
 *
 * Run: node --experimental-strip-types scripts/bot_english_default_test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { think } from '../src/lib/bots/brain.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hasCJK = (s) => /[\u4e00-\u9fff]/.test(s);

const voice = readFileSync(join(root, 'src/lib/bots/voice.ts'), 'utf8');
assert.ok(/export const SPEECH_RECOGNITION_LANG = "en-US"/.test(voice));
assert.ok(/rec\.lang = SPEECH_RECOGNITION_LANG/.test(voice), 'recognition must not follow navigator.language');
assert.ok(!/rec\.lang = navigator\.language/.test(voice));

const kokoro = readFileSync(join(root, 'src/lib/bots/kokoro.ts'), 'utf8');
assert.match(kokoro, /kind === "female" \? "af_heart" : "am_michael"/);

const llm = readFileSync(join(root, 'src/lib/bots/local-llm.ts'), 'utf8');
assert.ok(/Reply in English unless the player explicitly asks/.test(llm));

const php = readFileSync(join(root, 'php/src/Brain.php'), 'utf8');
assert.ok(/Reply in English unless the player explicitly asks/.test(php));

// Rules brain: English in, English out; CJK input is not "translated", it falls back in English.
const hi = think('hi', 'Robo');
assert.equal(hi.kind, 'say');
assert.ok(/Hi! I'm Robo/.test(hi.text));
assert.ok(!hasCJK(hi.text));

const knight = think('how does the knight move', 'Robo');
assert.ok(/knight jumps in an L/i.test(knight.text));
assert.ok(!hasCJK(knight.text));

const unknown = think('zzzzxyz123', 'Robo');
assert.ok(/don't know/i.test(unknown.text));
assert.ok(!hasCJK(unknown.text));

const cjk = think('你好，请把国际象棋规则翻译成中文', 'Robo');
assert.ok(!hasCJK(cjk.text), `rules brain must not reply in Chinese, got: ${cjk.text}`);
assert.ok(/don't know|Morse Chess helper/i.test(cjk.text));

// Installed kokoro-js 1.2.1 cannot emit Chinese: English-only voices + phonemizer IDs.
const voicesSrc = readFileSync(join(root, 'node_modules/kokoro-js/dist/kokoro.js'), 'utf8');
assert.ok(voicesSrc.includes('af_heart') && voicesSrc.includes('am_michael'));
assert.ok(!/\bzf_/.test(voicesSrc) && !/\bzm_/.test(voicesSrc), 'shipped kokoro-js must not register Chinese zf_/zm_ voices');
const langs = [...voicesSrc.matchAll(/language:"([^"]+)"/g)].map((m) => m[1]);
assert.ok(langs.every((l) => l === 'en-us' || l === 'en-gb'), `unexpected voice languages: ${[...new Set(langs)]}`);

console.log('PASS bot_english_default_test');
