// src/userProfileBootstrap.js
import { auth } from "./firebase";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

const db = getFirestore(auth.app);

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  const providerId = user.providerData?.[0]?.providerId || "password";

  try {
    await setDoc(
      doc(db, "users", user.uid),
      {
        uid: user.uid,
        email: user.email || "",
        name:
          user.displayName ||
          (user.email ? user.email.split("@")[0] : "") ||
          "",
        emailVerified: !!user.emailVerified,
        provider: providerId,          // e.g. "google.com"
        source: "web",                 // or "app" in your mobile app
        role: "user",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true } // don't overwrite existing role when you edit in admin
    );
  } catch (e) {
    console.error("Failed to upsert user profile", e);
  }
});
