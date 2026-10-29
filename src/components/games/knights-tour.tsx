import { useState } from "react";
import { ktEmpty, ktHint, ktTargets, type KTBoard } from "@/lib/games/knights-tour";
import { GameFrame, RulesModal, StatusBar } from "./shared";
import { cornerFen, ModeBoard, rfOf, sqOf } from "./mode-board";

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

  // Visited squares show their move number on a gold square; the hint glows blue.
  const labels: Record<string, string> = {};
  const tints: Record<string, string> = {};
  board.forEach((row, r) =>
    row.forEach((n, f) => {
      if (!n) return;
      if (!at || at[0] !== r || at[1] !== f) labels[sqOf(r, f)] = String(n);
      tints[sqOf(r, f)] = "#c9a24e";
    }),
  );
  if (hint) tints[sqOf(hint[0], hint[1])] = "#5aa9e6";
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
        <ModeBoard
          size={8}
          fen={cornerFen(8, (r, f) => (at && at[0] === r && at[1] === f ? { c: "w", t: "n" } : null))}
          selected={at ? sqOf(at[0], at[1]) : null}
          legal={targets.map(([r, f]) => sqOf(r, f))}
          onSquare={(sq) => click(...rfOf(sq))}
          disabled={done || stuck}
          labels={labels}
          tints={tints}
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
