import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ChevronDown, ChevronUp, Music2, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loadSoundtrack,
  removeSoundtrackSong,
  saveSoundtrack,
  subscribeSoundtrack,
  unlockSoundtrack,
  uploadSoundtrackSong,
  type Soundtrack,
  type SoundtrackSettings,
} from "@/lib/soundtrack";

export function SoundtrackPanel({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<SoundtrackSettings>(() => loadSoundtrack(accountId));
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const sync = () => setSettings(loadSoundtrack(accountId));
    sync();
    return subscribeSoundtrack(sync);
  }, [accountId]);

  function commit(next: SoundtrackSettings) {
    setSettings(next);
    saveSoundtrack(accountId, next);
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    if (!chosen || chosen.size > 8 * 1024 * 1024) return;
    setBusy(true);
    try {
      await uploadSoundtrackSong(accountId, chosen);
    } finally {
      setBusy(false);
    }
  }

  function createList() {
    const title = name.trim();
    if (!title || !picked.length) return;
    const list: Soundtrack = { id: crypto.randomUUID(), name: title, songIds: picked };
    commit({
      ...settings,
      lists: [...settings.lists, list],
      activeId: settings.activeId ?? list.id,
    });
    setName("");
    setPicked([]);
  }

  function move(listId: string, index: number, dir: -1 | 1) {
    commit({
      ...settings,
      lists: settings.lists.map((list) => {
        if (list.id !== listId) return list;
        const next = list.songIds.slice();
        const to = index + dir;
        if (to < 0 || to >= next.length) return list;
        const [song] = next.splice(index, 1);
        next.splice(to, 0, song);
        return { ...list, songIds: next };
      }),
    });
  }

  const songName = (id: string) => settings.songs.find((song) => song.id === id)?.name ?? "Missing song";

  return (
    <Card className="relative space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ivory">Soundtrack</h2>
          <p className="mt-1 text-sm text-mist">
            {settings.unmuted ? "Your soundtrack is playing through the club." : "Muted until you unmute it."}
          </p>
        </div>
        <Button type="button" variant="solid" className="rounded-full" onClick={() => setOpen((value) => !value)}>
          <Music2 className="size-4" />
          Soundtrack
        </Button>
      </div>
      {open ? (
        <div className="space-y-4">
          <Button
            type="button"
            variant={settings.unmuted ? "solid" : "secondary"}
            className="rounded-full"
            onClick={() => {
              const next = !settings.unmuted;
              if (next) unlockSoundtrack();
              commit({ ...settings, unmuted: next });
            }}
          >
            {settings.unmuted ? "Unmuted" : "Unmute the soundtrack"}
          </Button>
          <div className="rounded-md border border-line bg-ink-soft p-4">
            <Label>Songs from this browser</Label>
            <p className="mt-1 text-sm text-mist">Upload a song, then put it on a soundtrack in any order.</p>
            <input ref={file} type="file" accept="audio/*" className="hidden" onChange={(e) => void onFile(e)} />
            <Button type="button" variant="secondary" size="sm" className="mt-3" disabled={busy} onClick={() => file.current?.click()}>
              <Upload className="size-3.5" />
              {busy ? "Saving…" : "Upload a song"}
            </Button>
            <ul className="mt-3 space-y-2">
              {settings.songs.length === 0 ? <li className="text-sm text-mist">No songs yet.</li> : null}
              {settings.songs.map((song) => (
                <li key={song.id} className="flex items-center justify-between gap-2 text-sm text-ivory">
                  <span className="truncate">{song.name}</span>
                  <button type="button" className="text-mist hover:text-ivory" onClick={() => void removeSoundtrackSong(accountId, song.id)} aria-label={`Remove ${song.name}`}>
                    <Trash2 className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-line bg-ink-soft p-4">
            <Label htmlFor="soundtrack-name">Create a soundtrack</Label>
            <Input id="soundtrack-name" className="mt-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name it" />
            <div className="mt-3 space-y-2">
              {settings.songs.map((song) => (
                <label key={song.id} className="flex items-center gap-2 text-sm text-ivory">
                  <input
                    type="checkbox"
                    checked={picked.includes(song.id)}
                    onChange={() => setPicked((ids) => (ids.includes(song.id) ? ids.filter((id) => id !== song.id) : [...ids, song.id]))}
                  />
                  <span className="truncate">{song.name}</span>
                </label>
              ))}
            </div>
            <Button type="button" variant="secondary" size="sm" className="mt-3" disabled={!name.trim() || !picked.length} onClick={createList}>
              <Plus className="size-3.5" />
              Create soundtrack
            </Button>
          </div>
          {settings.lists.map((list) => (
            <div key={list.id} className="rounded-md border border-line p-4">
              <label className="flex items-center gap-2 font-display text-xl text-ivory">
                <input
                  type="radio"
                  name="active-soundtrack"
                  checked={settings.activeId === list.id}
                  onChange={() => commit({ ...settings, activeId: list.id })}
                />
                {list.name}
              </label>
              <ol className="mt-3 space-y-2">
                {list.songIds.map((id, index) => (
                  <li key={`${id}-${index}`} className="flex items-center justify-between gap-2 text-sm text-ivory">
                    <span className="truncate">{index + 1}. {songName(id)}</span>
                    <span className="flex gap-1">
                      <button type="button" className="rounded border border-line p-1" onClick={() => move(list.id, index, -1)} aria-label="Move up">
                        <ChevronUp className="size-3.5" />
                      </button>
                      <button type="button" className="rounded border border-line p-1" onClick={() => move(list.id, index, 1)} aria-label="Move down">
                        <ChevronDown className="size-3.5" />
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
              <button
                type="button"
                className="mt-3 text-sm text-mist hover:text-ivory"
                onClick={() =>
                  commit({
                    ...settings,
                    lists: settings.lists.filter((item) => item.id !== list.id),
                    activeId: settings.activeId === list.id ? null : settings.activeId,
                  })
                }
              >
                Delete soundtrack
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
