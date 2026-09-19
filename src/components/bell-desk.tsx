import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, BellOff, Music2, Plus, Trash2, Upload, Users, X } from "lucide-react";
import { ClubBrand, ClubHeaderActions } from "@/components/club-brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SplashSkeleton } from "@/components/auth-screen";
import {
  addWatchRow,
  defaultBellSettings,
  deleteSongBlob,
  loadBellSettings,
  playBellPreview,
  saveBellSettings,
  saveSongBlob,
  type BellSettings,
} from "@/lib/bell";
import { listClubUsers, type ClubUserRow } from "@/lib/server/mores";

// re-export type locally if missing
type Watch = BellSettings["watches"][number];

export function BellDesk() {
  const { user, isPending } = useCurrentUserState();
  const [settings, setSettings] = useState<BellSettings>(defaultBellSettings);
  const [users, setUsers] = useState<ClubUserRow[] | null>(null);
  const [browseFor, setBrowseFor] = useState<string | null>(null);
  const [busySong, setBusySong] = useState<string | null>(null);
  const defaultFile = useRef<HTMLInputElement>(null);
  const rowFiles = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    setSettings(loadBellSettings());
  }, []);

  function commit(next: BellSettings) {
    setSettings(next);
    saveBellSettings(next);
  }

  async function openBrowse(watchId: string) {
    setBrowseFor(watchId);
    try {
      setUsers(await listClubUsers());
    } catch {
      setUsers([]);
    }
  }

  async function onDefaultSong(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return;
    setBusySong("default");
    const meta = await saveSongBlob(file);
    if (settings.defaultSongId) await deleteSongBlob(settings.defaultSongId).catch(() => undefined);
    commit({ ...settings, defaultSongId: meta.id, defaultSongName: meta.name });
    setBusySong(null);
  }

  async function onRowSong(watchId: string, e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return;
    setBusySong(watchId);
    const meta = await saveSongBlob(file);
    commit({
      ...settings,
      watches: settings.watches.map((w) => (w.id === watchId ? { ...w, songId: meta.id } : w)),
    });
    setBusySong(null);
  }

  if (isPending || !user) return <SplashSkeleton />;

  const named = settings.watches.some((w) => w.username.trim());

  return (
    <main className="relative mx-auto min-h-dvh w-full max-w-3xl px-4 py-3 sm:px-8 sm:py-4">
      <div className="check-wash pointer-events-none absolute inset-0" />
      <header className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center justify-between gap-3 bg-ink/88 px-4 py-3 backdrop-blur-md sm:-mx-8 sm:px-8">
        <ClubBrand to="/" />
        <ClubHeaderActions />
      </header>

      <section className="relative mt-6">
        <p className="text-xs uppercase tracking-[0.2em] text-mist">The bell</p>
        <h1 className="mt-2 font-display text-4xl text-ivory">When someone asks you to sit.</h1>
        <p className="mt-3 max-w-xl text-base text-mist">
          New accounts start muted. Turn the bell on, and it rings from any page the moment a named
          challenge — or a random pull-up — lands. No names listed means everyone. Names listed means
          only those chairs.
        </p>
      </section>

      <Card className="relative mt-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl text-ivory">Sound</h2>
            <p className="mt-1 text-sm text-mist">
              {settings.unmuted ? "The bell is live across the club." : "Muted until you unmute it."}
            </p>
          </div>
          <Button
            type="button"
            variant="solid"
            className="rounded-full"
            onClick={() => commit({ ...settings, unmuted: !settings.unmuted })}
          >
            {settings.unmuted ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            {settings.unmuted ? "Bell on" : "Unmute the bell"}
          </Button>
        </div>

        <div className="rounded-md border border-line bg-ink-soft p-4">
          <Label>House song</Label>
          <p className="mt-1 text-sm text-mist">
            {settings.defaultSongName
              ? `Uploaded: ${settings.defaultSongName}`
              : "No song uploaded — a brass house bell rings instead."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              ref={defaultFile}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={onDefaultSong}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busySong === "default"}
              onClick={() => defaultFile.current?.click()}
            >
              <Upload className="size-3.5" />
              {busySong === "default" ? "Saving…" : "Upload a song"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void playBellPreview()}
            >
              <Music2 className="size-3.5" />
              Test
            </Button>
            {settings.defaultSongId ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await deleteSongBlob(settings.defaultSongId!).catch(() => undefined);
                  commit({ ...settings, defaultSongId: null, defaultSongName: null });
                }}
              >
                Clear song
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="relative mt-4 space-y-4">
        <div>
          <h2 className="font-display text-2xl text-ivory">Who rings</h2>
          <p className="mt-1 text-sm text-mist">
            {named
              ? "Only these usernames trip the bell. Each may keep their own song."
              : "Leave the names empty and every challenge rings."}
          </p>
        </div>

        <div className="space-y-3">
          {settings.watches.map((w, i) => (
            <WatchRow
              key={w.id}
              row={w}
              index={i}
              busy={busySong === w.id}
              fileRef={(el) => {
                rowFiles.current[w.id] = el;
              }}
              onChange={(username) =>
                commit({
                  ...settings,
                  watches: settings.watches.map((x) => (x.id === w.id ? { ...x, username } : x)),
                })
              }
              onBrowse={() => void openBrowse(w.id)}
              onSong={(e) => void onRowSong(w.id, e)}
              onPickSong={() => rowFiles.current[w.id]?.click()}
              onClearSong={() =>
                commit({
                  ...settings,
                  watches: settings.watches.map((x) => (x.id === w.id ? { ...x, songId: null } : x)),
                })
              }
              onRemove={
                settings.watches.length > 1
                  ? () =>
                      commit({
                        ...settings,
                        watches: settings.watches.filter((x) => x.id !== w.id),
                      })
                  : undefined
              }
            />
          ))}
        </div>

        <Button type="button" variant="secondary" onClick={() => commit(addWatchRow(settings))}>
          <Plus className="size-4" />
          Add user
        </Button>
      </Card>

      <p className="relative mt-6 text-sm text-mist">
        <Link to="/" className="underline-offset-4 hover:text-ivory hover:underline">
          Back to the lounge
        </Link>
      </p>

      {browseFor ? (
        <div className="fixed inset-0 z-50 grid place-items-end bg-ink/70 p-4 sm:place-items-center">
          <div className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-xl border border-line bg-panel">
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="font-display text-2xl text-ivory">Browse users</h2>
                <p className="text-sm text-mist">On the boards or away from the table.</p>
              </div>
              <button
                type="button"
                className="grid size-9 place-items-center rounded-md text-mist hover:bg-panel-2 hover:text-ivory"
                onClick={() => setBrowseFor(null)}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {users === null ? (
                <p className="px-2 py-6 text-sm text-mist">Loading the club roll…</p>
              ) : users.length === 0 ? (
                <p className="px-2 py-6 text-sm text-mist">No other seats claimed yet.</p>
              ) : (
                users.map((p) => (
                  <button
                    key={p.username}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left hover:bg-panel-2"
                    onClick={() => {
                      commit({
                        ...settings,
                        watches: settings.watches.map((x) =>
                          x.id === browseFor ? { ...x, username: p.username } : x,
                        ),
                      });
                      setBrowseFor(null);
                    }}
                  >
                    <span className="text-sm text-ivory">{p.username}</span>
                    <span className="text-xs text-mist">
                      {p.online ? "online" : "off"} · {p.score}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function WatchRow({
  row,
  index,
  busy,
  fileRef,
  onChange,
  onBrowse,
  onSong,
  onPickSong,
  onClearSong,
  onRemove,
}: {
  row: Watch;
  index: number;
  busy: boolean;
  fileRef: (el: HTMLInputElement | null) => void;
  onChange: (username: string) => void;
  onBrowse: () => void;
  onSong: (e: ChangeEvent<HTMLInputElement>) => void;
  onPickSong: () => void;
  onClearSong: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-md border border-line bg-ink-soft p-3 sm:p-4">
      <Label htmlFor={`watch-${row.id}`}>Username {index + 1}</Label>
      <div className="mt-2 flex flex-wrap gap-2">
        <Input
          id={`watch-${row.id}`}
          value={row.username}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a club name"
          className="min-w-40 flex-1"
        />
        <Button type="button" variant="secondary" size="sm" className="rounded-full" onClick={onBrowse}>
          <Users className="size-3.5" />
          Browse users
        </Button>
        {onRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove user">
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onSong} />
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onPickSong}>
          <Upload className="size-3.5" />
          {row.songId ? "Replace their song" : "Song for this user"}
        </Button>
        {row.songId ? (
          <Button type="button" variant="ghost" size="sm" onClick={onClearSong}>
            Use house song
          </Button>
        ) : (
          <span className="text-xs text-mist">Uses the house song or bell</span>
        )}
      </div>
    </div>
  );
}
