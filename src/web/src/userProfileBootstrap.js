// src/userProfileBootstrap.js
import { auth } from "./firebase";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

const db = getFirestore(auth.app);

onAuthStateChanged(auth, async (user) => {
  if (!user) return;

  const ref = doc(db, "users", user.uid);

  try {
    const snap = await getDoc(ref);
    const providerId = user.providerData?.[0]?.providerId || "password";

    // ----------------- FIRST TIME: CREATE DOC -----------------
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email: user.email || "",
        name:
          user.displayName ||
          (user.email ? user.email.split("@")[0] : "") ||
          "",
        emailVerified: !!user.emailVerified,
        provider: providerId,     // e.g. "google.com"
        source: "web",            // or "app" in your mobile app
        role: "user",             // default role only ONCE
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    // ----------------- LATER LOGINS: DO NOT TOUCH ROLE/SOURCE -----------------
    await setDoc(
      ref,
      {
        email: user.email || "",
        name:
          user.displayName ||
          (user.email ? user.email.split("@")[0] : "") ||
          "",
        emailVerified: !!user.emailVerified,
        provider: providerId,
        updatedAt: serverTimestamp(),
      },
      { merge: true } // merges ONLY these fields, no role/source here
    );
  } catch (e) {
    console.error("Failed to upsert user profile", e);
  }
});
