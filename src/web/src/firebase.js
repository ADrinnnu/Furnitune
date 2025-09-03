// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection, query, where, getDocs,
  doc, getDoc,            // ✅ import these
} from "firebase/firestore";
import { getStorage, ref, getDownloadURL } from "firebase/storage";

// IMPORTANT: keep your actual project config here
const firebaseConfig = {
  apiKey: "AIzaSyCYHjH1hIdCFyyOgCzjwxMf3KsZ0yXtHSM",
  authDomain: "furnitune-64458.firebaseapp.com",
  projectId: "furnitune-64458",
  storageBucket: "furnitune-64458.firebasestorage.app",
  messagingSenderId: "533053483607",
  appId: "1:533053483607:web:1b745e49e508aa438a1112",
  measurementId: "G-GE7DYZWPW7",
};

const app = initializeApp(firebaseConfig);

// Services
export const auth = getAuth(app);
export const firestore = getFirestore(app);
export const db = firestore; // alias if you prefer

// Force the bucket explicitly
export const storage = getStorage(app, "gs://furnitune-64458.firebasestorage.app");

// Re-export helpers so other files can `import { doc, getDoc, ... } from "../firebase"`
export { collection, query, where, getDocs, doc, getDoc, ref, getDownloadURL };
