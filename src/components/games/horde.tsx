import { useEffect, useState } from "react";
import { PieceMark } from "@/components/chess/marks";
import { applyMove, botMove, count, hordeStart, inCheck, legalMoves, status, type HMove, type HState, type Kind, type Sq } from "@/lib/games/horde";
import { GameFrame, RulesModal, SquareBoard, StatusBar } from "./shared";

const HORDE_RULES = [
  "White has 36 pawns and no king: ranks 1–4 are full, plus d5, e5, f5 and g5. Black has the normal chess army.",
  "White moves first. Pieces move like normal chess; Black may castle and en passant works for both sides.",
  "White pawns on ranks 1 and 2 may move two squares if both squares are empty.",
  "A White pawn reaching rank 8 promotes to a queen, rook, bishop or knight.",
  "Black must never leave its king in check. White has no king, so it can never be in check.",
  "White wins by checkmating the Black king (or capturing every Black piece). Black wins by capturing every White pawn and piece.",
];

type Mode = "hotseat" | "bot-w" | "bot-b"; // bot-w = you play White

const same = (a: Sq | null | undefined, r: number, f: number) => !!a && a[0] === r && a[1] === f;

export function HordeChess() {
  const [started, setStarted] = useState(false);
  const [rules, setRules] = useState(false);
  const [mode, setMode] = useState<Mode>("hotseat");
  const [s, setS] = useState<HState>(hordeStart);
  const [sel, setSel] = useState<Sq | null>(null);
  const [last, setLast] = useState<HMove | null>(null);
  const [promo, setPromo] = useState<HMove[] | null>(null);
  const st = status(s);
  const human = mode === "hotseat" || (mode === "bot-w" ? s.turn === "w" : s.turn === "b");
  const moves = st.over ? [] : legalMoves(s);
  const from = sel ? moves.filter((m) => same(m.from, sel[0], sel[1])) : [];

  useEffect(() => {
    if (!started || st.over || human) return;
    const t = setTimeout(() => {
      const m = botMove(s);
      if (m) play(m);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, started, human, st.over]);

  function play(m: HMove) {
    setS(applyMove(s, m));
    setLast(m);
    setSel(null);
    setPromo(null);
  }

  function reset() {
    setS(hordeStart());
    setSel(null);
    setLast(null);
    setPromo(null);
  }

  function click(r: number, f: number) {
    if (st.over || !human || promo) return;
    const ms = from.filter((m) => same(m.to, r, f));
    if (ms.length > 1) return setPromo(ms);
    if (ms.length === 1) return play(ms[0]);
    const p = s.board[r][f];
    setSel(p && p.c === s.turn ? [r, f] : null);
  }

  const turnName = s.turn === "w" ? "White (horde)" : "Black (army)";
  const text = st.over
    ? st.reason + (st.winner ? ` ${st.winner === "w" ? "White" : "Black"} wins!` : "")
    : `${turnName} to move${s.turn === "b" && inCheck(s, "b") ? " — Black is in check!" : ""}${human ? "" : " · MorseBot is thinking…"}`;
  const youWon = st.over && mode !== "hotseat" && st.winner === (mode === "bot-w" ? "w" : "b");
  return (
    <GameFrame
      title="Horde Chess"
      tagline="Thirty-six pawns against a full army."
      rules={HORDE_RULES}
      options={[
        { id: "hotseat", label: "2 players on this device", note: "Take turns — White first" },
        { id: "bot-w", label: "Play the horde (White) vs MorseBot" },
        { id: "bot-b", label: "Play the army (Black) vs MorseBot" },
      ]}
      onStart={(id) => { setMode(id as Mode); reset(); setStarted(true); }}
      started={started}
      onRules={() => setRules(true)}
      onReset={reset}
    >
      <div className="px-3 py-4">
        <p className="mb-2 text-center text-xs text-mist" data-horde-count>
          White {count(s.board, "w")} · Black {count(s.board, "b")}
        </p>
        <SquareBoard
          size={8}
          flipped={mode === "bot-b"}
          onClick={click}
          cell={(r, f) => {
            const p = s.board[r][f];
            const tgt = from.find((m) => same(m.to, r, f));
            return {
              content: p ? <PieceMark kind={p.t} tone={p.c} className="size-[82%]" /> : null,
              dot: !!tgt && !p,
              ring: !!tgt && !!p,
              mark: same(sel, r, f) ? "sel" : last && (same(last.from, r, f) || same(last.to, r, f)) ? "last" : undefined,
            };
          }}
        />
        <StatusBar tone={st.over ? (mode === "hotseat" ? "win" : youWon ? "win" : "lose") : "info"}>{text}</StatusBar>
      </div>
      {promo ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60" data-horde-promo>
          <div className="rounded-xl border border-[#e7c56a]/40 bg-[#1a140e] p-5 text-center">
            <p className="font-display text-lg">Promote to…</p>
            <div className="mt-3 flex gap-2">
              {(["q", "r", "b", "n"] as Kind[]).map((k) => (
                <button key={k} type="button" data-promo={k} className="grid size-14 place-items-center rounded-md bg-[#e8d6b4]" onClick={() => play(promo.find((m) => m.promo === k)!)}>
                  <PieceMark kind={k} tone="w" className="size-10" />
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <RulesModal open={rules} onClose={() => setRules(false)} rules={HORDE_RULES} title="Horde Chess" />
    </GameFrame>
  );
}
