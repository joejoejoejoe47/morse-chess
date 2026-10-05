import { useEffect, useRef, useState } from "react";
import { NamePlate } from "@/components/avatar/name-plate";
import { defaultIceServers } from "@/lib/multiplayer";
import { apiUrl } from "@/lib/base";

function slug(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "seat";
}

export function SeatCircle({
  room,
  selfId,
  name,
  seats,
  loudId,
  quietIds = [],
}: {
  room: string;
  selfId: string;
  name: string;
  seats: { userId: string; username: string; look: string }[];
  loudId?: string | null;
  quietIds?: string[];
}) {
  const [videos, setVideos] = useState<Record<string, MediaStream>>({});
  const [local, setLocal] = useState<MediaStream | null>(null);
  const loudRef = useRef(loudId);
  const quietRef = useRef(new Set(quietIds));
  loudRef.current = loudId;
  quietRef.current = new Set(quietIds);

  useEffect(() => {
    const me = slug(selfId);
    let closed = false;
    let cursor = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pcs = new Map<string, RTCPeerConnection>();
    const gains = new Map<string, GainNode>();
    const audio = new AudioContext();
    let stream: MediaStream | null = null;
    const making = new Set<string>();

    function gainFor(peer: string) {
      const quiet = quietRef.current.has(peer);
      if (quiet) return 0;
      return peer === slug(loudRef.current || "") ? 1 : 0.28;
    }

    function applyGains() {
      for (const [peer, node] of gains) node.gain.value = gainFor(peer);
    }

    async function signal(to: string, kind: "offer" | "answer" | "ice", payload: unknown) {
      await fetch(apiUrl("/api/rtc"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "signal", room, from: me, to, kind, payload }),
      });
    }

    async function ensure(peer: string) {
      const existing = pcs.get(peer);
      if (existing) return existing;
      const pc = new RTCPeerConnection({ iceServers: defaultIceServers() });
      pcs.set(peer, pc);
      if (stream) for (const track of stream.getTracks()) pc.addTrack(track, stream);
      pc.onicecandidate = (ev) => {
        if (ev.candidate) void signal(peer, "ice", ev.candidate.toJSON());
      };
      pc.ontrack = (ev) => {
        const incoming = ev.streams[0] ?? new MediaStream([ev.track]);
        if (ev.track.kind === "video") {
          setVideos((prev) => ({ ...prev, [peer]: incoming }));
        }
        if (ev.track.kind === "audio") {
          const node = audio.createGain();
          node.gain.value = gainFor(peer);
          gains.set(peer, node);
          const src = audio.createMediaStreamSource(new MediaStream([ev.track]));
          src.connect(node);
          node.connect(audio.destination);
        }
      };
      pc.onnegotiationneeded = async () => {
        if (making.has(peer)) return;
        making.add(peer);
        try {
          await pc.setLocalDescription(await pc.createOffer());
          if (pc.localDescription) await signal(peer, "offer", pc.localDescription);
        } catch {
          /* glare */
        } finally {
          making.delete(peer);
        }
      };
      return pc;
    }

    async function onSignal(from: string, kind: string, payload: unknown) {
      const pc = await ensure(from);
      if (kind === "ice") {
        await pc.addIceCandidate(payload as RTCIceCandidateInit).catch(() => undefined);
        return;
      }
      const desc = payload as RTCSessionDescriptionInit;
      const glare = kind === "offer" && pc.signalingState !== "stable";
      if (glare && me > from) return;
      if (glare) await pc.setLocalDescription({ type: "rollback" }).catch(() => undefined);
      await pc.setRemoteDescription(desc);
      if (kind === "offer") {
        await pc.setLocalDescription(await pc.createAnswer());
        if (pc.localDescription) await signal(from, "answer", pc.localDescription);
      }
    }

    async function poll() {
      if (closed) return;
      try {
        const params = new URLSearchParams({ room, peer: me, name: name.slice(0, 64), since: String(cursor) });
        const res = await fetch(apiUrl(`/api/rtc?${params}`));
        if (res.ok) {
          const body = (await res.json()) as {
            peers: { id: string }[];
            signals: { id: number; from: string; kind: string; payload: unknown }[];
          };
          for (const peer of body.peers) {
            if (peer.id !== me) await ensure(peer.id);
          }
          for (const sig of body.signals) {
            cursor = Math.max(cursor, sig.id);
            await onSignal(sig.from, sig.kind, sig.payload);
          }
          applyGains();
        }
      } catch {
        /* retry */
      }
      if (!closed) timer = setTimeout(() => void poll(), 700);
    }

    void navigator.mediaDevices
      .getUserMedia({ audio: true, video: { facingMode: "user", width: 360, height: 360 } })
      .then((raw) => {
        if (closed) {
          raw.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = raw;
        setLocal(raw);
        void audio.resume().catch(() => undefined);
        void poll();
      })
      .catch(() => {
        void poll();
      });

    const gainTimer = setInterval(applyGains, 500);
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      clearInterval(gainTimer);
      pcs.forEach((pc) => pc.close());
      stream?.getTracks().forEach((track) => track.stop());
      void audio.close().catch(() => undefined);
      void fetch(apiUrl("/api/rtc"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "leave", room, peer: me }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [room, selfId, name]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {seats.map((seat, index) => {
        const angle = (index / Math.max(seats.length, 1)) * Math.PI * 2 - Math.PI / 2;
        const x = 50 + Math.cos(angle) * (seats.length < 5 ? 38 : 44);
        const y = 46 + Math.sin(angle) * (seats.length < 5 ? 36 : 40);
        const peer = slug(seat.userId);
        const mine = seat.userId === selfId;
        const hidden = quietIds.includes(seat.userId);
        const stream = mine ? local : videos[peer];
        return (
          <div
            key={seat.userId}
            className="absolute w-28 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <div className="mx-auto mb-1 size-16 overflow-hidden rounded-full border border-line bg-ink">
              {stream && !hidden ? (
                <video
                  autoPlay
                  playsInline
                  muted={mine}
                  ref={(node) => {
                    if (node && node.srcObject !== stream) node.srcObject = stream;
                  }}
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <NamePlate name={seat.username} look={seat.look} />
          </div>
        );
      })}
    </div>
  );
}
