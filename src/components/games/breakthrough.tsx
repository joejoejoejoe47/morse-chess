import { useEffect, useState } from "react";
import { PieceMark } from "@/components/chess/marks";
import { breakApply, breakBot, breakMoves, breakStart, breakWinner, type BMove, type BState } from "@/lib/games/breakthrough";
import { GameFrame, RulesModal, SquareBoard, StatusBar } from "./shared";

const BREAK_RULES = [
  "Each player has 16 pawns filling their first two rows. There are no other pieces.",
  "White moves first, then players alternate.",
  "A pawn moves one square straight forward or diagonally forward into an empty square.",
  "Pawns capture only diagonally forward. A pawn can never capture straight ahead.",
  "The first player to get a pawn onto the opponent's home row wins (capturing every enemy pawn also wins).",
];

type Mode = "hotseat" | "bot-w" | "bot-b";

const same = (a: [number, number] | undefined, r: number, f: number) => !!a && a[0] === r && a[1] === f;

export function Breakthrough() {
  const [started, setStarted] = useState(false);
  const [rules, setRules] = useState(false);
  const [mode, setMode] = useState<Mode>("hotseat");
  const [s, setS] = useState<BState>(breakStart);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [last, setLast] = useState<BMove | null>(null);
  const winner = breakWinner(s);
  const human = mode === "hotseat" || (mode === "bot-w" ? s.turn === "w" : s.turn === "b");
  const from = sel && !winner ? breakMoves(s).filter((m) => same(m.from, sel[0], sel[1])) : [];

  useEffect(() => {
    if (!started || winner || human) return;
    const t = setTimeout(() => {
      const m = breakBot(s);
      if (m) { setS(breakApply(s, m)); setLast(m); }
    }, 350);
    return () => clearTimeout(t);
  }, [s, started, human, winner]);

  function reset() {
    setS(breakStart());
    setSel(null);
    setLast(null);
  }

  function click(r: number, f: number) {
    if (winner || !human) return;
    const m = from.find((x) => same(x.to, r, f));
    if (m) {
      setS(breakApply(s, m));
      setLast(m);
      setSel(null);
      return;
    }
    setSel(s.board[r][f] === s.turn ? [r, f] : null);
  }

  const count = (c: "w" | "b") => s.board.flat().filter((x) => x === c).length;
  const youWon = winner && mode !== "hotseat" && winner === (mode === "bot-w" ? "w" : "b");
  return (
    <GameFrame
      title="Breakthrough"
      tagline="Sixteen pawns each. First one home wins."
      rules={BREAK_RULES}
      options={[
        { id: "hotseat", label: "2 players on this device", note: "Take turns — White first" },
        { id: "bot-w", label: "Play White vs MorseBot" },
        { id: "bot-b", label: "Play Black vs MorseBot" },
      ]}
      onStart={(id) => { setMode(id as Mode); reset(); setStarted(true); }}
      started={started}
      onRules={() => setRules(true)}
      onReset={reset}
    >
      <div className="px-3 py-4">
        <p className="mb-2 text-center text-xs text-mist">White {count("w")} · Black {count("b")}</p>
        <SquareBoard
          size={8}
          flipped={mode === "bot-b"}
          onClick={click}
          cell={(r, f) => {
            const c = s.board[r][f];
            const tgt = from.find((m) => same(m.to, r, f));
            return {
              content: c ? <PieceMark kind="p" tone={c} className="size-[80%]" /> : null,
              dot: !!tgt && !c,
              ring: !!tgt && !!c,
              mark: same(sel ?? undefined, r, f) ? "sel" : last && (same(last.from, r, f) || same(last.to, r, f)) ? "last" : undefined,
            };
          }}
        />
        <StatusBar tone={winner ? (mode === "hotseat" || youWon ? "win" : "lose") : "info"}>
          {winner
            ? `${winner === "w" ? "White" : "Black"} broke through and wins!`
            : `${s.turn === "w" ? "White" : "Black"} to move${human ? "" : " · MorseBot is thinking…"}`}
        </StatusBar>
      </div>
      <RulesModal open={rules} onClose={() => setRules(false)} rules={BREAK_RULES} title="Breakthrough" />
    </GameFrame>
  );
}
