import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Repeat,
  Search,
  Share2,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { asset } from "@/lib/base";
import {
  BUILTIN_SONGS,
  libraryNow,
  loadSoundtrack,
  playLibrarySong,
  removeSoundtrackSong,
  saveSoundtrack,
  seekLibrary,
  setLibraryHold,
  setLibraryRepeat,
  subscribePlayer,
  subscribeSoundtrack,
  toggleLibrary,
  unlockSoundtrack,
  uploadSoundtrackSong,
  type SoundtrackSettings,
} from "@/lib/soundtrack";

type Tab = "songs" | "playlists" | "albums" | "studio" | "covers" | "liked" | "uploads" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "songs", label: "Songs" },
  { id: "playlists", label: "Playlists" },
  { id: "albums", label: "Albums" },
  { id: "studio", label: "Studio Projects" },
  { id: "covers", label: "Cover Art" },
  { id: "liked", label: "Liked" },
  { id: "uploads", label: "Uploads" },
  { id: "history", label: "History" },
];

const WASH = [
  ["#243044", "#d7c4a2"],
  ["#3a2148", "#f0b7cf"],
  ["#14324f", "#8ec5ef"],
  ["#2c2418", "#e6d3ae"],
  ["#1d3330", "#9fd0c3"],
  ["#3b2430", "#e7a0b4"],
];

