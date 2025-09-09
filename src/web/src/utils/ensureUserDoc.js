// src/utils/ensureUserDoc.js
import { auth } from "../firebase";
import {
  getFirestore, doc, getDoc, setDoc, serverTimestamp,
} from "firebase/firestore";

/** Create users/{uid} if missing (defaults role to "user"). */
export async function ensureUserDoc(u) {
  if (!u) return;
  const db = getFirestore(auth.app);
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);

  const base = {
    email: u.email ?? null,
    name: u.displayName ?? "",
    emailVerified: !!u.emailVerified,
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    await setDoc(ref, { ...base, role: "user", createdAt: serverTimestamp() });
  } else {
    // merge so you never overwrite role
    await setDoc(ref, base, { merge: true });
  }
}
