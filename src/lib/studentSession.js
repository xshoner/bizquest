import { auth, browserLocalPersistence, onAuthStateChanged, setPersistence, signInAnonymously } from "../firebase.js";

let pending;
// Never create an anonymous user before Firebase has restored the persisted user.
export function ensureStudentAuth() {
  if (!pending) pending = (async () => {
    if (auth.authStateReady) await auth.authStateReady();
    else await new Promise((resolve) => {
      let unsubscribe;
      unsubscribe = onAuthStateChanged(auth, () => { resolve(); queueMicrotask(() => unsubscribe?.()); });
    });
    if (auth.currentUser) return auth.currentUser;
    await setPersistence(auth, browserLocalPersistence);
    return (await signInAnonymously(auth)).user;
  })().finally(() => { pending = null; });
  return pending;
}

export function rememberStudent(ownerUid, roomId, student) {
  try {
    localStorage.setItem(`bizquest:student:${ownerUid}:${roomId}`, JSON.stringify({ uid: student.uid, nickname: student.nickname }));
  } catch { /* Firebase authentication remains authoritative when storage is unavailable. */ }
}
