/** Warm-model Node q8 timings (not download). Run from repo root: node scripts/kokoro_latency.mjs */
import { KokoroTTS } from "kokoro-js";
const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" });
async function timed(label, text) {
  const t0 = performance.now();
  const audio = await tts.generate(text, { voice: "am_michael" });
  const gen = performance.now() - t0;
  const sec = audio.audio.length / audio.sampling_rate;
  console.log(JSON.stringify({ label, chars: text.length, gen_ms: Math.round(gen), audio_s: +sec.toFixed(2), rtf: +(gen/1000/sec).toFixed(3) }));
}
const short = "Beep boop!";
const mid = "Hmm, I honestly don't know that one.";
const long = "Hmm, I honestly don't know that one. I'm a Morse Chess helper, so try how do I play a friend, how does the knight move, tell me a joke, or coach me in a game.";
await timed("warmup", short);
await timed("short", short);
await timed("mid-first-sentence", mid);
await timed("full-helper-reply", long);
