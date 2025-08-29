// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";   // ✅ only Firestore for now

const firebaseConfig = {
  apiKey: "AIzaSyCYHjH1hIdCFyyOgCzjwxMf3KsZ0yXtHSM",
  authDomain: "furnitune-64458.firebaseapp.com",
  projectId: "furnitune-64458",
  storageBucket: "furnitune-64458.firebasestorage.app", // OK to keep; unused for now
  messagingSenderId: "533053483607",
  appId: "1:533053483607:web:1b745e49e508aa438a1112",
  measurementId: "G-GE7DYZWPW7",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);                 // ✅ this is the one the seeder needs

try { if (typeof window !== "undefined") getAnalytics(app); } catch {}
export { app };
