import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Camera, Crown, ExternalLink, LayoutGrid, Music, Volume2, VolumeX, X } from "lucide-react";
import { pinnedSeason, pinSeason, seasonFor, seasonImage, SEASONS, type Season } from "@/lib/legendary/theme";
import { playSfx, setSfxMuted, SFX_EVENT, sfxMuted } from "@/lib/legendary/sfx";
import { ClubSignOut } from "@/components/club-sign-out";
import { BellControls } from "@/components/bell-button";
import { PhotoSetup } from "@/components/legendary/photo-setup";
import { PlayerAvatar, useMyPhoto } from "@/components/legendary/bits";
import { cn } from "@/lib/utils";

export function useSfxMuted() {
  const [muted, setMuted] = useState(sfxMuted);
  useEffect(() => {
    const on = () => setMuted(sfxMuted());
    window.addEventListener(SFX_EVENT, on);
    return () => window.removeEventListener(SFX_EVENT, on);
  }, []);
  return muted;
}

export function LegendarySettings({ start = "main", userId, letter, onClose }: { start?: "main" | "photo"; userId?: string | null; letter: string; onClose: () => void }) {
  const [photoOpen, setPhotoOpen] = useState(start === "photo");
  const muted = useSfxMuted();
  const [pin, setPin] = useState<Season | "auto">(pinnedSeason);
  const { photo } = useMyPhoto();
  const today = seasonFor();

  if (photoOpen) return <PhotoSetup letter={letter} first={false} onDone={() => (start === "photo" ? onClose() : setPhotoOpen(false))} />;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-black/55" onClick={onClose} data-legendary-settings>
      <aside className="mcl-panel mcl-drawer h-full w-full max-w-sm overflow-y-auto rounded-none border-y-0 border-r-0 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="mcl-title text-2xl">Settings</h2>
          <button type="button" className="mcl-icon-btn" aria-label="Close settings" onClick={onClose}><X className="size-5" /></button>
        </div>

        <h3 className="mcl-label mt-6">Profile photo</h3>
        <div className="mt-2 flex items-center gap-3">
          <PlayerAvatar userId={userId} photo={photo} letter={photo?.letter || letter} size={56} frame="gold" />
          <button type="button" className="mcl-btn mcl-btn-ghost flex-1" onClick={() => setPhotoOpen(true)} data-change-photo>
            <Camera className="size-4" /> Change photo
          </button>
        </div>

        <h3 className="mcl-label mt-6">AV king</h3>
        <Link to="/avatar" className="mcl-btn mcl-btn-gold mt-2 w-full" onClick={onClose} data-settings-av>
          <Crown className="size-4" /> Pick or dress your AV king
        </Link>

        <h3 className="mcl-label mt-6">Sound</h3>
        <button
          type="button"
          className={cn("mcl-btn mt-2 w-full", muted ? "mcl-btn-ghost" : "mcl-btn-purple")}
          onClick={() => {
            setSfxMuted(!muted);
            if (muted) window.setTimeout(() => playSfx("coin"), 30);
          }}
          data-sfx-toggle={muted ? "off" : "on"}
        >
          {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />} Sound effects {muted ? "off" : "on"}
        </button>
        <div className="mt-2 flex items-center gap-2 text-sm text-[#d9c79c]">
          <Music className="size-4" /> Music & bell <BellControls className="ml-auto" />
        </div>

        <h3 className="mcl-label mt-6">Background</h3>
        <p className="mt-1 text-xs text-[#a998c4]">Auto switches by the date (Chicago time): Christmas Dec 1–26, New Year, Halloween, Thanksgiving week, Easter, then the four seasons.</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => { pinSeason("auto"); setPin("auto"); }} className={cn("mcl-season-tile", pin === "auto" && "is-on")}>
            <img src={seasonImage(today, true)} alt="" />
            <span>Auto</span>
          </button>
          {SEASONS.map((s) => (
            <button key={s.id} type="button" onClick={() => { pinSeason(s.id); setPin(s.id); }} className={cn("mcl-season-tile", pin === s.id && "is-on")} data-season-pick={s.id}>
              <img src={seasonImage(s.id, true)} alt="" loading="lazy" />
              <span>{s.name}</span>
            </button>
          ))}
        </div>

        <h3 className="mcl-label mt-6">More</h3>
        <div className="mt-2 grid gap-2">
          <Link to="/boards" className="mcl-btn mcl-btn-ghost w-full" onClick={onClose}><LayoutGrid className="size-4" /> Board look</Link>
          <a href="/chess/" className="mcl-btn mcl-btn-ghost w-full"><ExternalLink className="size-4" /> Classic Morse Chess</a>
          <ClubSignOut className="mcl-btn mcl-btn-ghost !h-auto w-full !rounded-lg" />
        </div>
      </aside>
    </div>
  );
}
