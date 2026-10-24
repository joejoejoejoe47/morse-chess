import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const KNOWLEDGE: { keys: string[]; answer: string; target?: string }[] = [
  { keys: ["timed", "time", "clock", "minute"], answer: "Timed games give each player one minute per turn. The clock runs only on your move.", target: "mode-timed" },
  { keys: ["breeze", "untimed", "no clock"], answer: "Breeze is the untimed mode. Take as long as you want.", target: "mode-breeze" },
  { keys: ["bot", "morsebot", "v2", "version"], answer: "MorseBot v2 is the stronger house bot. Play it from the lounge buttons.", target: "bot-v2" },
  { keys: ["board", "boards", "skin"], answer: "You can change boards and skins from the Board button in the header.", target: "boards" },
  { keys: ["avatar", "av", "look"], answer: "Customize your avatar from the AV button.", target: "avatar" },
  { keys: ["sandbox", "colosseum", "cross"], answer: "The Sandbox has Cross Colosseum and other modes. Buy it from the lounge.", target: "sandbox" },
  { keys: ["history", "moves", "voice", "commentary"], answer: "Move history is on the left of the board. Voice commentary speaks after each move. Use the Voice and Test buttons.", target: "voice" },
  { keys: ["chat", "talk", "message"], answer: "Open chat from the Chat button on the right of the board.", target: "chat" },
  { keys: ["hello", "hi", "hey", "wake"], answer: "Hello. I am Morse Bot. I know everything about Morse Chess. Ask me anything or tell me where something is.", target: undefined },
  { keys: ["goodbye", "bye", "sleep", "close"], answer: "Goodbye. Wake me anytime.", target: undefined },
];

function findAnswer(text: string) {
  const lower = text.toLowerCase();
  for (const item of KNOWLEDGE) {
    if (item.keys.some((k) => lower.includes(k))) return item;
  }
  return { keys: [], answer: "I know Morse Chess well. Ask about timed or breeze games, bots, boards, avatars, the sandbox, history, or voice.", target: undefined };
}

function Robot({ pointing }: { pointing: boolean }) {
  const group = useRef<THREE.Group>(null);
  const arm = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (group.current) {
      group.current.position.y = Math.sin(state.clock.elapsedTime * 2) * 0.08;
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.15;
    }
    if (arm.current) {
      arm.current.rotation.z = pointing ? -1.2 : -0.3;
    }
  });
  return (
    <group ref={group}>
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.7, 0.9, 0.45]} />
        <meshStandardMaterial color="#3a3a3a" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 1.15, 0]}>
        <boxGeometry args={[0.55, 0.45, 0.4]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[-0.12, 1.2, 0.21]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#4af" emissive="#4af" emissiveIntensity={1.2} />
      </mesh>
      <mesh position={[0.12, 1.2, 0.21]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#4af" emissive="#4af" emissiveIntensity={1.2} />
      </mesh>
      <group ref={arm} position={[0.45, 0.7, 0]}>
        <mesh position={[0.2, 0, 0]}>
          <boxGeometry args={[0.4, 0.12, 0.12]} />
          <meshStandardMaterial color="#555" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0.42, 0, 0]}>
          <sphereGeometry args={[0.08, 10, 10]} />
          <meshStandardMaterial color="#888" />
        </mesh>
      </group>
      <mesh position={[-0.55, 0.7, 0]}>
        <boxGeometry args={[0.4, 0.12, 0.12]} />
        <meshStandardMaterial color="#555" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[-0.18, -0.15, 0]}>
        <boxGeometry args={[0.16, 0.4, 0.16]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      <mesh position={[0.18, -0.15, 0]}>
        <boxGeometry args={[0.16, 0.4, 0.16]} />
        <meshStandardMaterial color="#444" />
      </mesh>
    </group>
  );
}

export function MorseBotHost() {
  const [awake, setAwake] = useState(false);
  const [listening, setListening] = useState(false);
  const [pointing, setPointing] = useState(false);
  const [pos, setPos] = useState({ x: typeof window !== "undefined" ? window.innerWidth - 140 : 200, y: typeof window !== "undefined" ? window.innerHeight - 220 : 400 });
  const recogRef = useRef<any>(null);

  useEffect(() => {
    const onWake = () => {
      setAwake(true);
      setTimeout(() => speak("Hello. I am Morse Bot. Ask me anything about Morse Chess or tell me where something is."), 400);
    };
    window.addEventListener("morse-bot-wake", onWake);
    return () => window.removeEventListener("morse-bot-wake", onWake);
  }, []);

  function speak(text: string) {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.35;
    u.pitch = 0.9;
    u.volume = 0.95;
    const voices = window.speechSynthesis.getVoices();
    const male =
      voices.find((v) => /en[-_]US/i.test(v.lang) && /male|david|daniel|alex|fred|guy/i.test(v.name)) ||
      voices.find((v) => /en[-_]US/i.test(v.lang)) ||
      voices[0];
    if (male) u.voice = male;
    window.speechSynthesis.speak(u);
  }

  function flyTo(selector: string | undefined) {
    if (!selector) return;
    const el = document.querySelector(`[data-morse="${selector}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(10, r.left + r.width / 2 - 60), y: Math.max(10, r.top + r.height / 2 - 90) });
    setPointing(true);
    setTimeout(() => setPointing(false), 2800);
  }

  function handleHeard(text: string) {
    const item = findAnswer(text);
    speak(item.answer);
    if (item.target) flyTo(item.target);
  }

  function startMic() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      speak("Speech recognition is not available in this browser.");
      return;
    }
    if (listening && recogRef.current) {
      recogRef.current.stop();
      setListening(false);
      return;
    }
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = "en-US";
    r.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      handleHeard(text);
      setListening(false);
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recogRef.current = r;
    r.start();
    setListening(true);
  }

  if (!awake) return null;

  return (
    <div
      className="pointer-events-none fixed z-50 transition-all duration-700 ease-out"
      style={{ left: pos.x, top: pos.y, width: 120, height: 160 }}
    >
      <div className="pointer-events-auto relative h-full w-full">
        <Canvas camera={{ position: [0, 0.6, 2.4], fov: 40 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[2, 3, 2]} intensity={1.2} />
          <Robot pointing={pointing} />
        </Canvas>
        <div className="absolute -bottom-10 left-1/2 flex -translate-x-1/2 gap-1">
          <button
            type="button"
            className={`grid size-9 place-items-center rounded-full border ${listening ? "bg-red-600 border-red-400" : "bg-black/80 border-white/30"}`}
            onClick={startMic}
            title="Mic mode"
          >
            <svg viewBox="0 0 24 24" className="size-5 fill-white">
              <path d="M3 10v4h2l6 5V5L5 10H3zm14.5 2c0-1.77-1-3.29-2.5-4.03v8.05c1.5-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          </button>
          <button
            type="button"
            className="rounded-full border border-white/30 bg-black/80 px-2 py-1 text-[10px] text-white"
            onClick={() => {
              speak("Goodbye.");
              setAwake(false);
            }}
          >
            Goodbye
          </button>
        </div>
      </div>
    </div>
  );
}

export function wakeMorseBot() {
  window.dispatchEvent(new CustomEvent("morse-bot-wake"));
}
