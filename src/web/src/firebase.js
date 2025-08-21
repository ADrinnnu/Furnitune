// src/firebase.js (or keep firebase.jsx, just import the same path)
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: "AIzaSyCYHjH1hIdCFyyOgCzjwxMf3KsZ0yXtHSM",
  authDomain: "furnitune-64458.firebaseapp.com",
  projectId: "furnitune-64458",
  // For Firebase Storage, the typical bucket looks like "<project-id>.appspot.com"
  // storageBucket: "furnitune-64458.appspot.com",
  storageBucket: "furnitune-64458.firebasestorage.app", // if this is what your console shows, it’s fine
  messagingSenderId: "533053483607",
  appId: "1:533053483607:web:1b745e49e508aa438a1112",
  measurementId: "G-GE7DYZWPW7",
};

const app = initializeApp(firebaseConfig);

// ✅ export a single shared Auth instance
export const auth = getAuth(app);

// (optional) Analytics — guard so it won't throw during SSR or some dev setups
try {
  if (typeof window !== "undefined") {
    getAnalytics(app);
  }
} catch { /* ignore analytics errors in dev */ }

// (optional) export app if you need it elsewhere
export { app };
