import { useEffect, useRef, useState } from "react";
import { defaultIceServers, type RtcPollResponse } from "@/lib/multiplayer";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/base";

function peerSlug(id: string) {
  const s = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return s || "seat";
}

function roomSlug(gameId: string, kind: "live" | "cam") {
  return `${kind}${gameId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60)}`;
}

export function LiveCall({
  gameId,
  selfId,
  name,
  audio = true,
  video = false,
  showRemoteVideo = false,
  hud = true,
  opponentOnly = false,
  onRemoteVideo,
}: {
  gameId: string;
  selfId: string;
  name: string;
  audio?: boolean;
  video?: boolean;
  showRemoteVideo?: boolean;
  hud?: boolean;
  opponentOnly?: boolean;
  onRemoteVideo?: (el: HTMLVideoElement | null) => void;
}) {
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const onRemoteRef = useRef(onRemoteVideo);
  onRemoteRef.current = onRemoteVideo;
  const [status, setStatus] = useState(video ? "Opening camera…" : "Connecting…");
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    mutedRef.current = muted;
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, [muted]);

  useEffect(() => {
    const room = roomSlug(gameId, video ? "cam" : "live");
    const me = peerSlug(selfId);
    let closed = false;
    let cursor = 0;
    let pc: RTCPeerConnection | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let makingOffer = false;
    let ignoreOffer = false;
    const pending: RTCIceCandidateInit[] = [];
    let remoteId: string | null = null;

    async function signal(to: string, kind: "offer" | "answer" | "ice", payload: unknown) {
      await fetch(apiUrl("/api/rtc"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "signal", room, from: me, to, kind, payload }),
      });
    }

    function attachVideo(stream: MediaStream) {
      const el = remoteVideoRef.current;
      if (!el) return;
      el.srcObject = stream;
      void el.play().then(() => onRemoteRef.current?.(el)).catch(() => onRemoteRef.current?.(el));
    }

    async function ensurePc(peer: string) {
      if (pc) return pc;
      remoteId = peer;
      pc = new RTCPeerConnection({ iceServers: defaultIceServers() });
      const local = streamRef.current;
      if (local) for (const track of local.getTracks()) pc.addTrack(track, local);
      pc.onicecandidate = (ev) => {
        if (ev.candidate && remoteId) void signal(remoteId, "ice", ev.candidate.toJSON());
      };
      pc.ontrack = (ev) => {
        const stream = ev.streams[0] ?? new MediaStream([ev.track]);
        if (ev.track.kind === "video") attachVideo(stream);
        if (ev.track.kind === "audio" && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          void remoteAudioRef.current.play().catch(() => undefined);
        }
      };
      pc.onconnectionstatechange = () => {
        if (!pc) return;
        if (pc.connectionState === "connected") setStatus(video ? "Across the table" : "Live");
        else if (pc.connectionState === "failed") setStatus("Could not connect");
        else setStatus("Connecting…");
      };
      pc.onnegotiationneeded = async () => {
        if (!pc || !remoteId) return;
        try {
          makingOffer = true;
          await pc.setLocalDescription(await pc.createOffer());
          if (pc.localDescription) await signal(remoteId, "offer", pc.localDescription);
        } catch {
          /* glare */
        } finally {
          makingOffer = false;
        }
      };
      return pc;
    }

    async function applySignal(from: string, kind: string, payload: unknown) {
      const conn = await ensurePc(from);
      if (kind === "ice") {
        const cand = payload as RTCIceCandidateInit;
        if (!conn.remoteDescription) pending.push(cand);
        else await conn.addIceCandidate(cand).catch(() => undefined);
        return;
      }
      const desc = payload as RTCSessionDescriptionInit;
      const offerCollision = kind === "offer" && (makingOffer || conn.signalingState !== "stable");
      const isPolite = me < from;
      ignoreOffer = !isPolite && offerCollision;
      if (ignoreOffer) return;
      if (offerCollision) {
        await conn.setLocalDescription({ type: "rollback" });
      }
      await conn.setRemoteDescription(desc);
      for (const c of pending.splice(0)) await conn.addIceCandidate(c).catch(() => undefined);
      if (kind === "offer") {
        await conn.setLocalDescription(await conn.createAnswer());
        if (conn.localDescription) await signal(from, "answer", conn.localDescription);
      }
    }

    async function poll() {
      if (closed) return;
      try {
        const params = new URLSearchParams({ room, peer: me, name: name.slice(0, 64), since: String(cursor) });
        const res = await fetch(apiUrl(`/api/rtc?${params}`));
        if (!res.ok) throw new Error("signaling");
        const body = (await res.json()) as RtcPollResponse;
        const other = body.peers.find((p) => p.id !== me);
        if (other && !pc) await ensurePc(other.id);
        for (const s of body.signals) {
          cursor = Math.max(cursor, s.id);
          await applySignal(s.from, s.kind, s.payload);
        }
      } catch {
        setStatus("Reconnecting…");
      }
      if (!closed) pollTimer = setTimeout(() => void poll(), 500);
    }

    void (async () => {
      try {
        const raw = await navigator.mediaDevices.getUserMedia({
          audio,
          video: video ? { facingMode: "user", width: { ideal: 720 }, height: { ideal: 960 } } : false,
        });
        if (closed) {
          raw.getTracks().forEach((t) => t.stop());
          return;
        }
        raw.getAudioTracks().forEach((t) => {
          t.enabled = audio && !mutedRef.current;
        });
        streamRef.current = raw;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = raw;
          void localVideoRef.current.play().catch(() => undefined);
        }
        setStatus(video ? "Waiting for the other camera…" : "Waiting for the user…");
        void poll();
      } catch {
        setStatus(video ? "Allow the camera so you can see each other" : "Allow the microphone to go live");
      }
    })();

    return () => {
      closed = true;
      if (pollTimer) clearTimeout(pollTimer);
      pc?.close();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      onRemoteRef.current?.(null);
      void fetch(apiUrl("/api/rtc"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "leave", room, peer: me }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [gameId, selfId, name, audio, video]);

  if (video && opponentOnly) {
    return <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />;
  }

  if (video) {
    return (
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-ink/85 p-2 shadow-lg backdrop-blur-md">
        <div className="overflow-hidden rounded-xl bg-black">
          <p className="px-2 pt-1 text-[10px] uppercase tracking-[0.14em] text-mist">Them</p>
          <video ref={remoteVideoRef} autoPlay playsInline className="h-36 w-24 object-cover sm:h-48 sm:w-32" />
        </div>
        <div className="overflow-hidden rounded-xl bg-black">
          <p className="px-2 pt-1 text-[10px] uppercase tracking-[0.14em] text-mist">You</p>
          <video ref={localVideoRef} autoPlay playsInline muted className="h-28 w-20 object-cover sm:h-36 sm:w-24" />
        </div>
        <p className="max-w-32 pb-1 text-[12px] text-mist">{status}</p>
      </div>
    );
  }

  const videoEl = (
    <video
      ref={remoteVideoRef}
      autoPlay
      playsInline
      muted={!audio}
      className={
        showRemoteVideo
          ? "h-full w-full object-cover object-top"
          : "pointer-events-none fixed -left-[999px] h-px w-px opacity-0"
      }
    />
  );

  if (!hud) return videoEl;

  return (
    <div className={cn("flex flex-col", showRemoteVideo && "gap-2")}>
      {showRemoteVideo ? (
        <div className="relative mx-auto h-80 w-56 overflow-hidden rounded-t-[3.4rem] bg-black sm:h-[26rem] sm:w-72">
          {videoEl}
        </div>
      ) : (
        videoEl
      )}
      {audio ? (
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <audio ref={remoteAudioRef} autoPlay playsInline />
          <p className="min-w-0 truncate text-[13px] text-mist">{status}</p>
          <button
            type="button"
            className={cn(
              "min-h-11 rounded-full border px-4 text-sm",
              muted ? "border-danger text-danger" : "border-line text-ivory",
            )}
            onClick={() => setMuted((v) => !v)}
          >
            {muted ? "Unmute" : "Mute"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
