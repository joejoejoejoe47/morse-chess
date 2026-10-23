// Client stubs: the logic lives in the PHP backend (php/src/LegoBuilder.php).
import { rpc } from "@/lib/rpc";
import type { LegoPiece } from "@/lib/lego-build";

export type LegoBuildSummary = { id: string; name: string; count: number; active: boolean; updatedAt: string };
export type LegoBuilderState = {
  allowed: boolean;
  coins: number;
  prices: Record<string, number>;
  owned: string[];
  builds: LegoBuildSummary[];
};
export type LegoBuild = { id: string; name: string; active?: boolean; pieces: LegoPiece[] };

export const legoBuilderState = rpc<LegoBuilderState>("legoBuilderState");
export const buyLegoPart = rpc<{ coins: number; owned: string[] }>("buyLegoPart");
export const saveLegoBuild = rpc<{ id: string; builds: LegoBuildSummary[] }>("saveLegoBuild");
export const getLegoBuild = rpc<LegoBuild>("getLegoBuild");
export const deleteLegoBuild = rpc<{ builds: LegoBuildSummary[] }>("deleteLegoBuild");
export const putLegoBuildInUse = rpc<{ builds: LegoBuildSummary[] }>("useLegoBuild");
export const activeLegoBuild = rpc<LegoBuild | null>("activeLegoBuild");