function clock(n: number) {
  if (!n || !Number.isFinite(n)) return "0:00";
  const s = Math.floor(n);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function wash(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % WASH.length;
  return WASH[h];
}

export function SoundtrackLibrary({ accountId }: { accountId: string }) {
  const [settings, setSettings] = useState<SoundtrackSettings>(() => loadSoundtrack(accountId));
  const [tab, setTab] = useState<Tab>("songs");
  const [query, setQuery] = useState("");
  const [likedOnly, setLikedOnly] = useState(false);
  const [publicOnly, setPublicOnly] = useState(false);
  const [uploadsOnly, setUploadsOnly] = useState(false);
  const [sort, setSort] = useState<"new" | "name" | "plays">("new");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(libraryNow);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [listName, setListName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [hideDown, setHideDown] = useState(false);
  const [coverFor, setCoverFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const coverFile = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLibraryHold(true);
    unlockSoundtrack();
    const sync = () => setSettings(loadSoundtrack(accountId));
    sync();
    const off = subscribeSoundtrack(sync);
    const offPlayer = subscribePlayer(() => {
      const next = libraryNow();
      setNow(next);
      if (next.songId && next.duration) {
        setDurations((cur) => (cur[next.songId] === next.duration ? cur : { ...cur, [next.songId]: next.duration }));
      }
    });
    return () => {
      off();
      offPlayer();
      setLibraryHold(false);
    };
  }, [accountId]);

  const catalog = useMemo(() => {
    const uploads = settings.songs.filter((song) => !BUILTIN_SONGS.some((built) => built.id === song.id));
    return [
      ...BUILTIN_SONGS.map((song) => ({
        id: song.id,
        name: song.name,
        builtin: true,
        blurb: "Club soundtrack. It keeps playing at the table when the list is unmuted.",
      })),
      ...uploads.map((song) => ({
        id: song.id,
        name: song.name,
        builtin: false,
        blurb: "Uploaded from this browser.",
      })),
    ];
  }, [settings.songs]);

  const songs = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = catalog.filter((song) => {
      if (q && !song.name.toLowerCase().includes(q) && !song.blurb.toLowerCase().includes(q)) return false;
      if (likedOnly && !settings.likes.includes(song.id)) return false;
      if (publicOnly && !song.builtin) return false;
      if (uploadsOnly && song.builtin) return false;
      if (hideDown && settings.downs.includes(song.id)) return false;
      if (tab === "liked" && !settings.likes.includes(song.id)) return false;
      if (tab === "uploads" && song.builtin) return false;
      if (tab === "history" && !settings.history.includes(song.id)) return false;
      return true;
    });
    if (tab === "history") {
      rows = [...rows].sort((a, b) => settings.history.indexOf(a.id) - settings.history.indexOf(b.id));
    } else if (sort === "name") rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "plays") rows = [...rows].sort((a, b) => (settings.plays[b.id] ?? 0) - (settings.plays[a.id] ?? 0));
    else rows = [...rows].sort((a, b) => Number(a.builtin) - Number(b.builtin));
    return rows;
  }, [catalog, query, likedOnly, publicOnly, uploadsOnly, hideDown, tab, sort, settings.likes, settings.downs, settings.plays, settings.history]);

  const filterCount = Number(likedOnly) + Number(publicOnly) + Number(uploadsOnly) + Number(hideDown);
  const queue = songs.map((song) => song.id);

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
      setTab("uploads");
    } finally {
      setBusy(false);
    }
  }

  function toggleLike(id: string) {
    const likes = settings.likes.includes(id) ? settings.likes.filter((item) => item !== id) : [...settings.likes, id];
    commit({ ...settings, likes });
  }

  function play(id: string) {
    setSelected(id);
    void playLibrarySong(accountId, id, queue);
  }

  function share(name: string) {
    const text = `Morse Chess soundtrack — ${name}`;
    if (navigator.clipboard) void navigator.clipboard.writeText(text).catch(() => undefined);
  }

  function addToList(listId: string, songId: string) {
    commit({
      ...settings,
      lists: settings.lists.map((list) => (list.id === listId && !list.songIds.includes(songId) ? { ...list, songIds: [...list.songIds, songId] } : list)),
    });
    setMenu(null);
  }

  function createList() {
    const title = listName.trim();
    if (!title || !picked.length) return;
    const list = { id: crypto.randomUUID(), name: title, songIds: picked };
    commit({ ...settings, lists: [...settings.lists, list], activeId: settings.activeId ?? list.id });
    setListName("");
    setPicked([]);
  }

  function useInGame(id: string) {
    const existing = settings.lists.find((list) => list.songIds.length === 1 && list.songIds[0] === id);
    const list = existing ?? { id: crypto.randomUUID(), name: catalog.find((song) => song.id === id)?.name ?? "Song", songIds: [id] };
    commit({
      ...settings,
      unmuted: true,
      lists: existing ? settings.lists : [...settings.lists, list],
      activeId: list.id,
    });
    unlockSoundtrack();
  }

  function startClub() {
    const ids = catalog.map((song) => song.id);
    const first = ids.includes("builtin-walking") ? "builtin-walking" : ids[0];
    if (!first) return;
    const ordered = [first, ...ids.filter((id) => id !== first)];
    const list = { id: "club-walk", name: "Club", songIds: ordered };
    commit({
      ...settings,
      unmuted: true,
      lists: settings.lists.some((item) => item.id === list.id) ? settings.lists.map((item) => (item.id === list.id ? list : item)) : [...settings.lists, list],
      activeId: list.id,
    });
    void playLibrarySong(accountId, first, ordered);
  }

  function toggleDown(id: string) {
    const downs = settings.downs.includes(id) ? settings.downs.filter((item) => item !== id) : [...settings.downs, id];
    commit({ ...settings, downs, likes: settings.likes.filter((item) => item !== id) });
  }

  function shrinkCover(file: File) {
    return new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 320 / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error("cover"));
      img.src = URL.createObjectURL(file);
    });
  }

  async function onCover(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    e.target.value = "";
    if (!chosen || !coverFor) return;
    try {
      const url = await shrinkCover(chosen);
      commit({ ...settings, covers: { ...settings.covers, [coverFor]: url } });
    } catch {
      /* keep the cover it already has */
    }
  }

  async function trash() {
    if (!selected) return;
    const song = catalog.find((item) => item.id === selected);
    if (!song || song.builtin) return;
    await removeSoundtrackSong(accountId, selected);
    setSelected(null);
    setMenu(null);
  }

  const current = catalog.find((song) => song.id === now.songId) ?? null;

  return (
    <div className="flex h-dvh flex-col bg-ink text-ivory" onClick={() => { setMenu(null); setFiltersOpen(false); setSortOpen(false); }}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <Link to="/" className="rounded-full border border-gold-line bg-walnut px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-ivory">
          Home
        </Link>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); startClub(); }}
          className={"rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] " + (settings.unmuted ? "border-gold-line bg-ivory text-ink" : "border-line text-ivory")}
        >
          {settings.unmuted ? "Unmuted" : "Unmute"}
        </button>
        <div className="flex items-center gap-2">
          <input ref={file} type="file" accept="audio/*" className="hidden" onChange={(e) => void onFile(e)} />
          <button
            type="button"
            disabled={busy}
            onClick={(e) => { e.stopPropagation(); file.current?.click(); }}
            className="rounded-full border border-line px-3 py-1.5 text-sm text-ivory hover:bg-panel-2"
          >
            {busy ? "Saving…" : "+ Audio"}
          </button>
          <button
            type="button"
            aria-label="Delete upload"
            disabled={!selected || catalog.find((song) => song.id === selected)?.builtin !== false}
            onClick={(e) => { e.stopPropagation(); void trash(); }}
            className="grid size-9 place-items-center rounded-full border border-line text-mist hover:bg-panel-2 disabled:opacity-30"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </header>

      <nav className="flex gap-5 overflow-x-auto border-b border-line px-4 text-sm text-mist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={(e) => { e.stopPropagation(); setTab(item.id); }}
            className={
              "shrink-0 border-b-2 pb-2.5 " +
              (tab === item.id ? "border-gold-line font-medium text-ivory" : "border-transparent hover:text-ivory")
            }
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex items-center gap-2 px-5 py-3">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-line bg-panel px-4 py-2 text-mist">
          <Search className="size-4 shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="w-full bg-transparent text-sm text-ivory outline-none placeholder:text-mist"
          />
        </label>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFiltersOpen((v) => !v); setSortOpen(false); }}
            className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm"
          >
            <SlidersHorizontal className="size-3.5" />
            Filters{filterCount ? ` (${filterCount})` : ""}
          </button>
          {filtersOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-line bg-panel p-2 text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
              <FilterRow on={likedOnly} label="Liked" set={setLikedOnly} />
              <FilterRow on={publicOnly} label="Public" set={setPublicOnly} />
              <FilterRow on={uploadsOnly} label="Uploads" set={setUploadsOnly} />
              <FilterRow on={hideDown} label="Hide disliked" set={setHideDown} />
            </div>
          ) : null}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setSortOpen((v) => !v); setFiltersOpen(false); }}
            className="rounded-full border border-line px-3 py-1.5 text-sm"
          >
            {sort === "new" ? "New" : sort === "name" ? "Name" : "Plays"}
          </button>
          {sortOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-32 rounded-xl border border-line bg-panel p-1 text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
              {(["new", "name", "plays"] as const).map((id) => (
                <button key={id} type="button" className="block w-full rounded-lg px-3 py-1.5 text-left capitalize hover:bg-panel-2" onClick={() => { setSort(id); setSortOpen(false); }}>
                  {id === "plays" ? "Plays" : id === "new" ? "New" : "Name"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <Chip on={likedOnly} onClick={() => setLikedOnly((v) => !v)}>Liked</Chip>
        <Chip on={publicOnly} onClick={() => setPublicOnly((v) => !v)}>Public</Chip>
        <Chip on={uploadsOnly} onClick={() => setUploadsOnly((v) => !v)}>Uploads</Chip>
        <Chip on={hideDown} onClick={() => setHideDown((v) => !v)}>Hide disliked</Chip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-28">
        {tab === "playlists" ? (
          <div className="space-y-3 px-2">
            <div className="rounded-xl border border-line bg-panel p-3">
              <input
                value={listName}
                onChange={(e) => setListName(e.target.value)}
                placeholder="Playlist name"
                className="w-full rounded-lg bg-panel px-3 py-2 text-sm outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {catalog.map((song) => (
                  <button
                    key={song.id}
                    type="button"
                    onClick={() => setPicked((ids) => (ids.includes(song.id) ? ids.filter((id) => id !== song.id) : [...ids, song.id]))}
                    className={"rounded-full px-2.5 py-1 text-xs " + (picked.includes(song.id) ? "bg-ivory text-ink" : "bg-walnut text-ivory/70")}
                  >
                    {song.name}
                  </button>
                ))}
              </div>
              <button type="button" disabled={!listName.trim() || !picked.length} onClick={createList} className="mt-3 flex items-center gap-1 rounded-full bg-ivory px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-40">
                <Plus className="size-3.5" /> Create playlist
              </button>
            </div>
            {settings.lists.map((list) => (
              <button
                key={list.id}
                type="button"
                onClick={() => list.songIds[0] && playLibrarySong(accountId, list.songIds[0], list.songIds)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-panel-2"
              >
                <span className="grid size-14 place-items-center rounded-md bg-panel text-xs text-mist">{list.songIds.length}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ivory">{list.name}</span>
                  <span className="block truncate text-xs text-mist">{list.songIds.length} songs{settings.activeId === list.id ? " · playing in the game" : ""}</span>
                </span>
              </button>
            ))}
          </div>
        ) : tab === "covers" ? (
          <div className="px-2">
            <input ref={coverFile} type="file" accept="image/*" className="hidden" onChange={(e) => void onCover(e)} />
            <p className="px-2 py-3 text-sm text-mist">Click a song and choose a picture. That picture stays on the song.</p>
            <ul>
              {catalog.map((song) => (
                <li key={song.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-panel"
                    onClick={() => { setCoverFor(song.id); coverFile.current?.click(); }}
                  >
                    <CoverArt id={song.id} src={settings.covers[song.id]} />
                    <span>
                      <span className="block font-display text-xl text-ivory">{song.name}</span>
                      <span className="text-xs text-mist">{settings.covers[song.id] ? "Cover set. Click to change it." : "Click to add a cover."}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : tab === "albums" || tab === "studio" ? (
          <p className="px-4 py-10 text-sm text-mist">Nothing here yet.</p>
        ) : songs.length === 0 ? (
          <p className="px-4 py-10 text-sm text-mist">No songs in this view.</p>
        ) : (
          <ul>
            {songs.map((song) => {
              const active = now.songId === song.id && now.playing;
              const fresh = !settings.history.includes(song.id);
              return (
                <li key={song.id} className={"relative flex items-start gap-3 rounded-lg px-2 py-2.5 " + (selected === song.id ? "bg-white/[0.04]" : "hover:bg-white/[0.03]")} onClick={() => setSelected(song.id)}>
                  {fresh ? <span className="mt-6 size-1.5 shrink-0 rounded-full bg-[#ff4d8d]" /> : <span className="w-1.5 shrink-0" />}
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-md border border-line">
                    <CoverArt id={song.id} src={settings.covers[song.id]} />
                    <span className="absolute bottom-0.5 left-1 text-[10px] font-medium text-ivory drop-shadow">{clock(durations[song.id] ?? (now.songId === song.id ? now.duration : 0))}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-ivory">{song.name}</span>
                      <span className="shrink-0 text-[10px] font-semibold tracking-wide text-ivory">{song.builtin ? "MORSE" : "UPLOAD"}</span>
                    </div>
                    <p className="truncate text-xs text-mist">{song.blurb}</p>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); active ? toggleLibrary() : play(song.id); }}
                        className={"flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold " + (active ? "bg-ivory text-ink" : "bg-walnut text-ivory")}
                      >
                        {active ? <Pause className="size-3" /> : <Play className="size-3 fill-current" />}
                        {(settings.plays[song.id] ?? 0) > 0 ? <span>{settings.plays[song.id]}</span> : null}
                      </button>
                      <IconButton label="Like" on={settings.likes.includes(song.id)} onClick={() => toggleLike(song.id)}>
                        <ThumbsUp className="size-3.5" />
                      </IconButton>
                      <IconButton label="Not for me" on={settings.downs.includes(song.id)} onClick={() => toggleDown(song.id)}>
                        <ThumbsDown className="size-3.5" />
                      </IconButton>
                      <IconButton label="Share" onClick={() => share(song.name)}>
                        <Share2 className="size-3.5" />
                      </IconButton>
                      {active ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); useInGame(song.id); }} className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium">
                          Publish
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="More"
                    className="grid size-8 place-items-center rounded-full text-mist hover:bg-white/10"
                    onClick={(e) => { e.stopPropagation(); setMenu(menu === song.id ? null : song.id); setSelected(song.id); }}
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                  {menu === song.id ? (
                    <div className="absolute right-3 top-10 z-20 w-48 rounded-xl border border-line bg-panel p-1 text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left hover:bg-panel-2" onClick={() => useInGame(song.id)}>Publish to the game</button>
                      {settings.lists.map((list) => (
                        <button key={list.id} type="button" className="block w-full truncate rounded-lg px-3 py-1.5 text-left hover:bg-panel-2" onClick={() => addToList(list.id, song.id)}>
                          Add to {list.name}
                        </button>
                      ))}
                      {song.builtin ? null : (
                        <button type="button" className="block w-full rounded-lg px-3 py-1.5 text-left text-[#ff8aa8] hover:bg-panel-2" onClick={() => { setSelected(song.id); void trash(); }}>
                          Delete
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="border-t border-line bg-ink px-6 py-2.5">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <span className="w-10 text-right text-xs tabular-nums text-mist">{clock(now.current)}</span>
          <input
            type="range"
            min={0}
            max={1000}
            value={now.duration ? Math.round((now.current / now.duration) * 1000) : 0}
            onChange={(e) => seekLibrary(Number(e.target.value) / 1000)}
            aria-label="Song position"
            className="h-1 flex-1 accent-white"
          />
          <span className="w-10 text-xs tabular-nums text-mist">{clock(current ? durations[current.id] ?? now.duration : 0)}</span>
        </div>
        <div className="mt-1 flex items-center justify-center gap-5 text-mist">
          <button type="button" aria-label="Previous" onClick={() => step(-1)} className="hover:text-white">
            <SkipBack className="size-4 fill-current" />
          </button>
          <button
            type="button"
            aria-label={now.playing ? "Pause" : "Play"}
            onClick={() => (now.songId ? toggleLibrary() : songs[0] && play(songs[0].id))}
            className="grid size-9 place-items-center rounded-full bg-ivory text-ink"
          >
            {now.playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </button>
          <button type="button" aria-label="Next" onClick={() => step(1)} className="hover:text-white">
            <SkipForward className="size-4 fill-current" />
          </button>
          <button type="button" aria-label="Repeat" onClick={() => setLibraryRepeat(!now.repeat)} className={now.repeat ? "text-white" : "text-mist"}>
            <Repeat className="size-4" />
          </button>
        </div>
      </footer>
    </div>
  );

  function step(dir: -1 | 1) {
    if (!queue.length) return;
    const at = Math.max(0, queue.indexOf(now.songId));
    const next = queue[(at + dir + queue.length) % queue.length];
    void playLibrarySong(accountId, next, queue);
  }
}

function CoverArt({ id, src }: { id: string; src?: string }) {
  const [a, b] = wash(id);
  if (src) return <img src={src} alt="" className="size-full object-cover" />;
  return (
    <span className="relative grid size-full place-items-center" style={{ background: `linear-gradient(145deg, ${a}, ${b})` }}>
      <img src={asset("/party/w-k.png")} alt="" className="size-9 object-contain" />
    </span>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" onClick={onClick} className={"hidden rounded-full border px-3 py-1.5 text-sm sm:inline " + (on ? "border-white bg-ivory text-ink" : "border-line text-mist")}>
      {children}
    </button>
  );
}

function FilterRow({ on, label, set }: { on: boolean; label: string; set: (v: boolean) => void }) {
  return (
    <button type="button" className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 hover:bg-panel-2" onClick={() => set(!on)}>
      {label}
      <span className={"size-3 rounded-full border " + (on ? "border-white bg-white" : "border-white/30")} />
    </button>
  );
}

function IconButton({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={(e) => { e.stopPropagation(); onClick(); }} className={"grid size-7 place-items-center rounded-full " + (on ? "bg-ivory text-ink" : "bg-white/10 text-mist")}>
      {children}
    </button>
  );
}
