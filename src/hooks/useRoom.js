import { useEffect, useState } from "react";
import { auth, collection, db, doc, onAuthStateChanged, onSnapshot, signInAnonymously } from "../firebase.js";
import { withDerivedInvestments } from "../lib/game.js";

export function roomDocRef(ownerUid, roomId) {
  return doc(db, "users", ownerUid, "rooms", roomId);
}

export function studentsCollectionRef(ownerUid, roomId) {
  return collection(db, "users", ownerUid, "rooms", roomId, "students");
}

export function studentDocRef(ownerUid, roomId, studentUid) {
  return doc(db, "users", ownerUid, "rooms", roomId, "students", studentUid);
}

/**
 * Merges the room document with the `students` sub-collection into the legacy in-memory shape
 * (`room.students[uid]`, `room.teams[key].investmentsReceived`) so UI code keeps working unchanged.
 * Rooms created before the sub-collection migration may still carry an inline `students` map; those
 * entries are kept until a sub-collection record with the same uid replaces them.
 */
export function mergeRoomSnapshot(roomData, studentDocs, ownerUid) {
  if (!roomData) return null;
  const students = { ...(roomData.students || {}) };
  for (const [uid, student] of Object.entries(studentDocs || {})) {
    students[uid] = { ...student, uid };
  }
  return {
    ...roomData,
    ownerUid: roomData.ownerUid || ownerUid,
    students,
    teams: withDerivedInvestments(roomData.teams || {}, students, roomData.status)
  };
}

function permissionMessage(err, fallback) {
  if (err?.code === "permission-denied") return fallback;
  return err?.message || fallback;
}

export function useRoom(roomId, ownerUid) {
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(Boolean(roomId));
  const [error, setError] = useState("");

  useEffect(() => {
    let unsubscribeRoom = null;
    let unsubscribeStudents = null;
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

    function stopListeners() {
      if (unsubscribeRoom) unsubscribeRoom();
      if (unsubscribeStudents) unsubscribeStudents();
      unsubscribeRoom = null;
      unsubscribeStudents = null;
    }

    unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      stopListeners();

      const effectiveOwnerUid = ownerUid || user?.uid;
      if (!user?.uid || !effectiveOwnerUid) {
        setRoom(null);
        setError("방 정보를 확인하는 중입니다.");
        setLoading(false);
        return;
      }

      let latestRoom = undefined;
      let latestStudents = {};
      let roomLoaded = false;
      let studentsLoaded = false;

      function publish() {
        if (cancelled || !roomLoaded || !studentsLoaded) return;
        setRoom(mergeRoomSnapshot(latestRoom, latestStudents, effectiveOwnerUid));
        setError("");
        setLoading(false);
      }

      unsubscribeRoom = onSnapshot(
        roomDocRef(effectiveOwnerUid, roomId),
        (snapshot) => {
          latestRoom = snapshot.exists() ? snapshot.data() : null;
          roomLoaded = true;
          publish();
        },
        (err) => {
          setError(permissionMessage(err, "방 정보를 읽을 권한이 없습니다. Firestore 보안 규칙(firestore.rules)이 배포되어 있는지 확인하세요."));
          setLoading(false);
        }
      );

      unsubscribeStudents = onSnapshot(
        studentsCollectionRef(effectiveOwnerUid, roomId),
        (snapshot) => {
          latestStudents = Object.fromEntries(snapshot.docs.map((item) => [item.id, item.data()]));
          studentsLoaded = true;
          publish();
        },
        (err) => {
          setError(permissionMessage(err, "참가자 정보를 읽을 권한이 없습니다. Firestore 보안 규칙을 확인하세요."));
          setLoading(false);
        }
      );
    });

    return () => {
      cancelled = true;
      stopListeners();
      if (unsubscribeAuth) unsubscribeAuth();
    };
  }, [ownerUid, roomId]);

  return { room, loading, error };
}
