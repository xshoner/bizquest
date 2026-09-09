import { auth, db, doc, getDoc, runTransaction, signInAnonymously } from "../firebase.js";
import { roomDocRef } from "../hooks/useRoom.js";

export async function registerRoomCode(ownerUid, roomId, initialRoom) {
  const ref = doc(db, "roomCodes", roomId);
  await runTransaction(db, async (transaction) => {
    const entry = await transaction.get(ref);
    if (entry.exists() && entry.data().ownerUid !== ownerUid) throw new Error("이미 사용 중인 방 코드입니다. 새 방을 다시 만들어 주세요.");
    if (initialRoom) transaction.set(roomDocRef(ownerUid, roomId), initialRoom);
    transaction.set(ref, { ownerUid, roomId });
  });
}

export async function resolveRoomCode(code) {
  const roomId = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(roomId)) throw new Error("영문·숫자 6자리 방 코드를 입력하세요.");
  if (!auth.currentUser) await signInAnonymously(auth);
  const entry = await getDoc(doc(db, "roomCodes", roomId));
  if (!entry.exists()) throw new Error("등록된 방이 없습니다. 코드를 확인하거나 교사의 QR로 입장하세요.");
  const ownerUid = entry.data().ownerUid;
  const snapshot = await getDoc(roomDocRef(ownerUid, roomId));
  if (!snapshot.exists()) throw new Error("삭제된 방입니다. 교사에게 새 방 코드를 확인하세요.");
  const room = snapshot.data();
  if (room.closedAt || room.status === "CLOSED") throw new Error("종료된 방입니다. 교사에게 문의하세요.");
  return ownerUid;
}
