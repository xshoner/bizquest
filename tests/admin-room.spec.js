import { test, expect } from "@playwright/test";

test("관리자 방 입장 시 전체 대시보드와 학생 초대 QR을 렌더링한다", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/src/firebase.js", (route) => route.fulfill({ contentType: "text/javascript", body: `
    export const auth = { currentUser: { uid: 'teacher-test', isAnonymous: false } }, db = {}, secondaryAuth = {}, firebaseConfig = {};
    export const doc = (...args) => args, collection = doc;
    export const getDoc = async () => ({ exists: () => false }), getDocs = async () => ({ docs: [] });
    export const onAuthStateChanged = (_auth, fn) => { fn(auth.currentUser); return () => {}; };
    export const onSnapshot = () => () => {};
    export const updateDoc = async () => {}, setDoc = updateDoc, deleteDoc = updateDoc, getCurrentIdToken = updateDoc,
      browserLocalPersistence = {}, createUserWithEmailAndPassword = updateDoc, deleteField = updateDoc,
      setPersistence = updateDoc, signInAnonymously = updateDoc, signInWithEmailAndPassword = updateDoc,
      signOut = updateDoc, updateProfile = updateDoc, writeBatch = updateDoc;
  ` }));
  await page.route("**/src/hooks/useTeacherAuth.js", (route) => route.fulfill({ contentType: "text/javascript", body: `
    const user = { uid: 'teacher-test', isAnonymous: false };
    export const useTeacherAuth = () => ({ ready: true, loggedIn: true, user });
    export const loginTeacher = async () => {}, logoutTeacher = loginTeacher, registerTeacher = loginTeacher;
  ` }));
  await page.route("**/src/hooks/useRoom.js", (route) => route.fulfill({ contentType: "text/javascript", body: `
    import { makeInitialRoom } from '/src/lib/game.js';
    const room = { ...makeInitialRoom('ABC123', '방 입장 회귀 테스트'), ownerUid: 'teacher-test', students: {} };
    export const useRoom = () => ({ room, loading: false, error: '' });
    export const roomDocRef = () => ({}), studentDocRef = roomDocRef, studentsCollectionRef = roomDocRef;
  ` }));
  await page.goto("/admin/ABC123");
  await expect(page.locator(".admin-dashboard")).toBeVisible();
  await expect(page.locator(".admin-room-meta")).toContainText("ABC123");
  await expect(page.locator('.qr-panel svg[width="190"]')).toBeVisible();
  await expect(page.locator(".admin-dashboard")).toContainText("학생");
  expect(errors).toEqual([]);
});
