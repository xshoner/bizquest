import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/src/lib/roomStore.js", (route) => route.fulfill({ contentType: "text/javascript", body: `export async function updateOwnTeam(owner,room,team,patch) { window.writes ||= []; if(window.failSave) throw new Error('offline'); await new Promise(r=>setTimeout(r, window.saveDelay || 0)); window.writes.push(patch); }` }));
  await page.addInitScript(() => {
    window.audios = [];
    window.Audio = class extends EventTarget {
      constructor(src) { super(); this.src = src; this.paused = true; this.currentTime = 0; window.audios.push(this); }
      async play() { if (window.blockAudio) throw new Error("autoplay blocked"); this.paused = false; this.dispatchEvent(new Event("play")); }
      pause() { this.paused = true; this.dispatchEvent(new Event("pause")); }
    };
  });
  await page.goto("/tests/fixtures/harness.html");
});

test("단계별 반복 BGM, 수동 중지, 다음 단계 초기화와 시뮬레이션 제어", async ({ page }) => {
  await expect(page.getByRole("button", { name: "BGM 중지", exact: true })).toBeVisible();
  for (const [phase, file] of [["WAITING", "0011"], ["IDEATION", "0014"], ["AI_EVALUATION", "0012"], ["INVESTMENT", "0013"]]) {
    await page.getByLabel("단계").selectOption(phase);
    await expect.poll(() => page.evaluate(() => window.audios.at(-1).src)).toContain(file);
    expect(await page.evaluate(() => window.audios.at(-1).loop)).toBe(true);
    await page.getByRole("button", { name: "BGM 중지", exact: true }).click();
    await page.locator("h3").click();
    expect(await page.evaluate(() => window.audios.every((audio) => audio.paused))).toBe(true);
    await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  }
  await page.getByLabel("단계").selectOption("SIMULATION");
  await page.getByRole("button", { name: "시뮬레이션 시작", exact: true }).click();
  await page.getByRole("button", { name: "BGM 중지", exact: true }).click();
  await page.getByRole("button", { name: "시뮬레이션 시작", exact: true }).click();
  expect(await page.evaluate(() => window.audios.every((audio) => audio.paused))).toBe(true);
  await page.getByLabel("단계").selectOption("RESULT");
  await expect(page.getByRole("button", { name: /^BGM/ })).toHaveCount(0);
  expect(await page.evaluate(() => window.audios.every((audio) => audio.paused))).toBe(true);
});

test("자동재생 차단 후 재생 버튼 첫 클릭으로 음악이 재생된다", async ({ page }) => {
  await page.evaluate(() => { window.blockAudio = true; });
  await page.getByLabel("단계").selectOption("IDEATION");
  await expect(page.getByRole("button", { name: "BGM 재생", exact: true })).toBeVisible();
  await page.evaluate(() => { window.blockAudio = false; });
  await page.getByRole("button", { name: "BGM 재생", exact: true }).click();
  await expect(page.getByRole("button", { name: "BGM 중지", exact: true })).toBeVisible();
});

test("초안 자동저장과 진행 중 저장 이후 최종 제출의 순서를 보장한다", async ({ page }) => {
  await page.getByLabel("사업명").fill("첫 초안");
  await expect.poll(() => page.evaluate(() => window.writes?.at(-1)?.idea.serviceName)).toBe("첫 초안");
  expect(await page.evaluate(() => window.writes.at(-1).ideaSubmitted)).toBe(false);
  await page.evaluate(() => { window.saveDelay = 1500; });
  await page.getByLabel("사업명").fill("저장 중 초안");
  await expect(page.getByRole("status")).toHaveText("자동저장 중…");
  await page.getByLabel("사업명").fill("최종 제출 내용");
  await page.getByRole("button", { name: "제출", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.writes?.at(-1)?.ideaSubmitted), { timeout: 7000 }).toBe(true);
  expect(await page.evaluate(() => window.writes.at(-1).idea.serviceName)).toBe("최종 제출 내용");
  expect(await page.evaluate(() => localStorage.getItem("test-draft"))).toBeNull();
});

test("저장 실패 초안을 새로고침 후 복원하고 재저장한다", async ({ page }) => {
  await page.evaluate(() => { window.failSave = true; });
  await page.getByLabel("사업명").fill("오프라인 초안");
  await expect(page.getByRole("status")).toContainText("자동저장 실패");
  await page.reload();
  await expect(page.getByLabel("사업명")).toHaveValue("오프라인 초안");
  await expect.poll(() => page.evaluate(() => window.writes?.at(-1)?.idea.serviceName)).toBe("오프라인 초안");
});

test("학생 세부 평가 새 창은 17개 근거와 총평을 안전하게 표시한다", async ({ page }) => {
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "세부내용보기" }).click();
  const popup = await popupPromise;
  await expect(popup.locator("article")).toHaveCount(17);
  await expect(popup.locator("body")).toContainText("F17 구현 방식을 검토할 필요가 있다.");
  for (const id of ["F16", "F17"]) {
    const detail = popup.locator("article").filter({ has: popup.locator("h2", { hasText: id }) });
    await expect(detail).not.toContainText(/양호|보통|취약|가산|방어/);
  }
  await expect(popup.locator("body")).toContainText("강점과 보완점을 확인하세요.");
  await expect(popup.locator("script")).toHaveCount(0);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.setViewportSize({ width: 390, height: 844 });
  expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await popup.screenshot({ path: "test-results/student-evaluation-mobile.png", fullPage: true });
});
