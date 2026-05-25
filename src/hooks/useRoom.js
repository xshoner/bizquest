import { useEffect, useState } from "react";
import { auth, db, doc, onSnapshot, signInAnonymously } from "../firebase.js";

export function useRoom(roomId) {
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(Boolean(roomId));
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribe = null;
    let cancelled = false;

    if (!roomId) {
      setRoom(null);
      setLoading(false);
      return undefined;
    }

    async function subscribeRoom() {
      setLoading(true);
      setError("");

      try {
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }

        if (cancelled) return;

        const roomRef = doc(db, "rooms", roomId);
        unsubscribe = onSnapshot(
          roomRef,
          (snapshot) => {
            setRoom(snapshot.exists() ? snapshot.data() : null);
            setLoading(false);
          },
          (err) => {
            const message = err.code === "permission-denied"
              ? "방 정보를 읽을 권한이 없습니다. Firebase Firestore 규칙에서 인증된 사용자의 rooms 읽기/수정이 허용되어야 합니다."
              : err.message;
            setError(message);
            setLoading(false);
          }
        );
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "익명 로그인에 실패했습니다.");
          setLoading(false);
        }
      }
    }

    subscribeRoom();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [roomId]);

  return { room, loading, error };
}
