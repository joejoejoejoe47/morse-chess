import type { Side } from "@/game/engine";
import { GROUNDS, type GroundId } from "@/game/grounds";
import { asset } from "@/lib/base";

export type Screen = "menu" | "conditions" | "deploy" | "away";
export type Mode = "battle" | "skill" | "training";

type MenuProps = {
  screen: Screen;
  motion: "idle" | "out" | "in";
  mode: Mode;
  anim: number;
  speed: number;
  characters: number;
  ground: number;
  side: Side;
  coins: number;
  note: string | null;
  onMode: (mode: Mode) => void;
  onAnim: (value: number) => void;
  onSpeed: (value: number) => void;
  onCharacters: (value: number) => void;
  onGround: (dir: -1 | 1) => void;
  onSide: () => void;
  onAway: () => void;
  onBackHome: () => void;
  onOnward: () => void;
  onRetreat: () => void;
  onBattle: () => void;
  onReturn: () => void;
  onLounge?: () => void;
};

const MODE_LINE: Record<Mode, string> = {
  battle: "New Battle",
  skill: "Skill Challenge",
  training: "Training Grounds",
};

export function MorseMenus(props: MenuProps) {
  const chainsLong = props.motion === "out";
  const signClass = props.motion === "out" ? "sign sign-out" : props.motion === "in" ? "sign sign-in" : "sign";
  return (
    <div className="stage">
      <img className="valley" src={asset("/battle/valley.jpg")} alt="" />
      <div className="shade" />
      {props.screen === "away" ? (
        <div className="away">
          <p className="eyebrow">The valley</p>
          <h1>You step back from the sign.</h1>
          <button type="button" className="iron-btn" onClick={props.onReturn}>
            Return to the sign
          </button>
          {props.onLounge ? (
            <button type="button" className="iron-btn lounge" onClick={props.onLounge}>
              Lounge
            </button>
          ) : null}
        </div>
      ) : (
        <div className="hang">
          <Crest />
          <div className="chain-row">
            <Chain long={chainsLong} />
            <Chain long={chainsLong} />
          </div>
          <div className={signClass}>
            <div className="sign-frame">
              <span className="bracket tl" />
              <span className="bracket tr" />
              <span className="bracket bl" />
              <span className="bracket br" />
              {props.screen === "menu" ? <MenuBoard {...props} /> : null}
              {props.screen === "conditions" ? <ConditionsBoard {...props} /> : null}
              {props.screen === "deploy" ? <DeployBoard {...props} /> : null}
            </div>
          </div>
          <p className="purse">
            <Coin /> {props.coins.toLocaleString()} Morse coins
          </p>
          {props.note ? <p className="note">{props.note}</p> : null}
        </div>
      )}
    </div>
  );
}

function MenuBoard({ onMode, onAway }: MenuProps) {
  return (
    <>
      <p className="plaque">Single Player</p>
      <button type="button" className="plank" onClick={() => onMode("battle")}>
        New Battle
      </button>
      <button type="button" className="plank" onClick={() => onMode("skill")}>
        Skill Challenge
      </button>
      <button type="button" className="plank" onClick={() => onMode("training")}>
        Training Grounds
      </button>
      <div className="plank split">
        <button type="button" className="plank-half" onClick={onAway}>
          Retreat
        </button>
        <span className="plank-half mute" aria-hidden>
          <i className="stud" />
        </span>
      </div>
    </>
  );
}

function ConditionsBoard(props: MenuProps) {
  return (
    <>
      <p className="plaque">Battle Conditions</p>
      <p className="mode-line">{MODE_LINE[props.mode]}</p>
      <SliderRow
        name="Battle Animations"
        caption={props.anim > 0.66 ? "Show me everything" : props.anim > 0.33 ? "The loud blows" : "Keep it quiet"}
        value={props.anim}
        onChange={props.onAnim}
      />
      <SliderRow
        name="Movement Speed"
        caption={props.speed > 0.66 ? "Don't waste too much time" : props.speed > 0.33 ? "A steady march" : "Let them take their time"}
        value={props.speed}
        onChange={props.onSpeed}
      />
      <SliderRow
        name="Chess Pieces"
        caption={props.characters > 0.5 ? "Characters" : "Chess pieces"}
        value={props.characters}
        onChange={props.onCharacters}
      />
      <div className="plank split">
        <button type="button" className="plank-half" onClick={props.onBackHome}>
          Back Home
        </button>
        <button type="button" className="plank-half onward" onClick={props.onOnward}>
          Onward
        </button>
      </div>
    </>
  );
}

