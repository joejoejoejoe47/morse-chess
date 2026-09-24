import { useEffect, useState } from "react";

const DB_NAME = "morse-room-model";
const STORE = "files";
const KEY = "model";

export type StoredRoomModel = { name: string; data: ArrayBuffer };

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open model storage."));
  });
}

export async function saveRoomModel(data: ArrayBuffer, name: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ name, data } satisfies StoredRoomModel, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save that model."));
  });
  db.close();
}

export async function loadRoomModel(): Promise<StoredRoomModel | null> {
  const db = await openDb();
  const row = await new Promise<StoredRoomModel | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as StoredRoomModel | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("Could not read that model."));
  });
  db.close();
  return row;
}

export async function clearRoomModel() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not remove that model."));
  });
  db.close();
}

export function useRoomModelUrl(enabled: boolean, rev: number) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) {
      setUrl(null);
      return;
    }
    let dead = false;
    let created: string | null = null;
    void loadRoomModel()
      .then((file) => {
        if (dead || !file?.data) return;
        const name = file.name?.toLowerCase().endsWith(".gltf") ? "room.gltf" : "room.glb";
        created = URL.createObjectURL(new File([file.data], name));
        setUrl(created);
      })
      .catch(() => {
        if (!dead) setUrl(null);
      });
    return () => {
      dead = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [enabled, rev]);
  return url;
}
