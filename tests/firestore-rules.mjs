import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";

let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-bizquest", firestore: { rules: await readFile("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "platformAdmins/admin"), { enabled: true });
    await setDoc(doc(db, "appSettings/global"), { updatedAt: 1 });
    await setDoc(doc(db, "users/teacher/rooms/ABC123"), { roomId: "ABC123", ownerUid: "teacher", status: "WAITING", teams: {} });
    await setDoc(doc(db, "teacherRegistry/teacher"), { uid: "teacher" });
  });
});
after(async () => { await env?.cleanup(); });
const teacher = (uid = "teacher") => env.authenticatedContext(uid, { firebase: { sign_in_provider: "password" } }).firestore();
const student = () => env.authenticatedContext("student", { firebase: { sign_in_provider: "anonymous" } }).firestore();

test("전역 설정 쓰기는 운영자만 가능하고 역할을 스스로 부여할 수 없다", async () => {
  await assertSucceeds(getDoc(doc(teacher(), "appSettings/global")));
  await assertFails(setDoc(doc(teacher(), "appSettings/global"), { updatedAt: 2 }));
  await assertFails(setDoc(doc(student(), "appSettings/global"), { updatedAt: 2 }));
  await assertSucceeds(setDoc(doc(teacher("admin"), "appSettings/global"), { updatedAt: 3 }));
  await assertFails(setDoc(doc(teacher(), "platformAdmins/teacher"), { enabled: true }));
  await assertFails(setDoc(doc(teacher("admin"), "platformAdmins/teacher"), { enabled: true }));
});

test("방 코드는 정확한 코드만 조회 가능하고 타인의 코드를 탈취할 수 없다", async () => {
  const db = teacher();
  const batch = writeBatch(db);
  batch.set(doc(db, "users/teacher/rooms/DEF456"), { roomId: "DEF456", status: "WAITING" });
  batch.set(doc(db, "roomCodes/DEF456"), { roomId: "DEF456", ownerUid: "teacher" });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(student(), "roomCodes/DEF456")));
  await assertFails(getDocs(collection(student(), "roomCodes")));
  await assertFails(setDoc(doc(teacher("other"), "roomCodes/DEF456"), { roomId: "DEF456", ownerUid: "other" }));
  await assertFails(setDoc(doc(teacher(), "roomCodes/MISSING"), { roomId: "MISSING", ownerUid: "teacher" }));
  await assertFails(setDoc(doc(student(), "roomCodes/DEF456"), { roomId: "DEF456", ownerUid: "student" }));
});

test("교사는 자기 방만 수정하고 전체 교사 명부는 운영자만 관리한다", async () => {
  await assertSucceeds(setDoc(doc(teacher(), "users/teacher/rooms/ABC123"), { roomId: "ABC123", status: "WAITING", teams: {} }));
  await assertFails(deleteDoc(doc(teacher("other"), "users/teacher/rooms/ABC123")));
  await assertFails(getDocs(collection(teacher(), "teacherRegistry")));
  await assertFails(deleteDoc(doc(teacher(), "teacherRegistry/teacher")));
  await assertSucceeds(getDocs(collection(teacher("admin"), "teacherRegistry")));
});

test("학생은 자기 사업계획을 자동저장하고 교사 확정 후에는 수정할 수 없다", async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users/teacher/rooms/PLAN01"), { status: "IDEATION", teams: { A: { leaderId: "student", ideaLocked: false, idea: {}, ideaSubmitted: false } } });
    await setDoc(doc(db, "users/teacher/rooms/PLAN01/students/student"), { uid: "student", team: "A", nickname: "팀장" });
  });
  const plan = doc(student(), "users/teacher/rooms/PLAN01");
  await assertSucceeds(updateDoc(plan, { "teams.A.idea": { serviceName: "자동저장" }, "teams.A.ideaSubmitted": false, "teams.A.aiEvaluation": null, updatedAt: 1 }));
  await assertSucceeds(updateDoc(doc(teacher(), "users/teacher/rooms/PLAN01"), { "teams.A.ideaLocked": true }));
  await assertFails(updateDoc(plan, { "teams.A.idea": { serviceName: "늦은 수정" } }));
});
