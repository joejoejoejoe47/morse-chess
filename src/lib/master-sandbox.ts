import { isMasterUsername } from "@/lib/chess/board-skins";

/** MasterGus's Sandbox opens his goblin project (editor, not play mode). */
export const MASTER_SANDBOX_URL = "https://alltherex.com/goblin/?id=proj_mastergus_sandbox_setup";

export function masterSandboxUrl(username: string | null | undefined): string | null {
  return username && isMasterUsername(username) ? MASTER_SANDBOX_URL : null;
}
