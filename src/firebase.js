import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyB05xpbwDzS14JbUpdm6fzUNO-6TVdIXBA",
  authDomain: "startup-5ec16.firebaseapp.com",
  projectId: "startup-5ec16",
  storageBucket: "startup-5ec16.firebasestorage.app",
  messagingSenderId: "830776008616",
  appId: "1:830776008616:web:b087a85e6978b42cda879d"
};

const app = initializeApp(firebaseConfig);
const secondaryApp = getApps().find((item) => item.name === "secondary-auth") || initializeApp(firebaseConfig, "secondary-auth");

export const db = getFirestore(app);
export const auth = getAuth(app);
export const secondaryAuth = getAuth(secondaryApp);

/** Returns a fresh Firebase ID token for the signed-in user (used to authenticate server calls). */
export async function getCurrentIdToken(forceRefresh = false) {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  return user.getIdToken(forceRefresh);
}

export {
  browserLocalPersistence,
  collection,
  createUserWithEmailAndPassword,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onAuthStateChanged,
  onSnapshot,
  setPersistence,
  setDoc,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
  updateProfile,
  writeBatch
};
