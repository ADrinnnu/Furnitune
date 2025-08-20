// src/firebase/index.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const cfgStr = import.meta.env.VITE_FIREBASE_CONFIG || "";
let app = null, db = null, storage = null;

if (cfgStr) {
  try {
    const cfg = JSON.parse(cfgStr);
    app = initializeApp(cfg);
    db = getFirestore(app);
    storage = getStorage(app);
  } catch (e) {
    console.warn("Invalid VITE_FIREBASE_CONFIG JSON. Using mock data.", e);
  }
}

export const usingFirebase = !!app;
export { app, db, storage };
