import { cn } from "@/lib/utils";

export function RobotSeat({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <div className={cn("pointer-events-none flex flex-col items-center", className)}>
      <div className="relative grid h-36 w-28 place-items-center rounded-t-[2.5rem] border border-line bg-ink">
        <div className="absolute inset-x-3 top-3 h-16 rounded-lg border border-gold-line/40 bg-panel" />
        <div className="relative mt-2 flex gap-4">
          <span className="size-3 rounded-full bg-cream" />
          <span className="size-3 rounded-full bg-cream" />
        </div>
        <div className="absolute bottom-6 h-1.5 w-10 rounded-full bg-line-strong" />
        <div className="absolute -bottom-2 h-4 w-16 rounded-sm border border-line bg-panel" />
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-mist">{name}</p>
    </div>
  );
}
