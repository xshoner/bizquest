import { useEffect, useMemo, useState } from "react";
import {
  auth,
  createUserWithEmailAndPassword,
  db,
  doc,
  onAuthStateChanged,
  secondaryAuth,
  setDoc,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "../firebase.js";

const TEACHER_REGISTRY_KEY = "bizquest-teacher-registry";
const TEACHER_SESSION_KEY = "bizquest-teacher-session-active";

export function idToAuthEmail(id) {
  const normalized = String(id || "").trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@bizquest.local`;
}

function sanitizeTeacherId(id) {
  return String(id || "").trim().replace(/\s+/g, "");
}

function markTeacherSession() {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(TEACHER_SESSION_KEY, "true");
  }
}

function clearTeacherSession() {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(TEACHER_SESSION_KEY);
  }
}

function hasTeacherSession() {
  if (typeof window === "undefined") return false;
  return window.sessionStorage.getItem(TEACHER_SESSION_KEY) === "true";
}

function authErrorMessage(err, fallback = "처리 중 오류가 발생했습니다.") {
  if (err?.code === "auth/email-already-in-use") {
    return "이미 사용 중인 아이디입니다. 기존 계정이면 로그인하세요.";
  }
  if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-email"].includes(err?.code)) {
    return "아이디 또는 비밀번호가 올바르지 않습니다.";
  }
  if (err?.code === "auth/weak-password") {
    return "비밀번호는 8자리 이상으로 입력하세요.";
  }
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

export function useTeacherAuth() {
  const [user, setUser] = useState(null);
  const [teacherId, setTeacherId] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser && !nextUser.isAnonymous && !hasTeacherSession()) {
        await signOut(auth).catch(() => {});
        localStorage.removeItem("bizquest-teacher-id");
        setUser(null);
        setTeacherId("");
        setReady(true);
        return;
      }

      setUser(nextUser && !nextUser.isAnonymous ? nextUser : null);
      setTeacherId(nextUser && !nextUser.isAnonymous ? nextUser.displayName || localStorage.getItem("bizquest-teacher-id") || "" : "");
      setReady(true);
    });
    return () => unsubscribe();
  }, []);

  return useMemo(() => ({ user, teacherId, ready, loggedIn: Boolean(user) }), [ready, teacherId, user]);
}

export async function loginTeacher(id, password) {
  const teacherId = sanitizeTeacherId(id);
  if (!teacherId || !password) throw new Error("아이디와 비밀번호를 입력하세요.");
  markTeacherSession();
  try {
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
    clearTeacherSession();
    throw new Error(authErrorMessage(err, "로그인에 실패했습니다."));
  }
}

export async function registerTeacher({ id, email, password, createdBy = "self", authInstance = auth }) {
  const teacherId = sanitizeTeacherId(id);
  if (!teacherId || !email || !password) throw new Error("id, pw, 이메일 주소를 모두 입력하세요.");
  validateTeacherPassword(password);
  if (authInstance === auth) markTeacherSession();
  try {
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
    rememberTeacher(profile);
    if (authInstance === auth) {
      localStorage.setItem("bizquest-teacher-id", teacherId);
    }
    return { user: credential.user, profile };
  } catch (err) {
    if (authInstance === auth) clearTeacherSession();
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
      createdAt: Date.now(),
      password: payload.password
    };
    await setDoc(doc(db, "users", adminUser.uid, "managedUsers", credential.user.uid), profile);
    rememberTeacher(profile);
    return { user: credential.user, profile };
  } catch (err) {
    await signOut(secondaryAuth).catch(() => {});
    throw new Error(authErrorMessage(err, "회원 생성에 실패했습니다."));
  }
}

export async function logoutTeacher() {
  clearTeacherSession();
  localStorage.removeItem("bizquest-teacher-id");
  await signOut(auth);
}
