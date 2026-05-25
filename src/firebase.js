import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
  collection,
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
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB05xpbwDzS14JbUpdm6fzUNO-6TVdIXBA",
  authDomain: "startup-5ec16.firebaseapp.com",
  projectId: "startup-5ec16",
  storageBucket: "startup-5ec16.firebasestorage.app",
  messagingSenderId: "830776008616",
  appId: "1:830776008616:web:b087a85e6978b42cda879d"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export {
  collection,
  doc,
  getDoc,
  getDocs,
  onAuthStateChanged,
  onSnapshot,
  setDoc,
  signInAnonymously,
  updateDoc,
  writeBatch
};


