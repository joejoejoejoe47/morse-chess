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
      <div className="relative grid h-52 w-36 place-items-center rounded-t-[2.8rem] border border-line bg-ink sm:h-64 sm:w-44">
        <div className="absolute inset-x-4 top-4 h-20 rounded-lg border border-gold-line/40 bg-panel sm:h-24" />
        <div className="relative mt-2 flex gap-5">
          <span className="size-3.5 rounded-full bg-cream sm:size-4" />
          <span className="size-3.5 rounded-full bg-cream sm:size-4" />
        </div>
        <div className="absolute bottom-8 h-2 w-14 rounded-full bg-line-strong" />
        <div className="absolute -bottom-2 h-5 w-20 rounded-sm border border-line bg-panel" />
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-mist">{name}</p>
    </div>
  );
}
