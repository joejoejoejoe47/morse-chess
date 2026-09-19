import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { PieceKind } from "@/components/chess/marks";

export function HtmlPiece({
  kind,
  fill,
  edge,
  className,
}: {
  kind: PieceKind;
  fill: string;
  edge: string;
  className?: string;
}) {
  return (
    <span
      className={cn("mp", `mp-${kind}`, className)}
      style={{ "--mp-fill": fill, "--mp-edge": edge } as CSSProperties}
      aria-hidden
    >
      <i className="mp-hat" />
      <i className="mp-ear" />
      <i className="mp-head" />
      <i className="mp-collar" />
      <i className="mp-stem" />
      <i className="mp-waist" />
      <i className="mp-base" />
      <i className="mp-foot" />
    </span>
  );
}
