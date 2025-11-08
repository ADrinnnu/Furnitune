// src/web/src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const NEW_BUCKET = "furnitune-64458.firebasestorage.app";

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyCYHjH1hIdCFyyOgCzjwxMf3KsZ0yXtHSM",
  authDomain: "furnitune-64458.firebaseapp.com",
  projectId: "furnitune-64458",
  storageBucket: NEW_BUCKET,
  messagingSenderId: "533053483607",
  appId: "1:533053483607:web:1b745e49e508aa438a1112",
  measurementId: "G-GE7DYZWPW7",
};

function normalizeConfig(cfg) {
  const copy = { ...cfg };
  if (!copy.storageBucket || /appspot\.com$/i.test(copy.storageBucket)) {
    copy.storageBucket = NEW_BUCKET;
  }
  return copy;
}

function loadFirebaseConfig() {
  // 1) JSON blob env
  const raw = import.meta?.env?.VITE_FIREBASE_CONFIG;
  if (raw) {
    try {
      const cfg = JSON.parse(raw);
      if (cfg?.apiKey) return normalizeConfig(cfg);
    } catch { /* ignore and fall through */ }
  }

  // 2) Per-key envs
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
  if (perKey.apiKey) return normalizeConfig(perKey);

  // 3) Default
  return normalizeConfig(DEFAULT_FIREBASE_CONFIG);
}

export const app = initializeApp(loadFirebaseConfig());

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const storage = getStorage(app);

// (re-exports)
export {
  collection, query, where, getDocs, orderBy, startAt, endAt, limit,
  doc, getDoc, updateDoc, serverTimestamp, onSnapshot,
} from "firebase/firestore";
export { ref, getDownloadURL, uploadBytes } from "firebase/storage";
