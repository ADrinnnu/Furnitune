// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// ---- Fallback config (safe to publish; Firebase web config is public) ----
const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCYHjH1hIdCFyyOgCzjwxMf3KsZ0yXtHSM",
  authDomain: "furnitune-64458.firebaseapp.com",
  projectId: "furnitune-64458",
  // bucket name (NOT the download domain)
  storageBucket: "furnitune-64458.appspot.com",
  messagingSenderId: "533053483607",
  appId: "1:533053483607:web:1b745e49e508aa438a1112",
  measurementId: "G-GE7DYZWPW7",
};

// Prefer env → then fallback
function loadFirebaseConfig() {
  // 1) JSON blob
  const raw = import.meta?.env?.VITE_FIREBASE_CONFIG;
  if (raw) {
    try {
      const cfg = JSON.parse(raw);
      if (cfg?.apiKey) return cfg;
    } catch {}
  }
  // 2) Per-key
  const k = (n) => import.meta?.env?.[`VITE_FB_${n}`];
  const perKey = {
    apiKey: k("API_KEY"),
    authDomain: k("AUTH_DOMAIN"),
    projectId: k("PROJECT_ID"),
    storageBucket: k("STORAGE_BUCKET"),
    messagingSenderId: k("MESSAGING_SENDER_ID"),
    appId: k("APP_ID"),
    measurementId: k("MEASUREMENT_ID"),
  };
  if (perKey.apiKey) return perKey;

  // 3) Fallback
  return DEFAULT_FIREBASE_CONFIG;
}

const firebaseConfig = loadFirebaseConfig();
export const app = initializeApp(firebaseConfig);

// Core services
export const auth = getAuth(app);
export const firestore = getFirestore(app);
// Default bucket comes from config; no need to pass a URL
export const storage = getStorage(app);

// If you like re-exporting Firestore/Storage helpers from here, keep doing it:
export {
  // Firestore
  collection, query, where, getDocs, orderBy, startAt, endAt, limit,
  doc, getDoc, updateDoc, serverTimestamp, onSnapshot,
} from "firebase/firestore";

export { ref, getDownloadURL, uploadBytes } from "firebase/storage";
