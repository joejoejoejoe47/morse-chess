import { cn } from "@/lib/utils";

export type PieceKind = "k" | "q" | "r" | "b" | "n" | "p";

const PATHS: Record<PieceKind, string> = {
  k: "M20 3.2v2.4h-2.1V8h2.1v1.6c-4.2.6-7.4 4.1-7.4 8.2V26h14.8v-8.2c0-4.1-3.2-7.6-7.4-8.2V8h2.1V5.6H22.1V3.2H20zm-9.2 24.2V30h18.4v-2.6H10.8z",
  q: "M8.2 11.2 11 13.4 13.4 8l2.6 6.4L20 6.4l4 8 2.6-6.4 2.4 5.4 2.8-2.2-.8 10.4H9zm1.6 16.2V30h20.4v-2.6H9.8zM11 23h18v2.2H11z",
  r: "M8 6.4h5.2V10H12v4h16V10h-1.2V6.4H32V14h-1.4v8.6H9.4V14H8zm2.8 18.4V30h18.4v-5.2H10.8z",
  b: "M20 5.2c2.6 0 4.8 2.4 4.8 5.4 0 2-1 3.7-2.6 4.6 3.2 1.4 5.4 4.6 5.4 8.4v1.6H12.4v-1.6c0-3.8 2.2-7 5.4-8.4-1.6-.9-2.6-2.6-2.6-4.6 0-3 2.2-5.4 4.8-5.4zm-1.4 6.2 1.4 2.4 1.4-2.4h-2.8zM11 27.2V30h18v-2.8H11z",
  n: "M10.4 30V26c0-3.2 1.2-5.6 3.4-8.2-2.2-.4-4.4-2.2-5-4.8-.4-1.8.4-3.6 2-4.6 1.2-3.2 4.4-5.2 8.2-5.2 1.8 0 3.4.4 4.8 1.2 1.2-.6 2.6-.4 3.6.6 1.2 1.2 1.2 3 0 4.2.8 1.4.8 3.2 0 4.6l-2.6 3.6c1.2 1.4 2 3.2 2.2 5.2V30H10.4zm8.4-18.4c.8-1.4.4-2.8-.8-3.4-.8-.4-1.8 0-2.2.8-.2.6 0 1.2.4 1.6.6.4 1.4.4 2 .2.4-.2.6-.6.6-1z",
  p: "M20 6.2c2.4 0 4.4 2 4.4 4.4 0 1.4-.6 2.6-1.6 3.4 2.2.8 3.8 2.8 3.8 5.2v1.6H13.4v-1.6c0-2.4 1.6-4.4 3.8-5.2-1-.8-1.6-2-1.6-3.4 0-2.4 2-4.4 4.4-4.4zM12.2 24.4V30h15.6v-5.6H12.2z",
};

export function PieceMark({
  kind,
  tone = "current",
  className,
  title,
}: {
  kind: PieceKind;
  tone?: "w" | "b" | "current";
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn(
        "overflow-visible",
        tone === "w" && "fill-piece-w stroke-piece-b",
        tone === "b" && "fill-piece-b stroke-piece-w",
        tone === "current" && "fill-current",
        className,
      )}
      strokeWidth={tone === "current" ? 0 : 1.2}
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={PATHS[kind]} />
    </svg>
  );
}

const START: Array<Array<[PieceKind, "w" | "b"] | null>> = [
  [
    ["r", "b"],
    ["n", "b"],
    ["b", "b"],
    ["q", "b"],
    ["k", "b"],
    ["b", "b"],
    ["n", "b"],
    ["r", "b"],
  ],
  Array.from({ length: 8 }, () => ["p", "b"] as [PieceKind, "w" | "b"]),
  Array.from({ length: 8 }, () => null),
  Array.from({ length: 8 }, () => null),
  Array.from({ length: 8 }, () => null),
  Array.from({ length: 8 }, () => null),
  Array.from({ length: 8 }, () => ["p", "w"] as [PieceKind, "w" | "b"]),
  [
    ["r", "w"],
    ["n", "w"],
    ["b", "w"],
    ["q", "w"],
    ["k", "w"],
    ["b", "w"],
    ["n", "w"],
    ["r", "w"],
  ],
];

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

export function MiniBoard({ className }: { className?: string }) {
  return (
    <div className={cn("select-none", className)}>
      <div className="flex gap-1.5">
        <div className="flex flex-col justify-around py-2 font-mono text-xs text-mist">
          {["8", "7", "6", "5", "4", "3", "2", "1"].map((rank) => (
            <span key={rank} className="leading-none">
              {rank}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="board-frame overflow-hidden rounded-lg">
            <div className="grid grid-cols-8">
              {START.flatMap((row, r) =>
                row.map((piece, f) => {
                  const light = (r + f) % 2 === 0;
                  return (
                    <div
                      key={`${r}${f}`}
                      className={cn(
                        "relative aspect-square grid place-items-center",
                        light ? "bg-cream" : "bg-walnut",
                      )}
                    >
                      {piece ? <PieceMark kind={piece[0]} tone={piece[1]} className="size-[78%]" /> : null}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
          <div className="mt-1.5 flex px-1 font-mono text-xs uppercase tracking-[0.18em] text-mist">
            {FILES.map((file) => (
              <span key={file} className="flex-1 text-center">
                {file}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CheckTile({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-10 shrink-0 grid-cols-2 overflow-hidden rounded-sm", className)}>
      <span className="bg-cream" />
      <span className="bg-walnut" />
      <span className="bg-walnut" />
      <span className="bg-cream" />
    </span>
  );
}
