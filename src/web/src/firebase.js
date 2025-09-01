// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, doc, getDoc } from "firebase/firestore"; // Import Firestore helpers
import { getStorage, ref, getDownloadURL } from "firebase/storage"; // Import Storage helpers

// Firebase configuration (use your actual Firebase config)
const firebaseConfig = {
  apiKey: "AIzaSyCYHjH1hIdCFyyOgCzjwxMf3KsZ0yXtHSM",
  authDomain: "furnitune-64458.firebaseapp.com",
  projectId: "furnitune-64458",
  storageBucket: "furnitune-64458.appspot.com",
  messagingSenderId: "533053483607",
  appId: "1:533053483607:web:1b745e49e508aa438a1112",
  measurementId: "G-GE7DYZWPW7",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const firestore = getFirestore(app);  // Firestore setup
export const storage = getStorage(app);  // Firebase Storage setup

// Export Firestore and Storage helpers to be used in other parts of the app
export { doc, getDoc, ref, getDownloadURL };
