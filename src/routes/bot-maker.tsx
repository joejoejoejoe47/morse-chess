import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Mars, Venus } from "lucide-react";
import { ClubBrand } from "@/components/club-brand";
import { Button } from "@/components/ui/button";
import { BOT_MODELS, addBot, cleanBotName, guessVoice, nameIsTaken, summonBot, type BotVoice, type MyBot } from "@/lib/bots/store";

const RobotStage = lazy(() => import("@/components/bots/robot-model"));

export const Route = createFileRoute("/bot-maker")({ component: BotMaker });

function BotMaker() {
  const [idx, setIdx] = useState(0);
  const [name, setName] = useState("Robo");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("Robo");
  const [voice, setVoice] = useState<BotVoice>("male");
  const [voiceSet, setVoiceSet] = useState(false);
  const [step, setStep] = useState<"make" | "rules" | "done">("make");
  const [made, setMade] = useState<MyBot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const model = BOT_MODELS[idx];

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);
  useEffect(() => {
    if (!voiceSet) setVoice(guessVoice(name));
  }, [name, voiceSet]);

  function confirmName() {
    const n = cleanBotName(draft);
    if (nameIsTaken(n)) {
      setErr("That name belongs to the house bots. Pick your own!");
      return;
    }
    setErr(null);
    setName(n);
    setDraft(n);
    setEditing(false);
  }
  const step2 = (d: number) => setIdx((i) => (i + d + BOT_MODELS.length) % BOT_MODELS.length);

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 py-3 sm:px-8" data-bot-maker>
      <div className="check-wash pointer-events-none absolute inset-0" />
      <header className="relative z-10 flex items-center justify-between gap-3 py-2">
        <ClubBrand />
        <Link to="/" className="mr-24 text-sm text-mist sm:mr-28 underline-offset-4 hover:text-ivory hover:underline">
          ← Lounge
        </Link>
      </header>
      <p className="relative mt-2 text-center text-xs uppercase tracking-[0.2em] text-mist">Create Bot · Coach · Teacher</p>

      <div className="relative mt-3 flex min-h-16 items-center justify-center" data-bot-name-area>
        {editing ? (
          <input
            ref={input}
            data-bot-name-input
            value={draft}
            maxLength={20}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmName();
              if (e.key === "Escape") {
                setDraft(name);
                setEditing(false);
              }
            }}
            onBlur={confirmName}
            className="w-full max-w-md rounded-xl border border-gold-line bg-ink/80 px-4 py-2 text-center font-display text-5xl text-ivory outline-none"
            aria-label="Bot name"
          />
        ) : (
          <button
            type="button"
            data-bot-name
            title="Click to rename"
            onClick={() => setEditing(true)}
            className="font-display text-5xl text-ivory hover:text-[#f6e7b2] sm:text-6xl"
          >
            {name}
          </button>
        )}
      </div>
      {err ? <p className="relative text-center text-sm text-danger">{err}</p> : null}

      <div className="relative mt-2 flex flex-1 items-center justify-center gap-2">
        <button
          type="button"
          aria-label="Previous robot"
          data-bot-prev
          onClick={() => step2(-1)}
          className="grid size-14 shrink-0 place-items-center rounded-full border border-line bg-walnut/80 text-ivory hover:border-gold-line"
        >
          <ChevronLeft className="size-7" />
        </button>
        <div className="relative h-[min(52vh,460px)] w-full max-w-md">
          <Suspense fallback={<div className="grid h-full place-items-center text-mist">Booting robot…</div>}>
            <RobotStage model={model.id} className="h-full w-full" />
          </Suspense>
        </div>
        <button
          type="button"
          aria-label="Next robot"
          data-bot-next
          onClick={() => step2(1)}
          className="grid size-14 shrink-0 place-items-center rounded-full border border-line bg-walnut/80 text-ivory hover:border-gold-line"
        >
          <ChevronRight className="size-7" />
        </button>
      </div>
      <p className="relative text-center text-[11px] text-mist">
        Model {idx + 1}/{BOT_MODELS.length}: “{model.title}” by{" "}
        <a className="underline" href={model.source} target="_blank" rel="noreferrer">
          {model.author}
        </a>{" "}
        · CC BY 4.0
      </p>

      <div className="relative mt-3 flex items-center justify-center gap-2 text-sm text-mist" role="radiogroup" aria-label="Voice">
        Voice:
        {(["male", "female"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={voice === v}
            data-bot-voice={v}
            onClick={() => {
              setVoice(v);
              setVoiceSet(true);
            }}
            className={"inline-flex items-center gap-1 rounded-full border px-3 py-1.5 " + (voice === v ? "border-gold-line bg-walnut text-ivory" : "border-line")}
          >
            {v === "male" ? <Mars className="size-4" /> : <Venus className="size-4" />}
            {v === "male" ? "Male" : "Female"}
          </button>
        ))}
      </div>

      <div className="relative mb-6 mt-4 flex justify-center">
        <Button size="lg" data-create-bot onClick={() => setStep("rules")} className="min-w-56 text-lg">
          Create Bot
        </Button>
      </div>

      {step !== "make" ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" data-bot-popup={step}>
          <div className="w-full max-w-md rounded-2xl border border-gold-line/60 bg-panel p-6 text-ivory shadow-2xl">
            {step === "rules" ? (
              <>
                <h2 className="font-display text-3xl">Meet {name}!</h2>
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-cream">
                  <li>After you press OK, {name} gets a secret <b>summon code</b> made of letters.</li>
                  <li>Type those letters anywhere on the 2D screens (or click the code) and {name} pops up.</li>
                  <li>Tap the mic and talk, or type. {name} talks back in a {voice} voice.</li>
                  <li>Ask “how do I…?” and {name} walks (or flies!) to the right button and points at it.</li>
                  <li>In a game, say “coach me” or “make me better” and {name} draws arrows and explains the best move.</li>
                  <li>Play {name} from the lounge: “Timed or breeze vs {name}”.</li>
                  <li>Press Esc or the × to send {name} away.</li>
                </ul>
                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setStep("make")}>
                    Back
                  </Button>
                  <Button
                    data-bot-ok
                    onClick={() => {
                      setMade(addBot({ name, model: model.id, voice }));
                      setStep("done");
                    }}
                  >
                    OK
                  </Button>
                </div>
              </>
            ) : made ? (
              <>
                <h2 className="font-display text-3xl">{made.name} is ready!</h2>
                <p className="mt-2 text-sm text-mist">Summon code, type it or click it:</p>
                <button
                  type="button"
                  data-summon-code={made.code}
                  onClick={() => summonBot(made.id)}
                  className="mt-2 flex w-full justify-center gap-2"
                >
                  {made.code.split("").map((ch, i) => (
                    <span key={i} className="grid size-14 place-items-center rounded-lg border border-gold-line bg-walnut font-display text-3xl text-[#f6e7b2]">
                      {ch}
                    </span>
                  ))}
                </button>
                <div className="mt-5 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setStep("make")}>
                    Make another
                  </Button>
                  <Button asChild>
                    <Link to="/">Back to lounge</Link>
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}
