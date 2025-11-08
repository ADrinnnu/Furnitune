// src/utils/ensureUserDoc.js
import { auth } from "../firebase";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";

/**
 * Create profile only when allowed; never resurrect by default.
 */
export async function ensureUserDoc(u, opts = {}) {
  if (!u) return;
  const {
    source,                // "web" | "app" (only used on create)
    createIfMissing = false, // default: DO NOT create if missing
    touch = false,           // default: do not update if exists
    extra = {},              // extra fields for create
  } = opts;

  const db = getFirestore(auth.app);
  const ref = doc(db, "users", u.uid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    if (!createIfMissing) return;          // ← critical: no resurrection
    const provider = u.providerData?.[0]?.providerId?.replace(".com", "") || "password";
    await setDoc(ref, {
      uid: u.uid,
      email: u.email ?? "",
      name: u.displayName ?? "",
      photo: u.photoURL ?? "",
      emailVerified: !!u.emailVerified,
      provider,
      source: source || undefined,         // "web" or "app"
      role: "user",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...extra,
    });
    return;
  }

  if (touch) {                              // optional lightweight bump
    await updateDoc(ref, { updatedAt: serverTimestamp() }).catch(() => {});
    return;
  }

  // Optional small merge (won't touch role/source)
  await setDoc(ref, {
    email: u.email ?? null,
    name: u.displayName ?? "",
    emailVerified: !!u.emailVerified,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
