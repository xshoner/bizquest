import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/src/firebase.js", (route) => route.fulfill({ contentType: "text/javascript", body: `
    export const auth = { currentUser: { uid: 'teacher-test', isAnonymous: false } }, db = {}, secondaryAuth = {}, firebaseConfig = {};
    export const doc = (...args) => args, collection = doc;
    export const getDoc = async (ref) => ref.includes?.('roomCodes') ? ({ exists: () => ref.at(-1) !== 'ZZZZZZ', data: () => ({ ownerUid: 'teacher-test' }) }) : ref.includes?.('rooms') ? ({ exists: () => true, data: () => ({ status: 'WAITING' }) }) : ref.includes?.('platformAdmins') ? ({ exists: () => true, data: () => ({ enabled: window.adminAllowed !== false }) }) : ref.includes?.('appSettings') ? ({ exists: () => true, data: () => JSON.parse(localStorage.getItem('test-server-settings') || '{}') }) : ({ exists: () => false }), getDocs = async () => ({ docs: [] });
    export const onAuthStateChanged = (_auth, fn) => { fn(auth.currentUser); return () => {}; };
    export const onSnapshot = () => () => {};
    export const runTransaction = async () => {};
    export const updateDoc = async (_ref, patch) => { window.roomUpdates ||= []; window.roomUpdates.push(patch); }, setDoc = async (_ref, payload) => { if (window.failSettingsSave) throw new Error('서버 저장 실패'); window.savedSettings = payload; localStorage.setItem('test-server-settings', JSON.stringify(payload)); }, deleteDoc = updateDoc, getCurrentIdToken = updateDoc,
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
    const room = { ...makeInitialRoom('ABC123', '방 입장 회귀 테스트'), ownerUid: 'teacher-test', students: {}, ...window.roomFixture };
    export const useRoom = () => ({ room, loading: false, error: '' });
    export const roomDocRef = (owner, id) => ['rooms', owner, id], studentDocRef = roomDocRef, studentsCollectionRef = roomDocRef;
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

 test("방 코드와 QR 모두 학생 입장 화면으로 연결되고 없는 방은 안내한다", async ({ page }) => {
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("tab", { name: /학생/ }).click();
  await page.getByPlaceholder("예: ABC123").fill("abc123");
  await page.getByRole("button", { name: "입장하기", exact: true }).click();
  await expect(page.getByPlaceholder("예: 김창업")).toBeVisible();
  await page.goto("/room/ABC123?owner=teacher-test");
  await expect(page.getByPlaceholder("예: 김창업")).toBeVisible();
  await page.goto("/room/ZZZZZZ");
  await expect(page.getByRole("alert")).toContainText("등록된 방이 없습니다");
  expect(errors).toEqual([]);
});

 test("일반 교사는 이전 패스코드 세션이 있어도 전체 설정에 접근할 수 없다", async ({ page }) => {
  await page.addInitScript(() => { window.adminAllowed = false; sessionStorage.setItem("bizquest-settings-unlocked", "true"); });
  await page.goto("/settings.html");
  await expect(page.getByText("운영자 계정으로 로그인해야", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "설정 저장", exact: true })).toHaveCount(0);
});

 test("서버 설정 저장 실패는 캐시를 바꾸지 않고 재시도할 수 있다", async ({ page }) => {
  await page.goto("/settings.html");
  await expect(page.getByLabel("F16 양호 배율")).toHaveValue("1.05");
  const before = await page.evaluate(() => localStorage.getItem("bizquest-app-settings-cache"));
  await page.getByLabel("F16 양호 배율").fill("1.2");
  await page.evaluate(() => { window.failSettingsSave = true; });
  await page.getByRole("button", { name: "설정 저장", exact: true }).click();
  await expect(page.getByText("서버 저장 실패", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("bizquest-app-settings-cache"))).toBe(before);
  await page.evaluate(() => { window.failSettingsSave = false; });
  await page.getByRole("button", { name: "설정 저장", exact: true }).click();
  await expect(page.getByText("서버 저장 완료", { exact: false })).toBeVisible();
  await expect(page.getByText(/기본 \+10% → \+12%/)).toBeVisible();
});

 test("넓은 화면에는 팀 3개, 모바일에는 1개를 배치한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/ABC123");
  await expect(page.locator(".admin-team-card").first()).toBeVisible();
  const boxes = await page.locator(".admin-team-card").evaluateAll((cards) => cards.slice(0, 3).map((c) => ({ top: c.getBoundingClientRect().top, width: c.getBoundingClientRect().width })));
  expect(boxes.length).toBe(3); expect(boxes.every((b) => Math.abs(b.top - boxes[0].top) < 4 && b.width >= 300), JSON.stringify(boxes)).toBe(true);
  await page.locator(".admin-team-section").screenshot({ path: "test-results/team-grid-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.locator(".admin-team-card").evaluateAll((cards) => cards.slice(0, 2).map((c) => c.getBoundingClientRect().top));
  expect(mobile[1]).toBeGreaterThan(mobile[0]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

 test("렌더링 오류에도 재입장 경로를 제공한다", async ({ page }) => {
  await page.route("**/src/hooks/useRoom.js", (route) => route.fulfill({ contentType: "text/javascript", body: `export const useRoom = () => { throw new Error('test render failure'); }; export const roomDocRef = () => ({}), studentDocRef = roomDocRef, studentsCollectionRef = roomDocRef;` }));
  await page.goto("/admin/ABC123");
  await expect(page.getByRole("alert")).toContainText("화면을 불러오지 못했습니다");
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await expect(page.getByRole("link", { name: "메인에서 재입장" })).toHaveAttribute("href", "/");
});

 test("사업계획 초안 충돌은 사용자가 복구할 내용을 선택한 후 저장한다", async ({ page }) => {
  await page.addInitScript(() => {
    window.roomFixture = { status: 'IDEATION', teams: { A: { teamName: '테스트 팀', leaderId: 'teacher-test', idea: { serviceName: '서버 사업' }, ideaSubmitted: false } }, students: { 'teacher-test': { uid: 'teacher-test', nickname: '팀장', team: 'A' } } };
    localStorage.setItem('bizquest:plan:teacher-test:ABC123:A:teacher-test', JSON.stringify({ base: 'old-server', idea: { serviceName: '기기 사업' } }));
  });
  await page.goto('/room/ABC123?owner=teacher-test');
  await expect(page.getByRole('button', { name: '기기 초안 복구' })).toBeVisible();
  await expect(page.getByPlaceholder('예: AI 공부 도우미, 펫케어 매니저')).toBeDisabled();
  expect(await page.evaluate(() => window.roomUpdates?.length || 0)).toBe(0);
  await page.getByRole('button', { name: '기기 초안 복구' }).click();
  await expect(page.getByPlaceholder('예: AI 공부 도우미, 펫케어 매니저')).toHaveValue('기기 사업');
  await expect.poll(() => page.evaluate(() => window.roomUpdates?.at(-1)?.['teams.A.idea']?.serviceName)).toBe('기기 사업');
  await expect(page.getByRole('status')).toContainText('마지막 서버 저장');
});

 test("투자 직접 입력은 만 원 단위로 적용하고 예산 안에서 저장한다", async ({ page }) => {
  await page.addInitScript(() => {
    window.roomFixture = { status: 'INVESTMENT', teams: { A: { teamName: '우리 팀' }, B: { teamName: '상대 팀' } }, students: { 'teacher-test': { uid: 'teacher-test', nickname: '투자자', team: 'A', investments: {} } } };
  });
  await page.goto('/room/ABC123?owner=teacher-test');
  await page.getByRole('button', { name: '직접 입력', exact: true }).click();
  await page.getByLabel('상대 팀 투자 금액 직접 입력 (만 원)').fill('1200');
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await expect(page.locator('.investment-current-amount')).toHaveText('1,200만 원');
  await page.getByRole('button', { name: '투자 확정', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.roomUpdates?.at(-1)?.investments?.B)).toBe(12000000);
  expect(await page.evaluate(() => window.roomUpdates.at(-1).investmentSubmitted)).toBe(true);
});

 test("AI 재평가는 정상 완료 팀을 유지하고 미평가·대체평가만 요청한다", async ({ page }) => {
  await page.addInitScript(() => {
    const idea = { serviceName: '사업계획' };
    window.roomFixture = { status: 'AI_EVALUATION', aiEvaluationStatus: 'done', teams: {
      A: { teamName: '완료 팀', idea, ideaSubmitted: true, ideaLocked: true, aiEvaluation: { factors: {}, model: 'gemini-2.5-flash' } },
      B: { teamName: '대체 팀', idea, ideaSubmitted: true, ideaLocked: true, aiEvaluation: { factors: {}, model: 'gemini-2.5-flash-fallback', errorMessage: '응답 시간 초과' } },
      C: { teamName: '대기 팀', idea, ideaSubmitted: true, ideaLocked: true }
    }, students: { a: { uid: 'a', nickname: '가', team: 'A' }, b: { uid: 'b', nickname: '나', team: 'B' }, c: { uid: 'c', nickname: '다', team: 'C' } } };
  });
  const requests = [];
  await page.route('**/api/ai-evaluation', (route) => { requests.push(route.request().postDataJSON().teamKey); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ evaluation: { factors: {}, model: 'gemini-2.5-flash' } }) }); });
  await page.goto('/admin/ABC123');
  await expect(page.locator('.progress-panel')).toContainText('1/3');
  await expect(page.getByText('대체평가 적용: 응답 시간 초과')).toBeVisible();
  await page.getByRole('button', { name: '미완료', exact: true }).click();
  await expect(page.locator('.admin-team-card')).toHaveCount(2);
  await page.getByRole('button', { name: '미평가·대체평가 팀만 다시 평가' }).click();
  await expect.poll(() => requests).toEqual(['B', 'C']);
  await expect.poll(() => page.evaluate(() => window.roomUpdates?.at(-1)?.aiEvaluationStatus)).toBe('done');
});