function DeployBoard(props: MenuProps) {
  const ground = GROUNDS[props.ground] ?? GROUNDS[0];
  const light = props.side === "w";
  return (
    <>
      <p className="plaque">Battle Deployment</p>
      <div className="deploy-labels">
        <span>Battleground</span>
        <button type="button" className="text-btn" onClick={props.onSide}>
          Allegiance
        </button>
      </div>
      <div className="preview">
        <button type="button" className="arrow" onClick={() => props.onGround(-1)} aria-label="Previous ground">
          ‹
        </button>
        <img src={ground.image} alt="" />
        <button type="button" className="portrait-hit" onClick={props.onSide} aria-label="Change allegiance">
          <img className="portrait" src={light ? asset("/battle/queen.jpg") : asset("/battle/king.jpg")} alt="" />
        </button>
        <button type="button" className="arrow right" onClick={() => props.onGround(1)} aria-label="Next ground">
          ›
        </button>
        <div className="preview-caps">
          <span>{ground.name}</span>
          <span>{light ? "First to move" : "Second to move"}</span>
        </div>
        <p className="cost-pip">
          <Coin /> 10
        </p>
      </div>
      <div className="plank split">
        <button type="button" className="plank-half" onClick={props.onRetreat}>
          Retreat
        </button>
        <button type="button" className="plank-half onward" onClick={props.onBattle}>
          Battle
        </button>
      </div>
    </>
  );
}

function SliderRow({
  name,
  caption,
  value,
  onChange,
}: {
  name: string;
  caption: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="cond">
      <span className="cond-name">{name}</span>
      <label className="cond-slider">
        <span className="cond-cap">{caption}</span>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(value * 1000)}
          onChange={(event) => onChange(Number(event.target.value) / 1000)}
        />
      </label>
    </div>
  );
}

function Chain({ long }: { long: boolean }) {
  return (
    <div className={long ? "chain-wrap long" : "chain-wrap"}>
      <div className="chain">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} className="link" />
        ))}
      </div>
    </div>
  );
}

function Coin() {
  return <span className="coin">M</span>;
}

function Crest() {
  return (
    <div className="crest" aria-hidden>
      <svg className="wing left" viewBox="0 0 120 70">
        <path d="M110 40 C70 10 30 18 8 36 C40 28 70 34 110 52" fill="none" stroke="currentColor" strokeWidth="6" />
        <path d="M96 28 C70 16 40 20 18 30" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
      <div className="crest-beast left">
        <svg viewBox="0 0 64 64">
          <path d="M14 40c8-18 22-22 30-14-6 2-8 8-6 12 6-2 12 2 14 8-10 2-16-2-22 2-4 6-10 8-16 6 4-4 6-8 0-14z" />
          <circle cx="40" cy="24" r="2.2" fill="#1a120e" />
        </svg>
      </div>
      <div className="wordmark">
        <span>Morse</span>
        <span>
          Chess <i />
        </span>
      </div>
      <div className="crest-beast right">
        <svg viewBox="0 0 64 64">
          <path d="M18 46c2-16 14-22 22-16 2-8 10-10 16-6-6 4-6 10-2 14 6 0 10 6 8 12-8-2-12-8-18-6-2 6-8 10-16 8 2-2 4-4-10-6z" />
          <circle cx="42" cy="22" r="2" fill="#1a120e" />
        </svg>
      </div>
      <svg className="wing right" viewBox="0 0 120 70">
        <path d="M10 40 C50 10 90 18 112 36 C80 28 50 34 10 52" fill="none" stroke="currentColor" strokeWidth="6" />
        <path d="M24 28 C50 16 80 20 102 30" fill="none" stroke="currentColor" strokeWidth="3" />
      </svg>
    </div>
  );
}

export function groundId(index: number): GroundId {
  return GROUNDS[index]?.id ?? "throne";
}
