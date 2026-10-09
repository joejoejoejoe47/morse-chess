import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthScreen, SplashSkeleton } from "@/components/auth-screen";
import { useClubDoor } from "@/lib/auth/use-club-door";
import { sandboxStatus } from "@/lib/server/mores";
import {
  CrossScene,
  TEAM_COLOR,
  TEAM_NAME,
  cellKey,
  inCenter,
  inCheck,
  kingOf,
  legalMoves,
  startUnits,
  teamLost,
  type Team,
  type Unit,
} from "@/components/sandbox/cross-scene";

export const Route = createFileRoute("/sandbox")({ ssr: false, component: SandboxPage });

const LOOKS = [
  { id: "/units/knight.glb", name: "Silver Knight" },
  { id: "/units/mage.glb", name: "Court Mage" },
  { id: "/units/barbarian.glb", name: "Barbarian" },
  { id: "/units/rogue.glb", name: "Rogue" },
  { id: "/units/rogue-hooded.glb", name: "Hooded" },
];

const ORDER: Team[] = ["W", "N", "E", "S"];

function SandboxPage() {
  const door = useClubDoor();
  const navigate = useNavigate();
  const [owned, setOwned] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (door.status !== "in") return;
    void sandboxStatus()
      .then((row) => setOwned(row.owned))
      .catch(() => setOwned(false));
  }, [door.status]);

  if (door.status === "pending" || owned == null) return <SplashSkeleton />;
  if (door.status === "auth") return <AuthScreen />;
  if (!owned) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#100e0c] px-6 text-center text-[#f6efe2]">
        <div>
          <p className="font-display text-3xl">Sandbox is locked.</p>
          <p className="mt-2 text-sm text-[#cbbba6]">Buy it from the lounge for 90 Morse coins.</p>
          <button type="button" className="mt-4 underline" onClick={() => void navigate({ to: "/" })}>
            Return to the lounge
          </button>
        </div>
      </main>
    );
  }
  if (!playing) {
    return (
      <main className="min-h-dvh bg-[#100e0c] px-5 py-8 text-[#f6efe2]">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="font-display text-4xl">Sandbox games</h1>
          <Link to="/" className="text-sm text-[#d9cbb8]">
            Lounge
          </Link>
        </div>
        <div className="mx-auto mt-6 flex max-w-5xl gap-4 overflow-x-auto pb-4">
          <button
            type="button"
            className="w-72 shrink-0 overflow-hidden rounded-2xl border border-[#8a7048] text-left"
            onClick={() => setPlaying(true)}
          >
            <img src="/sandbox/you-turn.png" alt="Cross Colosseum" className="h-40 w-full object-cover" />
            <div className="bg-[#1a140f] p-4">
              <p className="font-display text-2xl">Cross Colosseum</p>
              <p className="mt-1 text-sm text-[#cbbba6]">Four armies. One middle square. Build it or fall.</p>
            </div>
          </button>
        </div>
      </main>
    );
  }
  return <CrossMatch onExit={() => setPlaying(false)} />;
}

