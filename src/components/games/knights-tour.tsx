import { useState } from "react";
import { PieceMark } from "@/components/chess/marks";
import { ktEmpty, ktHint, ktTargets, type KTBoard } from "@/lib/games/knights-tour";
import { GameFrame, RulesModal, SquareBoard, StatusBar } from "./shared";

const KT_RULES = [
  "You play alone with one knight on an empty board.",
  "Tap any square to place the knight there — that is move 1.",
  "Move in an L shape (two squares one way, one square sideways) to a square you have not visited yet.",
  "Every visited square shows its move number.",
  "Visit all 64 squares to win. If the knight has no unvisited square to jump to, you lose.",
];

export function KnightsTour() {
  const [started, setStarted] = useState(false);
  const [rules, setRules] = useState(false);
  const [board, setBoard] = useState<KTBoard>(ktEmpty);
  const [path, setPath] = useState<[number, number][]>([]);
  const [hint, setHint] = useState<[number, number] | null>(null);
  const at = path.length ? path[path.length - 1] : null;
  const targets = ktTargets(board, at);
  const done = path.length === 64;
  const stuck = !!at && !done && targets.length === 0;

  function reset() {
    setBoard(ktEmpty());
    setPath([]);
    setHint(null);
  }

  function click(r: number, f: number) {
    if (done || stuck) return;
    if (at && !targets.some(([tr, tf]) => tr === r && tf === f)) return;
    if (!at && board[r][f]) return;
    const nb = board.map((row) => row.slice());
    nb[r][f] = path.length + 1;
    setBoard(nb);
    setPath([...path, [r, f]]);
    setHint(null);
  }

  function undo() {
    if (!path.length) return;
    const [r, f] = path[path.length - 1];
    const nb = board.map((row) => row.slice());
    nb[r][f] = 0;
    setBoard(nb);
    setPath(path.slice(0, -1));
    setHint(null);
  }

  return (
    <GameFrame
      title="Knight's Tour"
      tagline="One knight. Sixty-four squares. Never land twice."
      rules={KT_RULES}
      options={[{ id: "solo", label: "Start the tour", note: "Single player" }]}
      onStart={() => { reset(); setStarted(true); }}
      started={started}
      onRules={() => setRules(true)}
      onReset={reset}
    >
      <div className="px-3 py-4">
        <SquareBoard
          size={8}
          onClick={click}
          cell={(r, f) => {
            const n = board[r][f];
            const here = at && at[0] === r && at[1] === f;
            const isTarget = targets.some(([tr, tf]) => tr === r && tf === f);
            return {
              content: here ? (
                <PieceMark kind="n" tone="w" className="size-[80%]" />
              ) : n ? (
                <span data-kt-num={n} className="font-display text-lg font-semibold text-[#2a1f14]/80 sm:text-xl">{n}</span>
              ) : null,
              dot: isTarget,
              mark: here ? "sel" : hint && hint[0] === r && hint[1] === f ? "hint" : n ? "last" : undefined,
            };
          }}
        />
        <StatusBar tone={done ? "win" : stuck ? "lose" : "info"}>
          {done
            ? "You win! The knight visited all 64 squares."
            : stuck
              ? `Stuck after ${path.length} squares — no unvisited L-move left. You lose.`
              : at
                ? `Move ${path.length} of 64 · ${targets.length} jump${targets.length === 1 ? "" : "s"} available`
                : "Tap a square to place your knight."}
        </StatusBar>
        <div className="mt-3 flex justify-center gap-2">
          <button type="button" data-kt-undo className="rounded-md border border-[#e7c56a]/50 px-4 py-2 text-sm font-semibold text-[#e7c56a] disabled:opacity-40" disabled={!path.length} onClick={undo}>
            Undo
          </button>
          <button type="button" data-kt-hint className="rounded-md border border-[#e7c56a]/50 px-4 py-2 text-sm font-semibold text-[#e7c56a] disabled:opacity-40" disabled={!at || done || stuck} onClick={() => setHint(ktHint(board, at))}>
            Hint
          </button>
        </div>
      </div>
      <RulesModal open={rules} onClose={() => setRules(false)} rules={KT_RULES} title="Knight's Tour" />
    </GameFrame>
  );
}
