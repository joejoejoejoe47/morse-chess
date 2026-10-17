import { useEffect, useRef, useState, Suspense } from "react";
import { Chess, type Move, type Square } from "chess.js";
import { MorseMenus, groundId, type Mode, type Screen } from "@/components/battle/menus";
import { BattleScene, type Strike } from "@/components/battle/scene";
import { playDeny, playFanfare, playStep, playStrike, unlockAudio } from "@/game/audio";
import { TRIALS, pickMove, rookSlide, victimSquare, type Side } from "@/game/engine";
import { loadCoins, loadSettings, saveCoins, saveSettings, type BattleSettings } from "@/game/save";

type Job = {
  spec: { from: Square; to: Square; promotion: "q" };
  success: boolean;
};

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function MorseApp({ onLounge }: { onLounge?: () => void }) {
  const [screen, setScreen] = useState<Screen>("menu");
  const [motion, setMotion] = useState<"idle" | "out" | "in">("idle");
  const [mode, setMode] = useState<Mode>("battle");
  const [settings, setSettings] = useState<BattleSettings>(() => loadSettings());
  const [ground, setGround] = useState(0);
  const [side, setSide] = useState<Side>("w");
  const [coins, setCoins] = useState(80);
  const [note, setNote] = useState<string | null>(null);
  const [inHall, setInHall] = useState(false);
  const [fen, setFen] = useState(START_FEN);
  const [selected, setSelected] = useState<Square | null>(null);
  const [legal, setLegal] = useState<Square[]>([]);
  const [strike, setStrike] = useState<Strike | null>(null);
  const [last, setLast] = useState<{ from: Square; to: Square } | null>(null);
  const [status, setStatus] = useState("Light to move");
  const [result, setResult] = useState<string | null>(null);
  const [trial, setTrial] = useState(0);
  const [hint, setHint] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const chessRef = useRef(new Chess());
  const jobRef = useRef<Job | null>(null);
  const strikeRef = useRef<Strike | null>(null);
  const aiToken = useRef(0);
  const soundTimer = useRef<number | null>(null);
  const coinsRef = useRef(80);
  const paid = useRef<string | null>(null);

  useEffect(() => {
    const purse = loadCoins();
    coinsRef.current = purse;
    setCoins(purse);
  }, []);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 2400);
    return () => window.clearTimeout(id);
  }, [note]);

  function travel(next: Screen) {
    if (motion !== "idle") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setScreen(next);
      return;
    }
    setMotion("out");
    window.setTimeout(() => {
      setScreen(next);
      setMotion("in");
      window.setTimeout(() => setMotion("idle"), 760);
    }, 680);
  }

  function patchSettings(partial: Partial<BattleSettings>) {
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  function shiftGround(dir: -1 | 1) {
    if (coinsRef.current < 10) {
      setNote("You need 10 Morse coins for another ground.");
      playDeny();
      return;
    }
    coinsRef.current -= 10;
    const left = coinsRef.current;
    saveCoins(left);
    setCoins(left);
    setGround((current) => (current + dir + 4) % 4);
    setNote("10 Morse coins — the host marches to new ground.");
    playStep();
  }

  function openHall() {
    unlockAudio();
    const chess = new Chess();
    const puzzle = mode === "skill";
    if (puzzle) chess.load(TRIALS[0].fen);
    chessRef.current = chess;
    setFen(chess.fen());
    setSelected(null);
    setLegal([]);
    setStrike(null);
    setLast(null);
    setResult(null);
    setTrial(0);
    setHint(false);
    setConfirmLeave(false);
    paid.current = null;
    setStatus(puzzle ? TRIALS[0].title : side === "w" ? "Light to move" : "Dark considers the hall");
    setInHall(true);
    setScreen("menu");
  }

  function begin(from: Square, to: Square, known?: Move) {
    const chess = chessRef.current;
    if (strikeRef.current || result) return;
    const copy = new Chess(chess.fen());
    const played = known ?? copy.move({ from, to, promotion: "q" });
    if (!played) return;
    if (mode === "skill" && !TRIALS[trial]?.ok(played)) {
      setNote("Not that blow.");
      playDeny();
      return;
    }
    const kingAttack = played.piece === "k" && Boolean(played.captured);
    const cinematic = kingAttack || (settings.anim > 0.45 && Boolean(played.captured));
    const travelTime = 1.25 - settings.speed * 1.02;
    const dur = (kingAttack ? Math.max(2.05, travelTime + 0.8) : cinematic ? Math.max(0.95, travelTime + 0.55) : Math.max(0.22, travelTime * 0.85)) * 1000;
    const rook = rookSlide(played);
    const next: Strike = {
      id: performance.now(),
      from: played.from,
      to: played.to,
      victim: victimSquare(played),
      rookFrom: rook?.from,
      rookTo: rook?.to,
      attacker: played.piece,
      capture: Boolean(played.captured),
      cinematic,
      dur,
      t0: performance.now(),
    };
    jobRef.current = {
      spec: { from: played.from, to: played.to, promotion: "q" },
      success: mode === "skill",
    };
    strikeRef.current = next;
    setStrike(next);
    setSelected(null);
    setLegal([]);
    if (soundTimer.current) window.clearTimeout(soundTimer.current);
    if (cinematic) soundTimer.current = window.setTimeout(() => playStrike(), dur * 0.6);
    else playStep();
  }

  function finishStrike(id: number) {
    if (!strikeRef.current || strikeRef.current.id !== id) return;
    const job = jobRef.current;
    jobRef.current = null;
    strikeRef.current = null;
    setStrike(null);
    if (!job) return;
    const chess = chessRef.current;
    const mv = chess.move(job.spec);
    if (!mv) return;
    setFen(chess.fen());
    setLast({ from: mv.from, to: mv.to });
    if (mode === "skill" && job.success) {
      const rewardKey = `trial-${trial}`;
      if (paid.current !== rewardKey) {
        paid.current = rewardKey;
        setCoins((purse) => {
          const next = purse + 10;
          coinsRef.current = next;
          saveCoins(next);
          return next;
        });
      }
      playFanfare();
      if (trial >= TRIALS.length - 1) {
        setResult("The trials are done. +10 Morse coins.");
        setStatus("The light is finished.");
      } else {
        setResult(`Trial cleared. +10 Morse coins.`);
        setStatus(TRIALS[trial].title);
      }
      return;
    }
    if (chess.isCheckmate()) {
      const winner = chess.turn() === "w" ? "b" : "w";
      const playerWon = mode === "training" ? false : winner === side;
      if (playerWon && mode === "battle" && paid.current !== "battle") {
        paid.current = "battle";
        setCoins((purse) => {
          const next = purse + 25;
          coinsRef.current = next;
          saveCoins(next);
          return next;
        });
        playFanfare();
      }
      setResult(
        mode === "training"
          ? winner === "w"
            ? "Light takes the crown."
            : "Dark takes the crown."
          : playerWon
            ? "The crown is yours. +25 Morse coins."
            : "The crown falls.",
      );
      setStatus("The field is still.");
      return;
    }
    if (chess.isDraw()) {
      setResult("A drawn field.");
      setStatus("Neither crown falls.");
      return;
    }
    setStatus(chess.turn() === "w" ? "Light to move" : "Dark to move");
  }

  useEffect(() => {
    if (!inHall || strike || result || mode !== "battle") return;
    if (chessRef.current.turn() === side) return;
    if (chessRef.current.isGameOver()) return;
    const token = ++aiToken.current;
    const timer = window.setTimeout(() => {
      if (token !== aiToken.current) return;
      if (strikeRef.current) return;
      const move = pickMove(chessRef.current);
      if (!move || token !== aiToken.current) return;
      begin(move.from, move.to, move);
    }, 420);
    return () => {
      aiToken.current += 1;
      window.clearTimeout(timer);
    };
    // begin closes over settings and mode; fen/strike changes retrigger the opponent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, strike, inHall, result, mode, side]);

  function onSquare(square: Square) {
    if (!inHall || strikeRef.current || result) return;
    const chess = chessRef.current;
    const turn = chess.turn();
    if (mode !== "training" && turn !== (mode === "skill" ? "w" : side)) return;
    if (selected) {
      const moves = chess.moves({ square: selected, verbose: true });
      if (moves.some((move) => move.to === square)) {
        begin(selected, square);
        return;
      }
    }
    const piece = chess.get(square);
    if (piece && piece.color === turn) {
      setSelected(square);
      setLegal(chess.moves({ square, verbose: true }).map((move) => move.to));
      return;
    }
    setSelected(null);
    setLegal([]);
  }

  function nextTrial() {
    const upcoming = trial + 1;
    if (upcoming >= TRIALS.length) {
      leaveHall();
      return;
    }
    const chess = new Chess(TRIALS[upcoming].fen);
    chessRef.current = chess;
    setTrial(upcoming);
    setFen(chess.fen());
    setResult(null);
    setLast(null);
    setHint(false);
    setStatus(TRIALS[upcoming].title);
  }

  function leaveHall() {
    setInHall(false);
    setConfirmLeave(false);
    setResult(null);
    setScreen("menu");
    setMotion("idle");
  }

  const player: Side = mode === "skill" ? "w" : side;

  return (
    <main className="morse-battle game">
      {inHall ? (
        <Suspense fallback={null}>
          <BattleScene
            fen={fen}
            ground={groundId(ground)}
            flipped={player === "b"}
            characters={settings.characters >= 0.5}
            selected={selected}
            legal={legal}
            last={last}
            strike={strike}
            onSquare={onSquare}
            onStrikeDone={finishStrike}
          />
        </Suspense>
      ) : (
        <MorseMenus
          screen={screen}
          motion={motion}
          mode={mode}
          anim={settings.anim}
          speed={settings.speed}
          characters={settings.characters}
          ground={ground}
          side={side}
          coins={coins}
          note={note}
          onMode={(next) => {
            unlockAudio();
            setMode(next);
            travel("conditions");
          }}
          onAnim={(anim) => patchSettings({ anim })}
          onSpeed={(speed) => patchSettings({ speed })}
          onCharacters={(characters) => patchSettings({ characters })}
          onGround={shiftGround}
          onSide={() => setSide((current) => (current === "w" ? "b" : "w"))}
          onAway={() => {
            unlockAudio();
            setScreen("away");
          }}
          onBackHome={() => travel("menu")}
          onOnward={() => travel("deploy")}
          onRetreat={() => travel("conditions")}
          onBattle={openHall}
          onReturn={() => setScreen("menu")}
          onLounge={onLounge}
        />
      )}
      {inHall ? (
        <>
          <div className="vignette" />
          <header className="hud-top">
            <p>Morse Chess</p>
            <p>
              <span className="coin">M</span> {coins}
            </p>
          </header>
          <p className="hud-status">{mode === "skill" ? `${TRIALS[trial].title} — ${status}` : status}</p>
          {mode === "skill" && !result ? (
            <button type="button" className="hint" onClick={() => setHint((value) => !value)}>
              {hint ? TRIALS[trial].hint : "Hint"}
            </button>
          ) : null}
          <footer className="hud-bottom">
            <button type="button" onClick={() => setConfirmLeave(true)}>
              Retreat
            </button>
            {result ? (
              <button
                type="button"
                className="onward"
                onClick={() => {
                  if (mode === "skill" && trial < TRIALS.length - 1 && result.startsWith("Trial")) nextTrial();
                  else leaveHall();
                }}
              >
                {mode === "skill" && trial < TRIALS.length - 1 && result.startsWith("Trial") ? "Next trial" : "Back home"}
              </button>
            ) : (
              <span>{last ? "Blow struck" : player === "w" ? "You have the light" : "You have the dark"}</span>
            )}
          </footer>
          {result ? <div className="result">{result}</div> : null}
          {confirmLeave ? (
            <div className="confirm">
              <p>Leave this battle?</p>
              <button type="button" onClick={leaveHall}>
                Retreat
              </button>
              <button type="button" onClick={() => setConfirmLeave(false)}>
                Stay
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
