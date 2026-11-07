import { KokoroTTS } from "kokoro-js";
import { writeFileSync } from "fs";
import { performance } from "perf_hooks";

const model = "onnx-community/Kokoro-82M-v1.0-ONNX";
console.log("loading", model, "dtype=fp32 device=cpu");
const t0 = performance.now();
const tts = await KokoroTTS.from_pretrained(model, { dtype: "fp32", device: "cpu" });
const loadMs = performance.now() - t0;
console.log("load_ms", Math.round(loadMs));
console.log("voices_sample", tts.list_voices?.() ? Object.keys(tts.list_voices()).slice(0, 8) : "n/a");

const lines = [
  { file: "/workspace/createbot/v3-voice/sample_male_am_michael.wav", voice: "am_michael", text: "Beep boop! Hi, I'm Robo, your Morse Chess buddy. Tap the waveform and talk to me — I'll answer out loud." },
  { file: "/workspace/createbot/v3-voice/sample_female_af_heart.wav", voice: "af_heart", text: "Hello! I'm baby. Ask me how the knight moves, or say coach me in a game." },
];

for (const L of lines) {
  const t1 = performance.now();
  const audio = await tts.generate(L.text, { voice: L.voice });
  const genMs = performance.now() - t1;
  // audio may be RawAudio with .audio Float32Array and .sampling_rate, or have .save / .toBlob
  let saved = false;
  if (typeof audio.save === "function") {
    audio.save(L.file);
    saved = true;
  } else if (typeof audio.toWav === "function") {
    writeFileSync(L.file, Buffer.from(audio.toWav()));
    saved = true;
  } else if (audio.audio && audio.sampling_rate) {
    // write simple wav
    const samples = audio.audio;
    const sr = audio.sampling_rate;
    const buf = Buffer.alloc(44 + samples.length * 2);
    buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4);
    buf.write("WAVE", 8); buf.write("fmt ", 12); buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24);
    buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      buf.writeInt16LE((s * 0x7fff) | 0, 44 + i * 2);
    }
    writeFileSync(L.file, buf);
    saved = true;
  }
  const dur = audio.audio ? audio.audio.length / (audio.sampling_rate || 24000) : null;
  console.log(JSON.stringify({ file: L.file, voice: L.voice, gen_ms: Math.round(genMs), audio_s: dur ? +dur.toFixed(2) : null, rtf: dur ? +(genMs / 1000 / dur).toFixed(3) : null, saved, keys: Object.keys(audio) }));
}
console.log("DONE");
