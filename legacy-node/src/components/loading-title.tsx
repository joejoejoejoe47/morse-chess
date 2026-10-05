export function LoadingTitle({ text }: { text: string }) {
  return (
    <div className="grid h-full min-h-36 place-items-center px-6">
      <p className="font-display text-4xl text-ivory">{text}</p>
    </div>
  );
}
