import { useEffect, useMemo, useState } from "react";
import {
  auth,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  db,
  doc,
  onAuthStateChanged,
  secondaryAuth,
  setDoc,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "../firebase.js";

const TEACHER_REGISTRY_KEY = "bizquest-teacher-registry";

export function idToAuthEmail(id) {
  const normalized = String(id || "").trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@bizquest.local`;
}

function sanitizeTeacherId(id) {
  return String(id || "").trim().replace(/\s+/g, "");
}

function authErrorMessage(err, fallback = "처리 중 오류가 발생했습니다.") {
  if (err?.code === "auth/email-already-in-use") return "이미 사용 중인 아이디입니다. 기존 계정이면 로그인하세요.";
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-email"].includes(err?.code)) {
    return "아이디 또는 비밀번호가 올바르지 않습니다.";
  }
  if (err?.code === "auth/weak-password") return "비밀번호는 8자리 이상으로 입력하세요.";
  return err?.message || fallback;
}

export function validateTeacherPassword(password) {
  if (String(password || "").length < 8) {
    throw new Error("비밀번호는 8자리 이상이어야 합니다.");
  }
}

export function readLocalTeacherRegistry() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TEACHER_REGISTRY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rememberTeacher(profile) {
  if (typeof window === "undefined") return;
  const current = readLocalTeacherRegistry();
  const next = [
    { ...profile, savedAt: Date.now() },
    ...current.filter((item) => item.uid !== profile.uid && item.id !== profile.id)
  ];
  window.localStorage.setItem(TEACHER_REGISTRY_KEY, JSON.stringify(next));
}

async function writeTeacherRegistry(profile) {
  const publicProfile = {
    uid: profile.uid,
    id: profile.id,
    email: profile.email || "",
    authEmail: profile.authEmail || idToAuthEmail(profile.id),
    createdBy: profile.createdBy || "self",
    createdAt: profile.createdAt || Date.now()
  };
  await setDoc(doc(db, "teacherRegistry", profile.uid), publicProfile, { merge: true });
  return publicProfile;
}

export function useTeacherAuth() {
  const [user, setUser] = useState(null);
  const [teacherId, setTeacherId] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;

    setPersistence(auth, browserLocalPersistence)
      .catch(() => null)
      .finally(() => {
        if (!active) return;
        unsubscribe = onAuthStateChanged(auth, (nextUser) => {
          setUser(nextUser && !nextUser.isAnonymous ? nextUser : null);
          setTeacherId(nextUser && !nextUser.isAnonymous ? nextUser.displayName || localStorage.getItem("bizquest-teacher-id") || "" : "");
          setReady(true);
        });
      });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return useMemo(() => ({ user, teacherId, ready, loggedIn: Boolean(user) }), [ready, teacherId, user]);
}

export async function loginTeacher(id, password) {
  const teacherId = sanitizeTeacherId(id);
  if (!teacherId || !password) throw new Error("아이디와 비밀번호를 입력하세요.");
  try {
    await setPersistence(auth, browserLocalPersistence);
    const credential = await signInWithEmailAndPassword(auth, idToAuthEmail(teacherId), password);
    if (credential.user.displayName !== teacherId) {
      await updateProfile(credential.user, { displayName: teacherId });
    }
    await setDoc(doc(db, "users", credential.user.uid, "profile", "account"), {
      uid: credential.user.uid,
      id: teacherId,
      authEmail: idToAuthEmail(teacherId),
      lastLoginAt: Date.now()
    }, { merge: true });
    localStorage.setItem("bizquest-teacher-id", teacherId);
    return credential.user;
  } catch (err) {
    throw new Error(authErrorMessage(err, "로그인에 실패했습니다."));
  }
}

export async function registerTeacher({ id, email, password, createdBy = "self", authInstance = auth }) {
  const teacherId = sanitizeTeacherId(id);
  if (!teacherId || !email || !password) throw new Error("id, pw, 이메일 주소를 모두 입력하세요.");
  validateTeacherPassword(password);
  try {
    if (authInstance === auth) await setPersistence(auth, browserLocalPersistence);
    const credential = await createUserWithEmailAndPassword(authInstance, idToAuthEmail(teacherId), password);
    await updateProfile(credential.user, { displayName: teacherId });
    const profile = {
      uid: credential.user.uid,
      id: teacherId,
      email: String(email).trim(),
      authEmail: idToAuthEmail(teacherId),
      createdBy,
      createdAt: Date.now()
    };
    await setDoc(doc(db, "users", credential.user.uid, "profile", "account"), profile);
    await writeTeacherRegistry(profile);
    rememberTeacher(profile);
    if (authInstance === auth) localStorage.setItem("bizquest-teacher-id", teacherId);
    return { user: credential.user, profile };
  } catch (err) {
    throw new Error(authErrorMessage(err, "회원가입에 실패했습니다."));
  }
}

export async function createManagedTeacher(adminUser, payload) {
  if (!adminUser?.uid) throw new Error("관리자 로그인이 필요합니다.");
  const teacherId = sanitizeTeacherId(payload.id);
  if (!teacherId || !payload.email || !payload.password) throw new Error("id, pw, 이메일 주소를 모두 입력하세요.");
  validateTeacherPassword(payload.password);
  try {
    const credential = await createUserWithEmailAndPassword(secondaryAuth, idToAuthEmail(teacherId), payload.password);
    await updateProfile(credential.user, { displayName: teacherId });
    await signOut(secondaryAuth).catch(() => {});
    const profile = {
      uid: credential.user.uid,
      id: teacherId,
      email: String(payload.email).trim(),
      authEmail: idToAuthEmail(teacherId),
      createdBy: adminUser.uid,
      createdAt: Date.now()
    };
    await setDoc(doc(db, "users", adminUser.uid, "managedUsers", credential.user.uid), profile);
    await writeTeacherRegistry(profile).catch(() => null);
    rememberTeacher(profile);
    return { user: credential.user, profile };
  } catch (err) {
    await signOut(secondaryAuth).catch(() => {});
    throw new Error(authErrorMessage(err, "회원 생성에 실패했습니다."));
  }
}

export async function logoutTeacher() {
  localStorage.removeItem("bizquest-teacher-id");
  await signOut(auth);
}
