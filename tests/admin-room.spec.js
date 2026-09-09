import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/src/firebase.js", (route) => route.fulfill({ contentType: "text/javascript", body: `
    export const auth = { currentUser: { uid: 'teacher-test', isAnonymous: false } }, db = {}, secondaryAuth = {}, firebaseConfig = {};
    export const doc = (...args) => args, collection = doc;
    export const getDoc = async () => ({ exists: () => false }), getDocs = async () => ({ docs: [] });
    export const onAuthStateChanged = (_auth, fn) => { fn(auth.currentUser); return () => {}; };
    export const onSnapshot = () => () => {};
    export const updateDoc = async () => {}, setDoc = async (_ref, payload) => { window.savedSettings = payload; }, deleteDoc = updateDoc, getCurrentIdToken = updateDoc,
      browserLocalPersistence = {}, createUserWithEmailAndPassword = updateDoc, deleteField = updateDoc,
      setPersistence = updateDoc, signInAnonymously = updateDoc, signInWithEmailAndPassword = updateDoc,
      signOut = updateDoc, updateProfile = updateDoc, writeBatch = updateDoc;
  ` }));
  await page.route("**/src/hooks/useTeacherAuth.js", (route) => route.fulfill({ contentType: "text/javascript", body: `
    const user = { uid: 'teacher-test', isAnonymous: false };
    export const useTeacherAuth = () => ({ ready: true, loggedIn: true, user });
    export const loginTeacher = async () => {}, logoutTeacher = loginTeacher, registerTeacher = loginTeacher, createManagedTeacher = loginTeacher;
    export const readLocalTeacherRegistry = () => [];
  ` }));
  await page.route("**/src/hooks/useRoom.js", (route) => route.fulfill({ contentType: "text/javascript", body: `
    import { makeInitialRoom } from '/src/lib/game.js';
    const room = { ...makeInitialRoom('ABC123', '방 입장 회귀 테스트'), ownerUid: 'teacher-test', students: {} };
    export const useRoom = () => ({ room, loading: false, error: '' });
    export const roomDocRef = () => ({}), studentDocRef = roomDocRef, studentsCollectionRef = roomDocRef;
  ` }));
});

test("관리자 방 입장 시 전체 대시보드와 학생 초대 QR을 렌더링한다", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/admin/ABC123");
  await expect(page.locator(".admin-dashboard")).toBeVisible();
  await expect(page.locator(".admin-room-meta")).toContainText("ABC123");
  await expect(page.locator('.qr-panel svg[width="190"]')).toBeVisible();
  await expect(page.locator(".admin-dashboard")).toContainText("학생");
  expect(errors).toEqual([]);
});


test("관리자 설정에 코드 기본값을 표시하고 수정·저장·복원한다", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    sessionStorage.setItem("bizquest-settings-unlocked", "true");
    if (!localStorage.getItem("bizquest-app-settings-cache")) localStorage.setItem("bizquest-app-settings-cache", JSON.stringify({ adminPasscode: "test-only", adminPasscodeChangedAt: 1, updatedAt: Date.now() }));
  });
  await page.goto("/settings.html");
  await expect(page.getByLabel("E01 양호 기본 변동률")).toHaveValue("3");
  await expect(page.getByLabel("E01 보통 기본 변동률")).toHaveValue("-5");
  await expect(page.getByLabel("E01 취약 기본 변동률")).toHaveValue("-12");
  await expect(page.getByLabel("E01 상승 배율")).toHaveValue("1");
  await expect(page.getByLabel("F01 양호 배율")).toHaveValue("1");
  for (const [label, value] of [["F16 양호 배율", "1.05"], ["F16 보통 배율", "1.015"], ["F16 취약 배율", "1.035"], ["F17 양호 배율", "0.95"], ["F17 보통 배율", "0.975"], ["F17 취약 배율", "1.037"]]) {
    await expect(page.getByLabel(label)).toHaveValue(value);
  }
  await page.getByLabel("E01 보통 기본 변동률").fill("-8");
  await page.getByLabel("E01 상승 배율").fill("0");
  await page.getByLabel("F16 보통 배율").fill("1.2");
  await page.getByRole("button", { name: "설정 저장", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.savedSettings?.simulation.globalFactorMultipliers.F16.보통)).toBe(1.2);
  expect(await page.evaluate(() => window.savedSettings.simulation.eventRates.E01.보통)).toBe(-8);
  expect(await page.evaluate(() => window.savedSettings.simulation.eventMultipliers.E01.positive)).toBe(0);
  await page.reload();
  await expect(page.getByLabel("F16 보통 배율")).toHaveValue("1.2");
  await page.getByRole("button", { name: "이벤트 코드 기본값으로 복원" }).click();
  await page.getByRole("button", { name: "팩터 코드 기본값으로 복원" }).click();
  await expect(page.getByLabel("E01 보통 기본 변동률")).toHaveValue("-5");
  await expect(page.getByLabel("F16 보통 배율")).toHaveValue("1.015");
  await page.locator(".settings-panel").filter({ has: page.getByRole("heading", { name: "이벤트 카드 ± 배율", exact: true }) }).screenshot({ path: "test-results/event-settings.png" });
  await page.locator(".settings-panel").filter({ has: page.getByRole("heading", { name: "AI 평가 팩터별 등급 배율", exact: true }) }).screenshot({ path: "test-results/factor-settings.png" });
  expect(errors).toEqual([]);
});
