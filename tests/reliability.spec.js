import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/src/firebase.js", route => route.fulfill({ contentType: "text/javascript", body: `
    const listeners = new Set(); export const auth = { currentUser: null, authStateReady: async () => { if(auth.currentUser) return; await new Promise(r=>setTimeout(r, 500)); auth.currentUser = { uid: 'original-student' }; for(const fn of listeners) fn(auth.currentUser); } }, db = {};
    export const browserLocalPersistence = {}, setPersistence = async () => {};
    export const signInAnonymously = async () => { window.anonymousCalls = (window.anonymousCalls || 0) + 1; return { user: { uid: 'wrong-new-user' } }; };
    export const doc = (...args) => args, collection = doc;
    export const onAuthStateChanged = (_auth, fn) => { listeners.add(fn); fn(auth.currentUser); return () => listeners.delete(fn); };
    export const onSnapshot = (ref, options, callback) => {
      const fn = typeof options === 'function' ? options : callback;
      const students = ref.at(-1) === 'students';
      if(students) fn({ docs: [], metadata: { fromCache: true } });
      const timer = setTimeout(() => fn(students ? { docs: [{id:'original-student',data:()=>({uid:'original-student',nickname:'기존학생',team:'A'})}],metadata:{fromCache:false} } : {exists:()=>true,data:()=>({roomId:'ABC123',status:'SIMULATION',teams:{A:{teamName:'가'}}})}),100);
      return () => clearTimeout(timer);
    };
  ` }));
  await page.route("**/src/lib/roomStore.js", route => route.fulfill({ contentType: "text/javascript", body: `
    export async function updateOwnStudent(owner, room, uid, patch) {
      window.writes ||= [];
      await new Promise(r => setTimeout(r, window.saveDelay || 0));
      if (window.failSave) throw Object.assign(new Error('연결 끊김'), { code: 'unavailable' });
      window.writes.push(patch);
      window.serverStudent = { uid, team: 'A', ...patch };
    }
  ` }));
});

test("50ms 실시간 갱신 중 슬라이더·화살표·직접 입력은 유지되고 확정된다", async ({ page }) => {
  await page.goto('/tests/fixtures/reliability.html');
  const slider = page.getByRole('slider', { name: '바다 팀 투자 금액', exact: true });
  await slider.fill('10000000');
  await expect(slider).toHaveValue('10000000');
  await slider.press('ArrowRight');
  await expect(slider).toHaveValue('11000000');
  await expect.poll(() => page.evaluate(() => window.writes?.at(-1)?.investments.B)).toBe(11000000);
  await page.getByRole('button', { name: '직접 입력', exact: true }).first().click();
  await page.getByLabel('바다 팀 투자 금액 직접 입력 (만 원)').fill('2300');
  await page.getByRole('button', { name: '적용', exact: true }).click();
  await page.getByRole('button', { name: '투자 확정', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.writes?.at(-1)?.investmentSubmitted)).toBe(true);
  await expect(slider).toHaveValue('23000000');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(() => page.evaluate(() => window.writes?.at(-1)?.investmentSubmitted)).toBe(true);
});

test("입력 저장 실패 후 새로고침해도 초안을 복원하고 예산 초과를 막는다", async ({ page }) => {
  await page.goto('/tests/fixtures/reliability.html');
  await page.evaluate(() => { window.failSave = true; });
  await page.getByRole('slider', { name: '바다 팀 투자 금액', exact: true }).fill('40000000');
  await expect(page.getByRole('alert')).toContainText('네트워크');
  await page.reload();
  await expect(page.getByRole('slider', { name: '바다 팀 투자 금액', exact: true })).toHaveValue('40000000');
  await page.getByRole('slider', { name: '하늘 팀 투자 금액', exact: true }).fill('40000000');
  await expect(page.getByRole('slider', { name: '하늘 팀 투자 금액', exact: true })).toHaveValue('10000000');
  await expect.poll(() => page.evaluate(() => window.writes?.at(-1)?.investments.C)).toBe(10000000);
});

test("팀·아이템 단일 목록과 팝업 평가 요약·의견 펼침·닫기", async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/tests/fixtures/reliability.html');
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.getByRole('button', {name:/바다 팀.*파도 발전기/}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('양호 1건');
  await expect(dialog.getByText('시장 근거 있음')).not.toBeVisible();
  await page.getByText('AI 평가 의견 보기', {exact:true}).click();
  await expect(dialog.getByText('시장 근거 있음')).toBeVisible();
  await page.screenshot({path:'test-results/investment-modal-mobile.png'});
  await page.getByText('AI 평가 의견 보기', {exact:true}).click();
  await dialog.getByText('에너지 부족', {exact:false}).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/investment-list-mobile.png'});
});

test("타이머 60초·20초·5~1 알림은 입력을 막지 않고 0초에 사라진다", async ({ page }) => {
  await page.clock.install();
  await page.goto('/tests/fixtures/reliability.html');
  await page.getByRole('button', {name:'61초 시작'}).click();
  await page.clock.fastForward(1000);
  await expect(page.locator('.student-timer-alert')).toHaveText('1분');
  await page.getByRole('button',{name:'바다 팀 투자금 100만원 늘리기'}).click();
  await expect(page.getByRole('slider',{name:'바다 팀 투자 금액',exact:true})).toHaveValue('1000000');
  await page.clock.fastForward(40000);
  await expect(page.locator('.student-timer-alert')).toHaveText('20초');
  await page.clock.fastForward(15000);
  for (const n of [5,4,3,2,1]) {
    await expect(page.locator('.student-timer-alert')).toHaveText(String(n));
    await page.clock.fastForward(1000);
  }
  await expect(page.locator('.student-timer-alert')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'투자 확정',exact:true})).toBeEnabled();
});

test("지연된 인증 복원이 끝나기 전 익명 계정을 만들지 않는다", async ({ page }) => {
  await page.goto('/tests/fixtures/reliability.html?mode=session');
  await expect(page.getByRole('status')).toHaveText('original-student');
  await expect(page.getByTestId('resumed-room')).toHaveText('SIMULATION · A');
  await page.getByRole('button',{name:'재연결',exact:true}).click();
  await expect(page.getByTestId('resumed-room')).toHaveText('SIMULATION · A');
  expect(await page.evaluate(()=>window.anonymousCalls || 0)).toBe(0);
});
