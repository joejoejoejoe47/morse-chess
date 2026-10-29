import { useState } from "react";
import { apoBot, apoMoves, apoResolve, apoStart, centerCount, countKind, type ABoard, type AMove, type Color } from "@/lib/games/apocalypse";
import { GameFrame, RulesModal, StatusBar } from "./shared";
import { cornerFen, ModeBoard, rfOf, sqOf } from "./mode-board";

const APO_RULES = [
  "A 5×5 board. Each side starts with 2 knights and 3 pawns on its back row (knights in the corners).",
  "Every round both players choose a move in secret. Then both moves are revealed and happen at the same time.",
  "Pawns move one square forward, or capture one square diagonally forward. Knights move in an L shape.",
  "If both pieces move to the same square, they crash and both are removed.",
  "If you move onto an enemy piece that stays put, you capture it. If it moved away, you just land there.",
  "A pawn that reaches the far row becomes a knight if you have lost a knight; otherwise it respawns on your home row.",
  "Win by eliminating every enemy pawn, or by holding 3 of the 9 centre squares at the end of a round.",
];

type Mode = "hotseat" | "bot-w" | "bot-b";
type Phase = "pick" | "pass" | "reveal" | "over";

const same = (a: [number, number] | undefined | null, r: number, f: number) => !!a && a[0] === r && a[1] === f;
/** The 9 centre squares (b2-d4) carry a ◆. */
const CENTRE_LABELS: Record<string, string> = Object.fromEntries(
  [1, 2, 3].flatMap((r) => [1, 2, 3].map((f) => [sqOf(r, f), "◆"])),
);
const TINT = { hint: "#5aa9e6", white: "#e0b84a", black: "#c0506a", crash: "#d42a2a" };