function CrossMatch({ onExit }: { onExit: () => void }) {
  const [units, setUnits] = useState<Unit[]>(() => startUnits());
  const [turn, setTurn] = useState<Team>("W");
  const [selected, setSelected] = useState<string | null>(null);
  const [allies, setAllies] = useState<Partial<Record<Team, Team>>>({});
  const [owner, setOwner] = useState<Team | null>(null);
  const [progress, setProgress] = useState(0);
  const [need, setNeed] = useState(10);
  const [ask, setAsk] = useState<{ unitId: string; other: Team; x: number; z: number } | null>(null);
  const [lost, setLost] = useState<Team[]>([]);
  const [winner, setWinner] = useState<Team | null>(null);
  const [look, setLook] = useState(LOOKS[0].id);
  const [note, setNote] = useState("Your west army moves first.");

  const moves = useMemo(() => {
    const unit = units.find((u) => u.id === selected);
    if (!unit || unit.team !== turn) return [];
    return legalMoves(units, unit, allies);
  }, [units, selected, turn, allies]);

  function finishIfNeeded(next: Unit[], nextAllies: Partial<Record<Team, Team>>) {
    const gone = ORDER.filter((team) => teamLost(next, team, nextAllies));
    setLost(gone);
    if (gone.includes("W") && !gone.every((t) => t === "W")) setNote("Your king is finished.");
  }

  function afterMove(next: Unit[], team: Team, nextAllies: Partial<Record<Team, Team>>) {
    const holders = next.filter((u) => u.alive && inCenter(u.x, u.z));
    const teams = [...new Set(holders.map((u) => u.team))];
    let nextOwner = owner;
    let nextProgress = progress;
    let nextNeed = need;
    if (teams.length === 1) {
      const hold = teams[0];
      if (owner !== hold) {
        nextOwner = hold;
        nextProgress = 0;
        nextNeed = holders.length >= 2 ? 9 : 10;
      } else {
        nextNeed = holders.length >= 2 ? 9 : 10;
        if (team === hold) nextProgress += 1;
      }
    } else if (teams.length === 0) {
      nextOwner = null;
      nextProgress = 0;
    }
    setOwner(nextOwner);
    setProgress(nextProgress);
    setNeed(nextNeed);
    if (nextOwner && nextProgress >= nextNeed) {
      setWinner(nextOwner);
      setNote(`${TEAM_NAME[nextOwner]} raised the colosseum.`);
      return;
    }
    finishIfNeeded(next, nextAllies);
    const aliveTeams = ORDER.filter((t) => !teamLost(next, t, nextAllies));
    if (aliveTeams.length === 1) {
      setWinner(aliveTeams[0]);
      return;
    }
    let cursor = ORDER.indexOf(team);
    for (let i = 0; i < 4; i++) {
      cursor = (cursor + 1) % 4;
      if (!teamLost(next, ORDER[cursor], nextAllies)) {
        setTurn(ORDER[cursor]);
        setSelected(null);
        setNote(ORDER[cursor] === "W" ? "Your turn." : `${TEAM_NAME[ORDER[cursor]]} is moving.`);
        return;
      }
    }
  }

  function applyMove(unitId: string, x: number, z: number, nextAllies = allies) {
    const mover = units.find((u) => u.id === unitId);
    if (!mover) return;
    const next = units.map((u) => {
      if (!u.alive) return u;
      if (u.id === unitId) return { ...u, x, z, shake: nextAllies[mover.team] ? 8 : 0 };
      if (cellKey(u.x, u.z) === cellKey(x, z) && u.team !== mover.team && nextAllies[mover.team] !== u.team) {
        return { ...u, alive: false };
      }
      return u;
    });
    setUnits(next);
    setAsk(null);
    afterMove(next, mover.team, nextAllies);
  }

  function tryMove(x: number, z: number) {
    if (turn !== "W" || winner || ask) return;
    const unit = units.find((u) => u.id === selected && u.team === "W");
    if (!unit) return;
    if (!moves.some((m) => m.x === x && m.z === z)) return;
    const others = units.filter((u) => u.alive && u.id !== unit.id && cellKey(u.x, u.z) === cellKey(x, z));
    if (inCenter(x, z) && others.length && others.every((o) => o.team !== "W")) {
      const other = others[0].team;
      if (allies.W && allies.W !== other) {
        applyMove(unit.id, x, z);
        return;
      }
      setAsk({ unitId: unit.id, other, x, z });
      return;
    }
    applyMove(unit.id, x, z);
  }

  useEffect(() => {
    if (turn === "W" || winner || ask) return;
    const timer = window.setTimeout(() => {
      const mine = units.filter((u) => u.alive && u.team === turn);
      const options = mine.flatMap((u) => legalMoves(units, u, allies).map((m) => ({ u, m })));
      if (!options.length) {
        afterMove(units, turn, allies);
        return;
      }
      const pick = options[Math.floor(Math.random() * options.length)];
      applyMove(pick.u.id, pick.m.x, pick.m.z);
    }, 700);
    return () => window.clearTimeout(timer);
    // AI step is intentionally tied to the turn token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, winner, ask]);

  const playerLost = lost.includes("W") || (winner != null && winner !== "W");
  const playerWon = winner === "W";

  return (
    <main className="relative h-dvh bg-[#0e0c0a] text-[#f6efe2]">
      <div className="absolute inset-0">
        <CrossScene units={units} look={look} owner={owner} progress={progress} />
      </div>
      <header className="pointer-events-none absolute left-4 top-4 z-10 max-w-sm">
        <p className="font-display text-3xl">Cross Colosseum</p>
        <p className="mt-1 text-sm text-[#f0e6d4]">{note}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[#e7c98a]">
          {owner ? `${TEAM_NAME[owner]} building ${progress}/${need}` : "Middle square is empty"}
          {inCheck(units, "W", allies) ? " · your king is in check" : ""}
        </p>
      </header>
      <aside className="absolute right-4 top-4 z-10 w-44">
        {turn === "W" && !winner ? (
          <img src="/sandbox/you-turn.png" alt="You turn" className="w-full rounded-lg border border-[#c9a46a] shadow-lg" />
        ) : null}
        <label className="mt-3 block rounded-lg bg-black/55 p-2 text-xs">
          Your RA look
          <select
            className="mt-1 w-full bg-[#1b140e] p-1"
            value={look}
            onChange={(e) => setLook(e.target.value)}
          >
            {LOOKS.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
      </aside>
      <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-2">
        {ORDER.map((team) => (
          <span
            key={team}
            className="rounded-full px-3 py-1 text-xs"
            style={{ background: TEAM_COLOR[team], color: "#1a120c", opacity: lost.includes(team) ? 0.35 : 1 }}
          >
            {TEAM_NAME[team]}
            {kingOf(units, team) ? "" : " fallen"}
            {turn === team ? " · turn" : ""}
          </span>
        ))}
      </div>
      <BoardClicks units={units} selected={selected} moves={moves} onPick={setSelected} onMove={tryMove} disabled={turn !== "W" || Boolean(winner)} />
      {ask ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 p-4">
          <div className="max-w-md rounded-2xl border border-[#c9a46a] bg-[#16110c] p-6 text-center">
            <p className="font-display text-3xl">Middle square</p>
            <p className="mt-2 text-sm text-[#e7dccb]">
              {TEAM_NAME[ask.other]} already stands there. Dominate the square, or make allies. Allies cannot kill each other. You cannot be allies with two people.
            </p>
            <div className="mt-5 flex justify-center gap-3">
              <button type="button" className="rounded-full bg-[#c9a46a] px-4 py-2 text-[#1a120c]" onClick={() => applyMove(ask.unitId, ask.x, ask.z)}>
                Dominate
              </button>
              <button
                type="button"
                className="rounded-full border border-[#e7dccb] px-4 py-2"
                onClick={() => {
                  if (allies.W && allies.W !== ask.other) {
                    setNote("You already have an ally.");
                    setAsk(null);
                    return;
                  }
                  const nextAllies = { ...allies, W: ask.other, [ask.other]: "W" as Team };
                  setAllies(nextAllies);
                  const next = units.map((u) =>
                    u.id === ask.unitId || (u.alive && u.team === ask.other && inCenter(u.x, u.z)) ? { ...u, shake: 12 } : u,
                  );
                  setUnits(next);
                  setNote("They shake hands. Neither army can kill the other.");
                  applyMove(ask.unitId, ask.x, ask.z, nextAllies);
                }}
              >
                Make allies
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {playerWon ? (
        <EndScreen
          image
          title="Colosseum stands"
          body="You built it. Everyone else loses."
          onAgain={() => window.location.reload()}
          onHome={onExit}
        />
      ) : null}
      {playerLost && !playerWon ? (
        <EndScreen
          title="DEFEAT"
          body="Your king fell, stood alone, was mated, or had only pawns left."
          onAgain={() => window.location.reload()}
          onHome={onExit}
        />
      ) : null}
    </main>
  );
}

function BoardClicks({
  units,
  selected,
  moves,
  onPick,
  onMove,
  disabled,
}: {
  units: Unit[];
  selected: string | null;
  moves: { x: number; z: number }[];
  onPick: (id: string | null) => void;
  onMove: (x: number, z: number) => void;
  disabled: boolean;
}) {
  const cells: { x: number; z: number }[] = [];
  for (let x = -12; x <= 11; x++) {
    for (let z = -12; z <= 11; z++) {
      const arm =
        (x >= -4 && x <= 3 && z >= -4 && z <= 3) ||
        (x >= -12 && x <= -5 && z >= -4 && z <= 3) ||
        (x >= 4 && x <= 11 && z >= -4 && z <= 3) ||
        (z >= -12 && z <= -5 && x >= -4 && x <= 3) ||
        (z >= 4 && z <= 11 && x >= -4 && x <= 3);
      if (arm) cells.push({ x, z });
    }
  }
  return (
    <div className="pointer-events-none absolute bottom-16 right-4 z-10 hidden max-h-[46vh] w-64 overflow-auto rounded-xl bg-black/45 p-2 md:block">
      <p className="mb-1 text-[10px] uppercase tracking-[0.16em] text-[#e7c98a]">Squares</p>
      <p className="text-[10px] text-[#f0e6d4]">Your west board</p>
      <div className="grid grid-cols-8 gap-px">
        {cells
          .filter((c) => c.x >= -12 && c.x <= -5 && c.z >= -4 && c.z <= 3)
          .map((c) => {
            const here = units.find((u) => u.alive && cellKey(u.x, u.z) === cellKey(c.x, c.z) && u.x === c.x && u.z === c.z);
            const hot = moves.some((m) => m.x === c.x && m.z === c.z);
            return (
              <button
                key={`${c.x},${c.z}`}
                type="button"
                disabled={disabled}
                className="pointer-events-auto h-6 text-[9px]"
                style={{
                  background: inCenter(c.x, c.z) ? "#8a5a28" : (c.x + c.z) % 2 ? "#6d5340" : "#cbb98a",
                  outline: hot ? "2px solid #f2e2b0" : selected && here?.id === selected ? "2px solid #fff" : "none",
                  color: "#1a120c",
                }}
                onClick={() => {
                  if (here?.team === "W") onPick(here.id);
                  else if (hot) onMove(c.x, c.z);
                }}
              >
                {here ? here.kind.toUpperCase() : ""}
              </button>
            );
          })}
      </div>
      <p className="mt-2 text-[10px] text-[#f0e6d4]">Middle board</p>
      <div className="grid grid-cols-8 gap-px">
        {cells
          .filter((c) => c.x >= -4 && c.x <= 3 && c.z >= -4 && c.z <= 3)
          .map((c) => {
            const here = units.find((u) => u.alive && u.x === c.x && u.z === c.z);
            const hot = moves.some((m) => m.x === c.x && m.z === c.z);
            return (
              <button
                key={`m${c.x},${c.z}`}
                type="button"
                disabled={disabled}
                className="pointer-events-auto h-6 text-[9px]"
                style={{
                  background: inCenter(c.x, c.z) ? "#8a5a28" : (c.x + c.z) % 2 ? "#6d5340" : "#cbb98a",
                  outline: hot ? "2px solid #f2e2b0" : "none",
                  color: "#1a120c",
                }}
                onClick={() => {
                  if (here?.team === "W") onPick(here.id);
                  else if (hot) onMove(c.x, c.z);
                }}
              >
                {here ? here.kind.toUpperCase() : ""}
              </button>
            );
          })}
      </div>
    </div>
  );
}

function EndScreen({
  title,
  body,
  image,
  onAgain,
  onHome,
}: {
  title: string;
  body: string;
  image?: boolean;
  onAgain: () => void;
  onHome: () => void;
}) {
  return (
    <div
      className="absolute inset-0 z-30 grid place-items-center bg-black/72 p-6 text-center"
      style={image ? { backgroundImage: "linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.72)), url(/sandbox/you-turn.png)", backgroundSize: "cover" } : undefined}
    >
      <div>
        <p className="font-display text-7xl tracking-wide text-[#f8f1e4]">{title}</p>
        <p className="mt-3 text-[#f0e6d4]">{body}</p>
        <div className="mt-6 flex justify-center gap-3">
          <button type="button" className="rounded-full bg-[#c9a46a] px-5 py-2 text-[#1a120c]" onClick={onAgain}>
            Another game
          </button>
          <button type="button" className="rounded-full border border-[#f0e6d4] px-5 py-2" onClick={onHome}>
            Return home
          </button>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-[#f0e6d4]">Middle board</p>
      <div className="grid grid-cols-8 gap-px">
        {cells
          .filter((c) => c.x >= -4 && c.x <= 3 && c.z >= -4 && c.z <= 3)
          .map((c) => {
            const here = units.find((u) => u.alive && u.x === c.x && u.z === c.z);
            const hot = moves.some((m) => m.x === c.x && m.z === c.z);
            return (
              <button
                key={`m${c.x},${c.z}`}
                type="button"
                disabled={disabled}
                className="pointer-events-auto h-6 text-[9px]"
                style={{
                  background: inCenter(c.x, c.z) ? "#8a5a28" : (c.x + c.z) % 2 ? "#6d5340" : "#cbb98a",
                  outline: hot ? "2px solid #f2e2b0" : "none",
                  color: "#1a120c",
                }}
                onClick={() => {
                  if (here?.team === "W") onPick(here.id);
                  else if (hot) onMove(c.x, c.z);
                }}
              >
                {here ? here.kind.toUpperCase() : ""}
              </button>
            );
          })}
      </div>
    </div>
  );
}
