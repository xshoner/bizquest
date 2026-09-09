import test from "node:test";
import assert from "node:assert/strict";
import { migrateLandingCopy } from "./landingCopy.js";

test("이전에 저장된 기본 문구도 새 디자인 문구로 전환한다", () => {
  const defaults = { heroTitle: "아이디어를 넘어,\n경영을 경험하다." };
  assert.equal(migrateLandingCopy({ heroTitle: "게임처럼 시작하는 청소년 창업 체험교육" }, defaults).heroTitle, defaults.heroTitle);
});

test("관리자가 직접 작성한 문구와 통계는 유지한다", () => {
  const incoming = { heroTitle: "우리 학교 창업 프로젝트", statItems: [{ title: "참여", description: "42명" }], contactEmail: "teacher@example.com" };
  assert.deepEqual(migrateLandingCopy(incoming, { heroTitle: "새 기본 제목" }), incoming);
  assert.deepEqual(migrateLandingCopy(), {});
});
