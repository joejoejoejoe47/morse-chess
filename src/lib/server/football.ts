// Client stubs: the logic lives in the PHP backend (php/src/Football.php).
import { rpc } from "@/lib/rpc";

export type FootballTeam = { name: string; color: string };
export type FootballPrefs = {
  team: FootballTeam | null;
  /** boardId -> start square ("a1".."h2") -> name */
  names: Record<string, Record<string, string>>;
  board: string;
  /** which football field to play on (Boards page) */
  field: FootballField;
};

export type FootballField = "neon" | "park";

export const getFootballPrefs = rpc<FootballPrefs>("getFootballPrefs");
export const saveFootballTeam = rpc<FootballPrefs>("saveFootballTeam");
export const savePieceName = rpc<FootballPrefs>("savePieceName");
export const saveFootballField = rpc<FootballPrefs>("saveFootballField");
