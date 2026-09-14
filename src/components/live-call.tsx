import { useEffect, useRef, useState } from "react";
import { defaultIceServers, type RtcPollResponse } from "@/lib/multiplayer";
import { pipePersonCutout } from "@/lib/media/cutout";
import { cn } from "@/lib/utils";

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
  onRemoteVideo,
}: {
  gameId: string;
  selfId: string;
  name: string;
  audio?: boolean;
  video?: boolean;
  showRemoteVideo?: boolean;
  onRemoteVideo?: (el: HTMLVideoElement | null) => void;
}) {
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const displayRef = useRef<HTMLCanvasElement>(null);
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
    if (!showRemoteVideo) return;
    let raf = 0;
    const tick = () => {
      const videoEl = remoteVideoRef.current;
      const canvas = displayRef.current;
      if (videoEl && canvas && videoEl.readyState >= 2) {
        if (canvas.width !== 400) {
          canvas.width = 400;
          canvas.height = 560;
        }
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const p = img.data;
          for (let i = 0; i < p.length; i += 4) {
            const r = p[i];
            const g = p[i + 1];
            const b = p[i + 2];
            const mag = Math.min(r, b) - g;
            const green = g - Math.max(r, b);
            let gone = 0;
            if (mag > 18 && r > 60 && b > 60) gone = 1;
            else if (green > 20 && g > 70) gone = 1;
            else if (r > 210 && g < 50 && b > 210) gone = 1;
            else if (g > 200 && r < 70 && b < 70) gone = 1;
            if (gone) p[i + 3] = 0;
            else if (mag > 8 && r > 40 && b > 40) p[i + 3] = Math.min(p[i + 3], 90);
          }
          ctx.putImageData(img, 0, 0);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [showRemoteVideo]);

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
    let cutoutStop: (() => void) | null = null;

    async function signal(to: string, kind: "offer" | "answer" | "ice", payload: unknown) {
      await fetch("/api/rtc", {
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
        const res = await fetch(`/api/rtc?${params}`);
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
          video: video ? { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1000 } } : false,
        });
        if (closed) {
          raw.getTracks().forEach((t) => t.stop());
          return;
        }
        let outgoing = raw;
        if (video) {
          const cut = await pipePersonCutout(raw);
          cutoutStop = () => {
            cut.stop();
            raw.getTracks().forEach((t) => t.stop());
          };
          outgoing = cut.stream;
        }
        outgoing.getAudioTracks().forEach((t) => {
          t.enabled = audio && !mutedRef.current;
        });
        streamRef.current = outgoing;
        setStatus(video ? "Waiting for their camera…" : "Waiting for them…");
        void poll();
      } catch {
        setStatus(video ? "Allow the camera to sit at the table" : "Allow the microphone to go live");
      }
    })();

    return () => {
      closed = true;
      if (pollTimer) clearTimeout(pollTimer);
      pc?.close();
      cutoutStop?.();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      onRemoteRef.current?.(null);
      void fetch("/api/rtc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "leave", room, peer: me }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [gameId, selfId, name, audio, video]);

  return (
    <div className={cn("flex flex-col", showRemoteVideo && "items-center")}>
      {showRemoteVideo ? (
        <div className="relative h-[22rem] w-44 bg-transparent sm:h-[30rem] sm:w-60">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover object-top opacity-[0.01]"
          />
          <canvas ref={displayRef} className="absolute inset-0 h-full w-full bg-transparent" aria-hidden />
        </div>
      ) : (
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted={!audio}
          className="pointer-events-none fixed -left-[999px] h-px w-px opacity-[0.04]"
        />
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
