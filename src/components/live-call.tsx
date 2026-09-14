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
}: {
  gameId: string;
  selfId: string;
  name: string;
  audio?: boolean;
  video?: boolean;
  showRemoteVideo?: boolean;
}) {
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
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
    let cutoutStop: (() => void) | null = null;

    async function signal(to: string, kind: "offer" | "answer" | "ice", payload: unknown) {
      await fetch("/api/rtc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "signal", room, from: me, to, kind, payload }),
      });
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
        if (ev.track.kind === "video" && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
          void remoteVideoRef.current.play().catch(() => undefined);
        }
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
          video: video ? { facingMode: "user", width: { ideal: 640 }, height: { ideal: 860 } } : false,
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
      void fetch("/api/rtc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "leave", room, peer: me }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [gameId, selfId, name, audio, video]);

  return (
    <div className={cn("flex flex-col", showRemoteVideo && "gap-2")}>
      {showRemoteVideo ? (
        <div className="relative mx-auto h-80 w-56 overflow-hidden rounded-t-[3.4rem] bg-ink sm:h-[26rem] sm:w-72">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover object-top"
          />
        </div>
      ) : (
        <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
      )}
      {audio ? (
        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
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
      ) : (
        <p className="px-1 text-center text-[11px] uppercase tracking-[0.14em] text-mist">{status}</p>
      )}
    </div>
  );
}