export function Apocalypse() {
  const [started, setStarted] = useState(false);
  const [rules, setRules] = useState(false);
  const [mode, setMode] = useState<Mode>("hotseat");
  const [board, setBoard] = useState<ABoard>(apoStart);
  const [prev, setPrev] = useState<ABoard | null>(null);
  const [picker, setPicker] = useState<Color>("w");
  const [phase, setPhase] = useState<Phase>("pick");
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [pending, setPending] = useState<AMove | null>(null);
  const [locked, setLocked] = useState<{ w?: AMove | null; b?: AMove | null }>({});
  const [events, setEvents] = useState<string[]>([]);
  const [winner, setWinner] = useState<Color | "draw" | null>(null);
  const [round, setRound] = useState(1);

  const me: Color = mode === "bot-b" ? "b" : "w";
  const moves = phase === "pick" ? apoMoves(board, picker) : [];
  const from = sel ? moves.filter((m) => same(m.from, sel[0], sel[1])) : [];

  function reset(m: Mode = mode) {
    setBoard(apoStart());
    setPrev(null);
    setPicker(m === "bot-b" ? "b" : "w");
    setPhase("pick");
    setSel(null);
    setPending(null);
    setLocked({});
    setEvents([]);
    setWinner(null);
    setRound(1);
  }

  function resolve(w: AMove | null, b: AMove | null) {
    const res = apoResolve(board, w, b);
    setPrev(board);
    setBoard(res.board);
    setLocked({ w, b });
    setEvents(res.events.length ? res.events : ["Both moves executed."]);
    setWinner(res.winner);
    setPhase(res.winner ? "over" : "reveal");
    setSel(null);
    setPending(null);
  }

  function lockIn() {
    const mv = moves.length ? pending : null;
    if (moves.length && !mv) return;
    if (mode !== "hotseat") {
      const bot = apoBot(board, me === "w" ? "b" : "w");
      return me === "w" ? resolve(mv, bot) : resolve(bot, mv);
    }
    if (picker === "w") {
      setLocked({ w: mv });
      setPicker("b");
      setPhase("pass");
      setSel(null);
      setPending(null);
      return;
    }
    resolve(locked.w ?? null, mv);
  }

  function nextRound() {
    setRound(round + 1);
    setPicker(mode === "bot-b" ? "b" : "w");
    setPhase("pick");
    setLocked({});
    setPrev(null);
  }

  function click(r: number, f: number) {
    if (phase !== "pick") return;
    const m = from.find((x) => same(x.to, r, f));
    if (m) {
      setPending(m);
      setSel(null);
      return;
    }
    const p = board[r][f];
    setSel(p && p.c === picker ? [r, f] : null);
  }

  const name = (c: Color) => (c === "w" ? "White" : "Black");
  const showBoard = phase !== "pass";
  const crashed = locked.w && locked.b && same(locked.w.to, locked.b.to[0], locked.b.to[1]);
  const statusText =
    phase === "over"
      ? winner === "draw"
        ? "Draw!"
        : `${name(winner as Color)} wins!` +
          (countKind(board, winner === "w" ? "b" : "w", "p") === 0 ? " Every enemy pawn is gone." : ` ${name(winner as Color)} holds ${centerCount(board, winner as Color)} centre squares.`)
      : phase === "reveal"
        ? `Round ${round} revealed`
        : phase === "pass"
          ? "Pass the device to Black"
          : `Round ${round} · ${name(picker)}, choose your secret move${pending ? " — then lock it in" : ""}`;
  const tints: Record<string, string> = {};
  if (pending) {
    tints[sqOf(pending.from[0], pending.from[1])] = TINT.hint;
    tints[sqOf(pending.to[0], pending.to[1])] = TINT.hint;
  } else if ((phase === "reveal" || phase === "over") && locked.w !== undefined) {
    if (locked.b) {
      tints[sqOf(locked.b.from[0], locked.b.from[1])] = TINT.black;
      tints[sqOf(locked.b.to[0], locked.b.to[1])] = TINT.black;
    }
    if (locked.w) {
      tints[sqOf(locked.w.from[0], locked.w.from[1])] = TINT.white;
      tints[sqOf(locked.w.to[0], locked.w.to[1])] = crashed ? TINT.crash : TINT.white;
    }
  }
  return (
    <GameFrame
      title="Apocalypse"
      tagline="Secret moves, revealed at once. Watch for crashes."
      rules={APO_RULES}
      options={[
        { id: "hotseat", label: "2 players on this device", note: "Pass the device between secret picks" },
        { id: "bot-w", label: "Play White vs MorseBot" },
        { id: "bot-b", label: "Play Black vs MorseBot" },
      ]}
      onStart={(id) => { setMode(id as Mode); reset(id as Mode); setStarted(true); }}
      started={started}
      onRules={() => setRules(true)}
      onReset={() => reset()}
    >
      <div className="px-3 py-4">
        <p className="mb-2 text-center text-xs text-mist" data-apo-count>
          White {countKind(board, "w", "p")}♟ {countKind(board, "w", "n")}♞ · centre {centerCount(board, "w")} — Black {countKind(board, "b", "p")}♟ {countKind(board, "b", "n")}♞ · centre {centerCount(board, "b")}
        </p>
        {showBoard ? (
          <ModeBoard
            size={5}
            you={mode === "bot-b" || (mode === "hotseat" && picker === "b" && phase === "pick") ? "b" : "w"}
            fen={cornerFen(5, (r, f) => board[r][f], picker)}
            selected={sel ? sqOf(sel[0], sel[1]) : null}
            legal={from.map((m) => sqOf(m.to[0], m.to[1]))}
            onSquare={(sq) => click(...rfOf(sq))}
            disabled={phase !== "pick"}
            labels={CENTRE_LABELS}
            tints={tints}
          />
        ) : (
          <div data-apo-pass className="mx-auto grid aspect-square w-[min(92vw,calc(100dvh-230px),560px)] place-items-center rounded-lg border-4 border-[#3a2a1a] bg-[#1a140e] p-6 text-center">
            <div>
              <p className="font-display text-2xl">White has locked in a secret move.</p>
              <p className="mt-2 text-sm text-mist">Hand the device to Black. No peeking!</p>
              <button type="button" data-apo-ready className="mt-5 rounded-md border border-[#e7c56a]/60 bg-[#2a1f14] px-5 py-3 font-semibold text-[#f3e2b6]" onClick={() => setPhase("pick")}>
                I'm Black — show the board
              </button>
            </div>
          </div>
        )}
        <StatusBar tone={phase === "over" ? (mode === "hotseat" || winner === me ? "win" : winner === "draw" ? "info" : "lose") : "info"}>{statusText}</StatusBar>
        {phase === "reveal" || phase === "over" ? (
          <ul data-apo-events className="mx-auto mt-2 max-w-xl space-y-1 text-center text-sm text-cream">
            {events.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
            {prev ? <li className="text-xs text-mist">Gold = White's move · red = Black's move</li> : null}
          </ul>
        ) : null}
        <div className="mt-3 flex justify-center gap-2">
          {phase === "pick" ? (
            <button
              type="button"
              data-apo-lock
              disabled={moves.length > 0 && !pending}
              className="rounded-md border border-[#e7c56a]/60 bg-[#2a1f14] px-5 py-2 text-sm font-semibold text-[#f3e2b6] disabled:opacity-40"
              onClick={lockIn}
            >
              {moves.length ? "Lock in move" : "No moves — pass"}
            </button>
          ) : null}
          {phase === "reveal" ? (
            <button type="button" data-apo-next className="rounded-md border border-[#e7c56a]/60 bg-[#2a1f14] px-5 py-2 text-sm font-semibold text-[#f3e2b6]" onClick={nextRound}>
              Next round
            </button>
          ) : null}
        </div>
      </div>
      <RulesModal open={rules} onClose={() => setRules(false)} rules={APO_RULES} title="Apocalypse" />
    </GameFrame>
  );
}
