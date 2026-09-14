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
      <div className="relative grid h-80 w-56 place-items-center rounded-t-[3.4rem] border border-line bg-ink sm:h-[26rem] sm:w-72">
        <div className="absolute inset-x-6 top-6 h-28 rounded-lg border border-gold-line/40 bg-panel sm:h-36" />
        <div className="relative mt-4 flex gap-8">
          <span className="size-5 rounded-full bg-cream sm:size-6" />
          <span className="size-5 rounded-full bg-cream sm:size-6" />
        </div>
        <div className="absolute bottom-12 h-2.5 w-20 rounded-full bg-line-strong" />
        <div className="absolute -bottom-2 h-6 w-28 rounded-sm border border-line bg-panel" />
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-mist">{name}</p>
    </div>
  );
}
