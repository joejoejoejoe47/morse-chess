import { isMasterUsername } from "@/lib/chess/board-skins";

/** MasterGus's Sandbox opens his goblin project in the editor. */
export const MASTER_SANDBOX_URL = "https://alltherex.com/goblin/?id=proj_mastergus_sandbox_setup";
/** Every other signed-in player plays MasterGus's project. */
export const PLAYER_SANDBOX_URL = "https://alltherex.com/goblin/?id=proj_mastergus_sandbox_setup&play=true";

export function masterSandboxUrl(username: string | null | undefined): string | null {
  return username && isMasterUsername(username) ? MASTER_SANDBOX_URL : null;
}

/** Where the Sandbox goes for a signed-in user: editor for MasterGus, play mode for everyone else. */
export function sandboxUrlFor(username: string | null | undefined): string {
  return masterSandboxUrl(username) ?? PLAYER_SANDBOX_URL;
}
