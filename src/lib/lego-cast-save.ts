import { encodeCast, legoCast } from "@/lib/lego-look";
import { getAvatar, saveAvatar } from "@/lib/server/avatar";

let timer = 0;

/** Remember the lineup on the account so an intended pull-up can show it to the other player. */
export function saveCast() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    const lgCast = encodeCast(legoCast());
    void getAvatar({ data: {} })
      .then((row: { loadout?: Record<string, string> } | null) => {
        if (!row?.loadout) return;
        return saveAvatar({ data: { loadout: { ...row.loadout, lgCast } } });
      })
      .catch(() => {
        /* not signed in: the lineup still stays on this screen */
      });
  }, 400);
}