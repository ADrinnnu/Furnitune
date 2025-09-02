// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore";
import { getStorage, ref, getDownloadURL } from "firebase/storage";

// IMPORTANT: use the firebasestorage.app bucket, not appspot.com
const firebaseConfig = {
  apiKey: "AIzaSyCYHjH1hIdCFyyOgCzjwxMf3KsZ0yXtHSM",
  authDomain: "furnitune-64458.firebaseapp.com",
  projectId: "furnitune-64458",
  storageBucket: "furnitune-64458.firebasestorage.app",   // <-- changed
  messagingSenderId: "533053483607",
  appId: "1:533053483607:web:1b745e49e508aa438a1112",
  measurementId: "G-GE7DYZWPW7",
};

const app = initializeApp(firebaseConfig);

// Services
export const auth = getAuth(app);
export const firestore = getFirestore(app);

// Force the bucket explicitly (belt & suspenders)
export const storage = getStorage(
  app,
  "gs://furnitune-64458.firebasestorage.app"
);

// Re-export helpers for convenience
export { doc, getDoc, ref, getDownloadURL };
