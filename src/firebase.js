import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  collection,
  deleteDoc,
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
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
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

export {
  collection,
  createUserWithEmailAndPassword,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onAuthStateChanged,
  onSnapshot,
  setDoc,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  updateDoc,
  updateProfile,
  writeBatch
};
