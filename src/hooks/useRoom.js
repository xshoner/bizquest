import { useEffect, useState } from "react";
import { auth, db, doc, onAuthStateChanged, onSnapshot, signInAnonymously } from "../firebase.js";

export function roomDocRef(ownerUid, roomId) {
  return doc(db, "users", ownerUid, "rooms", roomId);
}

export function useRoom(roomId, ownerUid) {
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(Boolean(roomId));
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribeRoom = null;
    let unsubscribeAuth = null;
    let cancelled = false;

    if (!roomId) {
      setRoom(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    async function ensureAuth() {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      }
    }

    ensureAuth().catch((err) => {
      if (!cancelled) {
        setError(err.message || "방 정보를 확인하기 위한 인증에 실패했습니다.");
        setLoading(false);
      }
    });

    unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (unsubscribeRoom) {
        unsubscribeRoom();
        unsubscribeRoom = null;
      }

      const effectiveOwnerUid = ownerUid || user?.uid;
      if (!user?.uid || !effectiveOwnerUid) {
        setRoom(null);
        setError("방 정보를 확인하는 중입니다.");
        setLoading(false);
        return;
      }

      unsubscribeRoom = onSnapshot(
        roomDocRef(effectiveOwnerUid, roomId),
        (snapshot) => {
          const data = snapshot.exists() ? snapshot.data() : null;
          setRoom(data ? { ...data, ownerUid: data.ownerUid || effectiveOwnerUid } : null);
          setLoading(false);
        },
        (err) => {
          setError(err.code === "permission-denied" ? "방 정보를 읽을 권한이 없습니다. 학생 QR 입장을 허용하도록 Firestore 규칙을 확인하세요." : err.message);
          setLoading(false);
        }
      );
    });

    return () => {
      cancelled = true;
      if (unsubscribeRoom) unsubscribeRoom();
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, [ownerUid, roomId]);

  return { room, loading, error };
}
